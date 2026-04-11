# Coding Session — Raw Transcript Style  
## Infinite Monkeys: Supabase migration, Edge Functions, production deploy

*A high-signal record of an extended pairing session: architecture decisions, phased execution, and shipping. Written for submission context (e.g. YC) — technical, honest, and specific.*

---

### How to read this

Each block is **You** (the builder) and **Response** (the assistant). It’s not a literal chat log; it’s cleaned for clarity and impact, without losing the real back-and-forth.

---

## 1. “Inventory everything, then give me a migration plan — don’t touch code yet.”

**You asked** for a full picture: API routes, DB models, auth, storage, jobs, webhooks, admin logic — then classify what can move to Supabase vs what must stay elsewhere, a **minimum safe migration path** in phases, risks, env vars, and **exact files** that would change. You explicitly wanted **no code edits** until the plan was clear.

**Response** mapped the stack: Express + Prisma/MySQL, optional `X-Shared-Secret`, three standalone tables, Gemini/DeepSeek for rewrite/orchestrator/search, ONNX scrutiny on Node, no user accounts, folders in `localStorage`. Classification: **Postgres + Supabase client + RLS + Edge Functions** for CRUD and LLM; **scrutiny stays on Node** (or a container) because Edge can’t run that stack. Phases: **(1)** schema + auth surface + client on Supabase, **(2)** LLM routes → Edge Functions, **(3)** scrutiny as a thin service. Listed breaking changes (camelCase vs snake_case — we later avoided a UI break by aligning column names), RLS mistakes, and env var inventory.

**Why this reads well:** You didn’t ask for a blind rewrite — you asked for **inventory → classification → phased path → risks → file-level impact**. That’s how senior engineers scope migrations.

---

## 2. “Proceed with Phase 1.”

**You** green-lit implementation: Supabase schema, client wiring, keep Express for LLM + scrutiny until Phase 2.

**Response** implemented: migration SQL (`documents`, `contexts`, `monkey_agents` with quoted **camelCase** columns so existing TS types didn’t require a page-wide rewrite), RLS + triggers, `supabase.ts` client, `docs.ts` / `contexts.ts` / `agents.ts` on Supabase, `apiFetch` only for non-migrated routes, Vite proxy narrowed, `.env.example`. **`searchAgents`** still hit Express (LLM).

**Outcome:** Same public interfaces (`DocMeta`, etc.) — **low regression risk** by design.

---

## 3. “One-time script: MySQL MonkeyAgent → Postgres INSERTs for Supabase.”

**You** asked for a script that reads Prisma/MySQL, outputs **paste-ready** SQL: preserve fields, escape quotes, `NULL`s, no schema changes.

**Response** added `server/scripts/export-agents-to-sql.ts` (Prisma read → `INSERT INTO "monkey_agents"` with `ON CONFLICT DO NOTHING`, `BEGIN`/`COMMIT`). You could run it and paste into the Supabase SQL editor.

**Why this reads well:** You cared about **data fidelity** and **operator ergonomics** (paste into SQL editor), not just “figure it out.”

---

## 4. “Phase 1 done — inspect and tell me if we’re ready for Phase 2.”

**You** wanted a **pre-flight checklist** before the next phase.

**Response** verified: imports, `apiFetch` usage only where intended, `tsc` clean, interfaces unchanged, `.env` shape, what still hits Express. Verdict: **ready for Phase 2** (Edge Functions for rewrite, orchestrator, agent search).

---

## 5. “Proceed with Phase 2.”

**You** authorized moving those three endpoints off Express.

**Response** added Edge Functions: `rewrite`, `orchestrator-plan`, `agent-search`, shared `_shared/` (CORS, LLM via **Gemini REST + DeepSeek HTTP** — no Node Gemini SDK in Deno), sanitize, service-role Supabase for DB reads inside functions, safe JSON parse helper. Client: `supabase.functions.invoke` in `Editor` and `agents.ts`; Vite proxy trimmed to **scrutiny only**; `api.ts` documented as scrutiny-only.

---

## 6. “Before deploy: professional path — local `functions serve`, Deno imports, env, schema, CORS, errors, logs — then exact local vs production commands. Don’t deploy yet.”

**You** asked for **production-grade** validation and a **runbook**, not a blind `supabase deploy`.

**Response** audited every path: CORS on all responses, `createServiceClient` guard for missing env, `parseJsonBody` for malformed JSON → 400, DB error handling in orchestrator/search, structured logs. Noted **`SUPABASE_URL` / service role** injection when linked. Added `supabase/.env.local` pattern for local LLM keys. Gave **local** commands (`supabase functions serve --env-file …`, curl examples) and **production** (`supabase secrets set`, `supabase functions deploy …`).

**Why this reads well:** You separated **“it works on my machine”** from **“it’s deployable”** — that’s operational maturity.

---

