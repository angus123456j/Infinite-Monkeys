import { prisma } from "./db.js";
import express, { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { seedAgentsFromMarkdown } from "./agents/seedAgentsFromMarkdown.js";
import { createLlmClients, getHttpStatusDeep, type LlmProviderMode } from "./llm.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

// Environment variables — Gemini first; DeepSeek optional fallback when quota/rate limits hit
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim();
const SHARED_SECRET = process.env.SHARED_SECRET;

if (!GEMINI_API_KEY && !DEEPSEEK_API_KEY) {
  console.error("ERROR: Set at least one of GEMINI_API_KEY or DEEPSEEK_API_KEY in .env");
  process.exit(1);
}

const llm = createLlmClients({
  geminiApiKey: GEMINI_API_KEY || undefined,
  deepseekApiKey: DEEPSEEK_API_KEY || undefined,
});

if (GEMINI_API_KEY && DEEPSEEK_API_KEY) {
  console.log("[llm] Gemini primary; DeepSeek fallback enabled");
} else if (DEEPSEEK_API_KEY && !GEMINI_API_KEY) {
  console.log("[llm] DeepSeek only (no GEMINI_API_KEY)");
} else {
  console.log("[llm] Gemini only (add DEEPSEEK_API_KEY for quota fallback)");
}
if (GEMINI_API_KEY && !DEEPSEEK_API_KEY) {
  console.warn("[llm] WARNING: DEEPSEEK_API_KEY missing — no fallback when Gemini fails");
}

// CORS configuration - allow requests from client
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "X-Shared-Secret"],
  })
);

app.use(express.json());

// Seed/Sync monkey agents from markdown templates (and remove placeholders)
seedAgentsFromMarkdown(prisma)
  .then((r) => {
    if (r.created || r.updated || r.deletedPlaceholders) {
      console.log(
        `[agents] synced from markdown: created=${r.created} updated=${r.updated} deletedPlaceholders=${r.deletedPlaceholders} skipped=${r.skipped}`
      );
    }
  })
  .catch((err) => {
    console.error("[agents] failed to sync from markdown:", err);
  });

// Rate limiting (generous in dev so /api/rewrite isn't 429 before the LLM runs)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 60 : 400,
  message: {
    error: "Too many requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication middleware (optional - only if SHARED_SECRET is set)
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!SHARED_SECRET) {
    // No secret configured, allow all requests (for local development)
    return next();
  }

  const providedSecret = req.headers["x-shared-secret"];
  if (providedSecret !== SHARED_SECRET) {
    return res.status(401).json({
      error: "Unauthorized. Invalid or missing X-Shared-Secret header.",
    });
  }

  next();
};

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Simple documents API (backed by MySQL)
app.get("/api/documents", async (_req: Request, res: Response) => {
  try {
    const documents = await prisma.document.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(documents);
  } catch (error: any) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

app.post(
  "/api/documents",
  limiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { title, content, folderId } = req.body;

      if (!title || typeof title !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'title'" });
      }
      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'content'" });
      }

      const document = await prisma.document.create({
        data: {
          title,
          content,
          folderId: folderId == null || folderId === "" ? null : String(folderId),
        },
      });

      res.status(201).json(document);
    } catch (error: any) {
      console.error("Error creating document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  }
);

app.get("/api/documents/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.json(doc);
  } catch (error: any) {
    console.error("Error fetching document:", error);
    res.status(500).json({ error: "Failed to fetch document" });
  }
});

app.patch("/api/documents/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { title, content, folderId } = req.body;
    const data: { title?: string; content?: string; folderId?: string | null } = {};
    if (title !== undefined) data.title = String(title);
    if (content !== undefined) data.content = String(content);
    if (folderId !== undefined) data.folderId = folderId == null || folderId === "" ? null : String(folderId);
    const doc = await prisma.document.update({
      where: { id },
      data,
    });
    res.json(doc);
  } catch (error: any) {
    if (error?.code === "P2025") return res.status(404).json({ error: "Document not found" });
    console.error("Error updating document:", error);
    res.status(500).json({ error: "Failed to update document" });
  }
});

