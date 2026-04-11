# Infinite Monkeys — Migration & Shipping (Session Transcript Style)

*Condensed dialogue from a working session. Technical terms preserved; secrets omitted.*

---

## Architecture & migration strategy

**You asked:** To identify the current backend (routes, DB, auth, storage, jobs, admin) and what maps to Supabase vs what must stay elsewhere; a minimum-safe phased path starting with schema + auth; risks, env vars, and files that would change — without editing code yet.

**I answered:** Mapped Express + Prisma/MySQL: CRUD on documents/contexts/agents, LLM routes (rewrite, orchestrator, agent search), scrutiny (ONNX, must stay on Node). Auth was optional shared secret only. Proposed phases: (1) Postgres + Supabase client + RLS, (2) Edge Functions for LLM, (3) scrutiny as microservice/container. Listed camelCase column strategy, RLS, and file-level impact. You greenlit proceeding.

---

## Phase 1 (implemented)

**You asked:** Proceed with Phase 1.

**I did:** Added `supabase/migrations/00001_init_schema.sql`, `client/src/lib/supabase.ts`, rewrote `docs.ts` / `contexts.ts` / `agents.ts` to Supabase (search still Express), narrowed Vite proxy, `client/.env.example`. Preserved public TS types so pages stayed unchanged. Installed `@supabase/supabase-js`.

**You asked:** A one-time script: MySQL `MonkeyAgent` → PostgreSQL `INSERT`s for Supabase, exact field preservation, escaping, no schema changes.

**I did:** `server/scripts/export-agents-to-sql.ts` + generated `supabase/seed-agents.sql` pattern.

**You asked:** Inspection — ready for Phase 2?

**I answered:** Checklist pass — interfaces preserved, `apiFetch` only for LLM+search+scrutiny, TS clean; ready for Edge Functions.

---

## Phase 2 (implemented)

**You asked:** Proceed with Phase 2.

**I did:** Edge Functions `rewrite`, `orchestrator-plan`, `agent-search` with `_shared/` (CORS, LLM REST for Gemini+DeepSeek, sanitize, service Supabase client). Client: `supabase.functions.invoke` in `Editor.tsx` and `agents.ts`; Vite proxy only `/api/scrutiny`.

**You asked:** Safest path before deploy — local `supabase functions serve`, Deno imports, `.env` for keys, schema queries, CORS, errors/logs — then exact local vs production commands.

**I answered:** Audit + fixes: `systemInstruction` camelCase for Gemini REST, `parseJsonBody`, env guards for Supabase URL/key, DB error handling, structured logs. Documented `supabase functions serve --env-file`, secrets, deploy commands. No deploy executed on your behalf.

**You asked:** Deep audit of the **rewrite** Edge Function only.

**I answered:** Imports/CORS paths/env/schema; fixed Gemini JSON body; listed residual risks (payload size, empty candidates).

---

## Phase 3 (implemented)

**You asked:** Proceed with Phase 3.

**I did:** Replaced bloated `server/src/index.ts` with **scrutiny-only** service (health, rate limit, optional secret, `SCRUTINY_CORS_ORIGINS`), `Dockerfile.scrutiny`, `.dockerignore`, `server/.env.example`, root `dev:scrutiny`, updated `client/src/lib/api.ts` comments. Prisma/LLM no longer required to *start* the scrutiny process.

---

## Deployment & domains (your questions)

**You asked:** Railway internal hostname — frontend on Vercel + domain `infinitemonkeys.world`?

**I answered:** Use **public** Railway HTTPS URL for `VITE_API_URL`, not `*.railway.internal`. Domain on **Vercel → Settings → Domains**; DNS at registrar.

**You asked:** What to put in Vercel (screenshot) — framework, root, build, env.

**I answered:** Root `ai-writing-app/client`, Vite, `npm run build`, `dist`; `VITE_SUPABASE_*`; remove stray example vars; add public `VITE_API_URL` for scrutiny; `https://` required.

**You asked:** Where project URL and API key; screenshot of Publishable vs Secret.

**I answered:** URL = `https://<project-ref>.supabase.co` from Project ID / General; client key = **Publishable** (`sb_publishable_…`), not the secret key.

**You asked:** `VITE_SHARED_SECRET` — where to find, need it?

**I answered:** Must match `SHARED_SECRET` **you** set on Railway; if unset on server, omit on Vercel.

**You asked:** Railway Variables empty — no shared secret.

**I answered:** Normal — you never created one; auth off until you add it.

**You asked:** Good to deploy? Screenshot with `VITE_API_URL` = internal hostname.

**I answered:** Fix to **public** `https://…up.railway.app` first.

**You asked:** Where public URL on Railway?

**I answered:** Networking → **Generate Domain**; internal URL is not public.

**You asked:** Where is the “service”?

**I answered:** The card **Infinite-Monkeys** is the service; **Unexposed** → Settings → Networking → Generate Domain.

**You asked:** Good to deploy now? (screenshot with railway host, maybe missing `https://`)

**I answered:** Ensure `VITE_API_URL` includes **`https://`**.

---

## YC write-up

**You asked:** Extract key points into PDF/MD for YC.

**I did:** `docs/YC-coding-session-supabase-migration.md` (structured technical summary).

**You asked (this session):** Make it “very raw” (questions + answers), high quality, show you and the assistant as competent.

**I did:** This file — transcript style, accurate roles, no secrets.

---

## Handoff note for the next assistant

Remaining ops are mostly **yours**: confirm Vercel env (`https` on `VITE_API_URL`), custom domain DNS, optional Railway `SHARED_SECRET` + `VITE_SHARED_SECRET`, and Supabase/Edge secrets in production. Codebase state: Phases 1–3 implemented as described; duplicate `YC_*` doc filenames may exist in `docs/` — consolidate if desired.
