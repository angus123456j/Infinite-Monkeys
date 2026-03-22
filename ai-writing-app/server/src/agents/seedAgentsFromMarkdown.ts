import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "../generated/prisma/client.js";

export interface SeedAgentsResult {
  created: number;
  updated: number;
  deletedPlaceholders: number;
  skipped: number;
}

type AgentShape = {
  name: string;
  role: string;
  strengths: string;
  identity: string;
  behavior: string;
  constraints: string;
};

function section(md: string, heading: string): string {
  const re = new RegExp(
    String.raw`^##\s+${heading}\s*$([\s\S]*?)(?=^##\s+|\s*$)`,
    "mi"
  );
  const m = md.match(re);
  return (m?.[1] ?? "").trim();
}

function parseAgentMarkdown(md: string): AgentShape | null {
  const nameMatch = md.match(/^#\s+(.+)\s*$/m);
  const name = (nameMatch?.[1] ?? "").trim();
  if (!name) return null;

  const role = section(md, "Role") || "Generalist";
  const strengths = section(md, "Strengths");
  const identity = section(md, "Identity");
  const behavior = section(md, "Behavior");
  const constraints = section(md, "Constraints");

  // If the file is missing the key sections, treat as not-an-agent template.
  const hasAny = [strengths, identity, behavior, constraints].some((s) => s.trim().length > 0);
  if (!hasAny) return null;

  return {
    name,
    role,
    strengths,
    identity,
    behavior,
    constraints,
  };
}

function buildDefaultPrompt(a: AgentShape): string {
  const parts: string[] = [];
  if (a.identity.trim()) parts.push(`Identity:\n${a.identity.trim()}`);
  if (a.behavior.trim()) parts.push(`Behavior:\n${a.behavior.trim()}`);
  if (a.constraints.trim()) parts.push(`Constraints:\n${a.constraints.trim()}`);
  return parts.join("\n\n");
}

export async function seedAgentsFromMarkdown(prisma: PrismaClient): Promise<SeedAgentsResult> {
  // Delete *only* clearly placeholder agents created by the UI defaults.
  const deleted = await prisma.monkeyAgent.deleteMany({
    where: {
      name: "New monkey",
      role: "Generalist",
      strengths: "",
      identity: "",
      behavior: "",
      constraints: "",
      defaultPrompt: "",
    },
  });

  // Resolve relative to server working directory so it works in both `src` and `dist`.
  // (In production builds, `import.meta.url` points at `dist/`, but the markdown lives in repo root.)
  const agentsDir = path.resolve(process.cwd(), "monkey-agents");

  let entries: string[] = [];
  try {
    entries = await readdir(agentsDir);
  } catch {
    return { created: 0, updated: 0, deletedPlaceholders: deleted.count, skipped: 0 };
  }

  const mdFiles = entries.filter((f) => f.toLowerCase().endsWith(".md"));
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of mdFiles) {
    const full = path.join(agentsDir, file);
    const md = await readFile(full, "utf8");
    const parsed = parseAgentMarkdown(md);
    if (!parsed) {
      skipped++;
      continue;
    }

    const defaultPrompt = buildDefaultPrompt(parsed);
    const existing = await prisma.monkeyAgent.findFirst({ where: { name: parsed.name } });
    if (!existing) {
      await prisma.monkeyAgent.create({
        data: {
          name: parsed.name,
          role: parsed.role,
          strengths: parsed.strengths,
          avatar: null,
          defaultPrompt,
          identity: parsed.identity,
          behavior: parsed.behavior,
          constraints: parsed.constraints,
        },
      });
      created++;
      continue;
    }

    const next = {
      role: parsed.role,
      strengths: parsed.strengths,
      defaultPrompt,
      identity: parsed.identity,
      behavior: parsed.behavior,
      constraints: parsed.constraints,
    };

    const changed =
      existing.role !== next.role ||
      existing.strengths !== next.strengths ||
      existing.defaultPrompt !== next.defaultPrompt ||
      existing.identity !== next.identity ||
      existing.behavior !== next.behavior ||
      existing.constraints !== next.constraints;

    if (!changed) {
      skipped++;
      continue;
    }

    await prisma.monkeyAgent.update({
      where: { id: existing.id },
      data: next,
    });
    updated++;
  }

  return { created, updated, deletedPlaceholders: deleted.count, skipped };
}