app.delete("/api/documents/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.document.delete({ where: { id } });
    res.status(204).send();
  } catch (error: any) {
    if (error?.code === "P2025") return res.status(404).json({ error: "Document not found" });
    console.error("Error deleting document:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

// Context API (same shape as documents: list + create; plus get/update/delete)
app.get("/api/contexts", async (_req: Request, res: Response) => {
  try {
    const items = await prisma.context.findMany({
      orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
    });
    res.json(items);
  } catch (error: any) {
    console.error("Error fetching contexts:", error);
    res.status(500).json({ error: "Failed to fetch contexts" });
  }
});

app.post(
  "/api/contexts",
  limiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { title, description, tags } = req.body;
      const titleStr = title != null ? String(title).trim() : "Untitled context";
      const descriptionStr = description != null ? String(description) : "";
      const tagsVal = Array.isArray(tags) ? tags : [];
      const context = await prisma.context.create({
        data: {
          title: titleStr,
          description: descriptionStr,
          tags: tagsVal,
        },
      });
      res.status(201).json(context);
    } catch (error: any) {
      console.error("Error creating context:", error);
      res.status(500).json({ error: "Failed to create context" });
    }
  }
);

app.get("/api/contexts/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const item = await prisma.context.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: "Context not found" });
    res.json(item);
  } catch (error: any) {
    console.error("Error fetching context:", error);
    res.status(500).json({ error: "Failed to fetch context" });
  }
});

app.patch("/api/contexts/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { title, description, tags, lastUsedAt } = req.body;
    const data: Parameters<typeof prisma.context.update>[0]["data"] = {};
    if (title !== undefined) data.title = String(title).trim();
    if (description !== undefined) data.description = String(description);
    if (tags !== undefined) data.tags = Array.isArray(tags) ? (tags as any) : undefined;
    if (lastUsedAt !== undefined) data.lastUsedAt = lastUsedAt == null ? null : new Date(lastUsedAt);
    const item = await prisma.context.update({
      where: { id },
      data,
    });
    res.json(item);
  } catch (error: any) {
    if (error?.code === "P2025") return res.status(404).json({ error: "Context not found" });
    console.error("Error updating context:", error);
    res.status(500).json({ error: "Failed to update context" });
  }
});

app.delete("/api/contexts/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.context.delete({ where: { id } });
    res.status(204).send();
  } catch (error: any) {
    if (error?.code === "P2025") return res.status(404).json({ error: "Context not found" });
    console.error("Error deleting context:", error);
    res.status(500).json({ error: "Failed to delete context" });
  }
});

// Monkey agents API (structured columns)
app.get("/api/agents", async (_req: Request, res: Response) => {
  try {
    const items = await prisma.monkeyAgent.findMany({
      orderBy: { updatedAt: "desc" },
    });
    res.json(items);
  } catch (error: any) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

app.post(
  "/api/agents",
  limiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { name, role, strengths, avatar, defaultPrompt, identity, behavior, constraints } = req.body;
      const identityStr = identity != null ? String(identity) : "";
      const behaviorStr = behavior != null ? String(behavior) : "";
      const constraintsStr = constraints != null ? String(constraints) : "";
      const defaultPromptVal =
        defaultPrompt != null && defaultPrompt !== ""
          ? String(defaultPrompt)
          : [identityStr && `Identity:\n${identityStr.trim()}`, behaviorStr && `Behavior:\n${behaviorStr.trim()}`, constraintsStr && `Constraints:\n${constraintsStr.trim()}`]
              .filter(Boolean)
              .join("\n\n");
      const agent = await prisma.monkeyAgent.create({
        data: {
          name: name != null ? String(name).trim() : "New monkey",
          role: role != null ? String(role) : "Generalist",
          strengths: strengths != null ? String(strengths) : "",
          avatar: avatar != null ? String(avatar) : null,
          defaultPrompt: defaultPromptVal,
          identity: identityStr,
          behavior: behaviorStr,
          constraints: constraintsStr,
        },
      });
      res.status(201).json(agent);
    } catch (error: any) {
      console.error("Error creating agent:", error);
      res.status(500).json({ error: "Failed to create agent" });
    }
  }
);

