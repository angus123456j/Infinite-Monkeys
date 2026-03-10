import express, { Request, Response, NextFunction } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import rateLimit from "express-rate-limit";
import cors from "cors";
import dotenv from "dotenv";
import { prisma } from "./db.js";

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3001;

// Environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SHARED_SECRET = process.env.SHARED_SECRET;

// Validate required environment variables
if (!GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY environment variable is required");
  console.error("Set it in your .env file or environment");
  process.exit(1);
}

// Initialize Google Gemini client
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP
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
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.json(doc);
  } catch (error: any) {
    console.error("Error fetching document:", error);
    res.status(500).json({ error: "Failed to fetch document" });
  }
});

app.patch("/api/documents/:id", async (req: Request, res: Response) => {
  try {
    const { title, content, folderId } = req.body;
    const data: { title?: string; content?: string; folderId?: string | null } = {};
    if (title !== undefined) data.title = String(title);
    if (content !== undefined) data.content = String(content);
    if (folderId !== undefined) data.folderId = folderId == null || folderId === "" ? null : String(folderId);
    const doc = await prisma.document.update({
      where: { id: req.params.id },
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
    await prisma.document.delete({ where: { id: req.params.id } });
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
    const item = await prisma.context.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: "Context not found" });
    res.json(item);
  } catch (error: any) {
    console.error("Error fetching context:", error);
    res.status(500).json({ error: "Failed to fetch context" });
  }
});

app.patch("/api/contexts/:id", async (req: Request, res: Response) => {
  try {
    const { title, description, tags, lastUsedAt } = req.body;
    const data: { title?: string; description?: string; tags?: unknown; lastUsedAt?: Date | null } = {};
    if (title !== undefined) data.title = String(title).trim();
    if (description !== undefined) data.description = String(description);
    if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : undefined;
    if (lastUsedAt !== undefined) data.lastUsedAt = lastUsedAt == null ? null : new Date(lastUsedAt);
    const item = await prisma.context.update({
      where: { id: req.params.id },
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
    await prisma.context.delete({ where: { id: req.params.id } });
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
    const item = await prisma.monkeyAgent.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: "Agent not found" });
    res.json(item);
  } catch (error: any) {
    console.error("Error fetching agent:", error);
    res.status(500).json({ error: "Failed to fetch agent" });
  }
});

app.patch("/api/agents/:id", async (req: Request, res: Response) => {
  try {
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
      where: { id: req.params.id },
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
    await prisma.monkeyAgent.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error: any) {
    if (error?.code === "P2025") return res.status(404).json({ error: "Agent not found" });
    console.error("Error deleting agent:", error);
    res.status(500).json({ error: "Failed to delete agent" });
  }
});

// Rewrite endpoint
app.post(
  "/api/rewrite",
  limiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { text, prompt } = req.body;

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

      // Call Google Gemini API
      // Using gemini-2.5-flash (confirmed working model)
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
        systemInstruction: `You are a helpful writing assistant. Rewrite the provided text according to the user's instructions. 
Return only the rewritten text, without explanations or meta-commentary. 
Preserve the meaning and intent while improving clarity, style, or following the specific instructions given.`
      });

      const userPrompt = `Text to rewrite:\n\n${text}\n\nUser instruction: ${prompt}\n\nPlease rewrite the text according to the instruction.`;

      const result = await model.generateContent(userPrompt);
      const response = result.response;
      const rewrite = response.text();

      // Return the rewrite
      res.json({
        rewrite,
      });
    } catch (error: any) {
      console.error("Error calling Gemini API:", error);

      // Handle specific Gemini API errors
      if (error.status === 401 || error.status === 403) {
        return res.status(500).json({
          error: "Invalid API key. Please check GEMINI_API_KEY environment variable.",
        });
      }

      if (error.status === 404) {
        // Model not found - try to provide helpful error
        return res.status(500).json({
          error: "Model not found. The model name may be incorrect or not available in your region.",
          details: error.message || "Try checking available models in Google AI Studio.",
          suggestion: "Available models might be: gemini-1.5-flash-latest, gemini-1.5-pro-latest, or gemini-pro"
        });
      }

      if (error.status === 429) {
        return res.status(429).json({
          error: "Rate limit exceeded. Please try again later.",
        });
      }

      if (error.status === 400) {
        return res.status(400).json({
          error: "Invalid request to Gemini API",
          details: error.message,
        });
      }

      // Generic error
      return res.status(500).json({
        error: "Failed to generate rewrite",
        details: error.message || "Unknown error",
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Environment: ${SHARED_SECRET ? "Authentication enabled" : "No authentication (local dev)"}`);
});
