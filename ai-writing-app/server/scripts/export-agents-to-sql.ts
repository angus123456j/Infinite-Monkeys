/**
 * One-time migration script.
 * Reads all MonkeyAgent rows from the existing Prisma/MySQL database
 * and prints PostgreSQL INSERT statements for the Supabase monkey_agents table.
 *
 * Usage:
 *   cd server && npx tsx scripts/export-agents-to-sql.ts > ../supabase/seed-agents.sql
 *
 * Then paste the output into the Supabase SQL Editor.
 */

import "../src/env.js";
import { prisma } from "../src/db.js";

function pgEscape(value: string): string {
  // PostgreSQL standard: double up single quotes, escape backslashes
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function pgLiteral(value: string | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return `'${pgEscape(value)}'`;
}

function pgTimestamp(date: Date): string {
  return `'${date.toISOString()}'::timestamptz`;
}

async function main() {
  const agents = await prisma.monkeyAgent.findMany();

  if (agents.length === 0) {
    console.log("-- No MonkeyAgent rows found in MySQL.");
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`-- Exported ${agents.length} MonkeyAgent row(s) from MySQL`);
  console.log(`-- Generated at ${new Date().toISOString()}`);
  console.log();
  console.log(`BEGIN;`);
  console.log();

  for (const a of agents) {
    const cols = [
      `"id"`,
      `"createdAt"`,
      `"updatedAt"`,
      `"name"`,
      `"role"`,
      `"strengths"`,
      `"avatar"`,
      `"defaultPrompt"`,
      `"identity"`,
      `"behavior"`,
      `"constraints"`,
    ].join(", ");

    const vals = [
      pgLiteral(a.id),
      pgTimestamp(a.createdAt),
      pgTimestamp(a.updatedAt),
      pgLiteral(a.name),
      pgLiteral(a.role),
      pgLiteral(a.strengths),
      pgLiteral(a.avatar),
      pgLiteral(a.defaultPrompt),
      pgLiteral(a.identity),
      pgLiteral(a.behavior),
      pgLiteral(a.constraints),
    ].join(", ");

    console.log(`INSERT INTO "monkey_agents" (${cols})`);
    console.log(`  VALUES (${vals})`);
    console.log(`  ON CONFLICT ("id") DO NOTHING;`);
    console.log();
  }

  console.log(`COMMIT;`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