app.get("/api/agents/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const item = await prisma.monkeyAgent.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ error: "Agent not found" });
    res.json(item);
  } catch (error: any) {
    console.error("Error fetching agent:", error);
    res.status(500).json({ error: "Failed to fetch agent" });
  }
});

app.patch("/api/agents/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, role, strengths, avatar, defaultPrompt, identity, behavior, constraints } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (role !== undefined) data.role = String(role);
    if (strengths !== undefined) data.strengths = String(strengths);
    if (avatar !== undefined) data.avatar = avatar == null ? null : String(avatar);
    if (identity !== undefined) data.identity = String(identity);
    if (behavior !== undefined) data.behavior = String(behavior);
    if (constraints !== undefined) data.constraints = String(constraints);
    if (defaultPrompt !== undefined) data.defaultPrompt = String(defaultPrompt);
    const item = await prisma.monkeyAgent.update({
      where: { id },
      data: data as Parameters<typeof prisma.monkeyAgent.update>[0]["data"],
    });
    res.json(item);
  } catch (error: any) {
    if (error?.code === "P2025") return res.status(404).json({ error: "Agent not found" });
    console.error("Error updating agent:", error);
    res.status(500).json({ error: "Failed to update agent" });
  }
});

app.delete("/api/agents/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.monkeyAgent.delete({ where: { id } });
    res.status(204).send();
  } catch (error: any) {
    if (error?.code === "P2025") return res.status(404).json({ error: "Agent not found" });
    console.error("Error deleting agent:", error);
    res.status(500).json({ error: "Failed to delete agent" });
  }
});

// Agent search (semantic ranking)
app.post(
  "/api/agents/search",
  limiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const query = req.body?.query;
      const topKRaw = req.body?.topK;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Missing or invalid 'query' field" });
      }

      const topK =
        typeof topKRaw === "number" && Number.isFinite(topKRaw)
          ? Math.max(1, Math.min(15, Math.floor(topKRaw)))
          : 8;

      const allAgents = await prisma.monkeyAgent.findMany({
        select: {
          id: true,
          name: true,
          role: true,
          strengths: true,
          identity: true,
          behavior: true,
          constraints: true,
        },
        orderBy: { updatedAt: "desc" },
      });

      if (!allAgents.length) {
        return res.json({ matches: [] as Array<{ id: string; score: number }> });
      }

      const truncate = (s: string, max: number) =>
        s && s.length > max ? `${s.slice(0, max)}…` : s;

      // Keep the prompt compact. (If you add many agents later, this will matter.)
      const agentsForPrompt = allAgents.slice(0, 60).map((a) => ({
        id: a.id,
        name: a.name,
        role: truncate(a.role ?? "", 80),
        strengths: truncate(a.strengths ?? "", 220),
        identity: truncate(a.identity ?? "", 220),
        behavior: truncate(a.behavior ?? "", 220),
        constraints: truncate(a.constraints ?? "", 220),
      }));

      const systemInstruction =
        `You are an agent search engine for a writing application.\n` +
        `Given a user's description of the kind of monkey they want, you must rank the best matching agents.\n` +
        `Return ONLY valid JSON in the exact format:\n` +
        `{\n  "matches": [ { "id": "<agentId>", "score": <number 0..100> }, ... ]\n}\n` +
        `- score reflects match confidence (higher is better)\n` +
        `- Include at most ${topK} matches\n` +
        `- Do not include explanations or any other keys\n` +
        `- IDs must be from the provided agent list\n`;

      const userPrompt = `User description:\n${query}\n\n` +
        `Agent profiles (pick the best matches):\n` +
        `${JSON.stringify(agentsForPrompt)}\n\n` +
        `Rank the agents that best match the user's description.`;

      const text = await llm.generateText(systemInstruction, userPrompt);

      // Try to parse JSON even if the model adds stray text.
      const jsonCandidate = text.match(/\{[\s\S]*\}/)?.[0];
      if (jsonCandidate) {
        const parsed = JSON.parse(jsonCandidate) as {
          matches?: Array<{ id: string; score: number }>;
        };
        const matches = parsed.matches ?? [];
        const validIds = new Set(allAgents.map((a) => a.id));

        const cleaned = matches
          .filter((m) => m && typeof m.id === "string" && typeof m.score === "number")
          .filter((m) => validIds.has(m.id))
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        return res.json({ matches: cleaned });
      }

      // Fallback: lightweight token scoring (prevents empty results if JSON parsing fails)
      const tokens = query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 10);

      const scored = allAgents
        .map((a) => {
          const blob = `${a.name} ${a.role} ${a.strengths} ${a.identity} ${a.behavior} ${a.constraints}`.toLowerCase();
          let score = 0;
          for (const t of tokens) {
            if (!t) continue;
            if (blob.includes(t)) score += Math.min(20, 2 + t.length);
          }
          return { id: a.id, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      return res.json({ matches: scored });
    } catch (error: any) {
      console.error("Error searching agents:", error);
      return res.status(500).json({ error: "Failed to search agents" });
    }
  }
);