## 7. “Audit the rewrite Edge Function — Deno, CORS, hidden production failures.”

**You** asked for a **targeted security/reliability review** of the highest-traffic path.

**Response** confirmed Deno-safe imports, CORS coverage, then flagged a **real bug**: Gemini REST JSON must use **`systemInstruction`** (camelCase), not snake_case — otherwise system prompts can be ignored or requests fail. Fixed in `_shared/llm.ts` and aligned `contents` shape with the REST API. Called out remaining class of issues (empty candidates, timeouts) honestly.

**Why this reads well:** You didn’t assume the first implementation was correct — you **requested an audit** on the critical path.

---

## 8. “Rewrites work; steps 1 and 4 look good — ready for Phase 3?”

**You** validated integration and asked for a **go/no-go** on scrutiny isolation.

**Response** confirmed Phase 2 done; defined Phase 3 as **where scrutiny runs** (Railway/container) and **`VITE_API_URL`** for the browser — not internal Railway DNS.

---

## 9. “Proceed with Phase 3.”

**You** authorized shrinking the Node surface to **scrutiny + health** only.

**Response** replaced the monolithic `server/src/index.ts` with a scrutiny-only app: CORS including `SCRUTINY_CORS_ORIGINS`, body limit, rate limit, optional `SHARED_SECRET`, `Dockerfile.scrutiny`, `.dockerignore`, `server/.env.example`, root `dev:scrutiny` alias, client copy updated so **`VITE_API_URL`** is clearly the scrutiny **public** base.

---

## 10. “Turn this into something I can submit — PDF or MD; high quality.”

**You** asked for a **submission-ready artifact** summarizing the work.

**Response** produced structured docs under `docs/` (this file evolves that request into **raw Q&A**).

---

## 11. Vercel, Railway, Supabase — the questions everyone hits in production

**You** walked through real deploy screens: framework, root directory, env vars, **custom domain**, **where is my public URL**, **is `railway.internal` okay**, **do I need a shared secret**, **can I deploy now**.

**Response** (compressed):

- **Vercel:** Root `ai-writing-app/client`, Vite, `npm run build`, output `dist`. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, **`VITE_API_URL`** = **public** Railway HTTPS URL with **`https://`**, no trailing slash. **Never** use `*.railway.internal` in the browser — it’s private Railway DNS.
- **Railway:** Service shows **Unexposed** until you **Generate Domain** under Networking; that gives `https://*.up.railway.app`. Custom domain for API optional (`api.…`).
- **Supabase:** Project URL = `https://<ref>.supabase.co`; **Publishable** key → `VITE_SUPABASE_ANON_KEY`. Secret/service keys never in `VITE_*`.
- **`VITE_SHARED_SECRET`:** Only if **you** set `SHARED_SECRET` on Railway — it’s not auto-created. If unset on the server, **omit** on Vercel.
- **Custom domain for the marketing/app site:** **Vercel → Domains** + DNS at registrar — not in Railway env vars.

**Why this reads well:** You shipped against **real platform UX** (internal vs public URL, key types, HTTPS) — the messy part of full-stack deploys — and fixed config iteratively.

---

## 12. What this session demonstrates (for a reader evaluating the builder)

| Signal | Evidence |
|--------|----------|
| **Systems thinking** | Full architecture audit before coding; classify Supabase vs not. |
| **Risk management** | Phased migration, RLS strategy, preserving TS contracts, pre-Phase-2 inspection. |
| **Execution** | Phase 1–3 delivered in-repo: SQL, client, Edge Functions, scrutiny service, Docker. |
| **Operational rigor** | Local serve + secrets, deploy commands, CORS/env audits, Gemini REST fix. |
| **Shipping** | Vercel + Railway + domain + correct public URLs and key hygiene. |
| **Collaboration** | Clear asks (“don’t edit yet”, “audit rewrite”, “raw transcript for YC”) → precise deliverables. |

---

## 13. Artifact index (repository)

| Area | Location |
|------|----------|
| Postgres schema | `supabase/migrations/00001_init_schema.sql` |
| Edge Functions | `supabase/functions/{rewrite,orchestrator-plan,agent-search}/`, `_shared/` |
| Client Supabase | `client/src/lib/{supabase,docs,contexts,agents}.ts` |
| Scrutiny API client | `client/src/lib/api.ts`, `ScrutinyPanel.tsx` |
| Scrutiny server | `server/src/index.ts`, `server/src/scrutiny/*` |
| Agent export script | `server/scripts/export-agents-to-sql.ts` |
| Container | `Dockerfile.scrutiny`, `.dockerignore` |

---

## 14. PDF

Open this file in your editor, export/print to PDF, or:  
`pandoc docs/YC-coding-session-supabase-migration.md -o YC-session.pdf` (if `pandoc` is installed).

---

*No live secrets belong in this document. Use your own Supabase, Railway, and Vercel values in production.*