// Rewrite endpoint
app.post(
  "/api/rewrite",
  limiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { text, prompt, agentId, contextId, contextIds, sentenceContext } = req.body;

      // Validate request body
      if (!text || typeof text !== "string") {
        return res.status(400).json({
          error: "Missing or invalid 'text' field in request body",
        });
      }

      if (!prompt || typeof prompt !== "string") {
        return res.status(400).json({
          error: "Missing or invalid 'prompt' field in request body",
        });
      }

      let loadedAgent: Awaited<
        ReturnType<typeof prisma.monkeyAgent.findUnique>
      > = null;
      if (agentId && typeof agentId === "string") {
        loadedAgent = await prisma.monkeyAgent.findUnique({ where: { id: agentId } });
      }

      const isSynonymSpecialist =
        !!loadedAgent &&
        typeof loadedAgent.name === "string" &&
        (() => {
          const n = loadedAgent.name.toLowerCase();
          return n.includes("synonym sensei") || n.includes("synonym monkey");
        })();

      const sentenceCtx =
        typeof sentenceContext === "string" && sentenceContext.trim()
          ? sentenceContext.trim()
          : "";

      const useSentenceSynonymMode = isSynonymSpecialist && sentenceCtx.length > 0;

      // Build system instruction — inject agent personality when provided
      let systemInstruction = `You are a helpful writing assistant. Rewrite the provided text according to the user's instructions. 
Return only the rewritten text, without explanations or meta-commentary. 
Preserve the meaning and intent while improving clarity, style, or following the specific instructions given.`;

      if (loadedAgent) {
        const parts = [
          `You are "${loadedAgent.name}", a specialist monkey writing agent.`,
          loadedAgent.identity ? `Identity: ${loadedAgent.identity}` : "",
          loadedAgent.role ? `Role: ${loadedAgent.role}` : "",
          loadedAgent.behavior ? `Behavior: ${loadedAgent.behavior}` : "",
          loadedAgent.constraints ? `Constraints: ${loadedAgent.constraints}` : "",
          loadedAgent.strengths ? `Strengths: ${loadedAgent.strengths}` : "",
          "",
          "Rewrite the provided text according to the user's instructions.",
          "Return only the rewritten text, without explanations or meta-commentary.",
        ];
        if (useSentenceSynonymMode) {
          parts.push(
            "",
            "The user message includes a full sentence and a phrase that occurs inside that sentence. The phrase must be replaced using the meaning the phrase has IN THAT SENTENCE. For homonyms (e.g. draft as air current vs document, bank as river vs money), you must use neighboring words to choose the correct sense—never substitute using a different sense. Output ONLY the replacement words that could drop into the same grammatical slot—never a definition, title, gloss, or meta phrase like 'preliminary version' unless it truly fits the slot."
          );
        }
        systemInstruction = parts.filter(Boolean).join("\n");
      }

      // Context documents: support both `contextId` (legacy) and `contextIds` (multi-select).
      const contextIdsArr: string[] = [];
      if (Array.isArray(contextIds)) {
        for (const v of contextIds) {
          if (typeof v === "string" && v.trim()) contextIdsArr.push(v);
        }
      } else if (typeof contextId === "string" && contextId.trim()) {
        contextIdsArr.push(contextId.trim());
      }

      const uniqueContextIds = Array.from(new Set(contextIdsArr)).slice(0, 5);

      let contextBlock = "";
      if (uniqueContextIds.length) {
        try {
          const ctxs = await prisma.context.findMany({
            where: { id: { in: uniqueContextIds } },
          });

          const byId = new Map(ctxs.map((c) => [c.id, c]));

          const ordered = uniqueContextIds
            .map((id) => byId.get(id))
            .filter((x): x is (typeof ctxs)[number] => !!x);

          if (ordered.length) {
            contextBlock = `\n\nContext documents:\n${ordered
              .map((ctx, idx) => {
                const tagsArr = Array.isArray(ctx.tags) ? (ctx.tags as unknown[]) : [];
                const tagsStr =
                  tagsArr.length && tagsArr.every((t) => typeof t === "string")
                    ? `Tags: ${(tagsArr as string[]).join(", ")}`
                    : "";

                const pieces = [
                  `Context document ${idx + 1}:`,
                  ctx.title ? `Title: ${ctx.title}` : "",
                  ctx.description ? `Description: ${ctx.description}` : "",
                  tagsStr,
                ].filter(Boolean);

                return pieces.join("\n");
              })
              .join("\n\n")}`;
          }
        } catch (err) {
          console.error("Failed to load contexts for rewrite:", err);
        }
      }

      const userPrompt = useSentenceSynonymMode
        ? `The phrase to replace appears inside the following sentence (treat the sentence as ground truth for word sense):\n\n"${sentenceCtx}"\n\nExact phrase to replace (substring of that sentence):\n\n${text}${contextBlock}\n\nUser instruction: ${prompt}\n\nReply with ONLY the substitute phrase—plain words, no quotes or asterisks, not the full sentence.`
        : `Text to rewrite:\n\n${text}\n${contextBlock}\n\nUser instruction: ${prompt}\n\nPlease rewrite the text according to the instruction.`;

      const rawLlm = req.body?.llmProvider;
      const llmProvider: LlmProviderMode =
        rawLlm === "gemini" || rawLlm === "deepseek" || rawLlm === "auto"
          ? rawLlm
          : "auto";

      let rewrite = await llm.generateText(systemInstruction, userPrompt, llmProvider);
      if (useSentenceSynonymMode && typeof rewrite === "string") {
        rewrite = rewrite
          .trim()
          .replace(/^\*+|\*+$/g, "")
          .replace(/^["'`]+|["'`]+$/g, "")
          .trim();
      }

      // Return the rewrite
      res.json({
        rewrite,
      });
    } catch (error: any) {
      console.error("Error calling LLM (rewrite):", error);

      const status =
        getHttpStatusDeep(error) ??
        (typeof error?.status === "number" ? error.status : undefined) ??
        (typeof error?.statusCode === "number" ? error.statusCode : undefined);
      const msg = String(error?.message ?? error);

      if (status === 401) {
        return res.status(500).json({
          error:
            "Invalid API key. Check GEMINI_API_KEY and/or DEEPSEEK_API_KEY in your environment.",
        });
      }

      if (status === 404) {
        return res.status(500).json({
          error: "Model not found or unavailable.",
          details: msg,
        });
      }

      if (status === 429) {
        return res.status(429).json({
          error: msg.includes("DeepSeek API")
            ? "DeepSeek rate limit or error. Try again in a moment."
            : "Gemini rate limit or quota exceeded. If this persists, check DeepSeek fallback and server logs.",
          details: msg.slice(0, 400),
        });
      }

      if (status === 400) {
        return res.status(400).json({
          error: "Invalid request to the language model",
          details: msg,
        });
      }

      return res.status(500).json({
        error: "Failed to generate rewrite",
        details: msg || "Unknown error",
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Environment: ${SHARED_SECRET ? "Authentication enabled" : "No authentication (local dev)"}`);
});
