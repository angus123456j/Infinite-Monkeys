---
name: ai-writing-app
description: Build and iterate a local-first AI writing app (Vite+React+TS, Tiptap/ProseMirror, Express Claude proxy). Use for scaffolding milestones, implementing editor/overlay/AI flows, and enforcing architecture constraints.
---

# AI Writing App Skill

## Purpose
This skill helps build a single-player, local-first writing app with a Docs-like editor and an AI copilot overlay.

## Stack (fixed)
- Client: Vite + React + TypeScript
- Editor: Tiptap (ProseMirror)
- Server: Express + TypeScript (Claude API proxy)
- Persistence: IndexedDB (later milestone)

## Non-negotiable architecture rules
1. React must NOT store editor document state. ProseMirror owns doc/cursor/selection/undo.
2. All edits must be done via Tiptap commands or ProseMirror transactions (never DOM or innerHTML edits).
3. Never put API keys in client code. Claude calls go through server only.
4. One milestone at a time. Do not implement future milestones unless asked.
5. Do not introduce new libraries without explicit justification and minimal alternatives.

## Output format requirements
When implementing code:
- Provide file paths + full file contents for each changed/added file.
- Include exact install commands for any dependencies.
- Include a short “Run/Verify” checklist.
- Keep changes minimal to satisfy the milestone.

## Milestone playbook
### Milestone 1: Scaffold + basic editor
- Set up npm workspaces: root/client/server.
- Create minimal Tiptap editor with StarterKit + toolbar.
- No overlay, no AI, no persistence.

### Milestone 2: API proxy
- Express server with POST /api/rewrite
- Reads API key from env var
- Includes basic shared-secret header auth + rate limit
- Returns JSON { rewrite, explanation? }

### Milestone 3: Cmd+K overlay positioning
- Hotkey toggles overlay near selection
- Store selection before opening overlay and restore on apply
- Close on ESC + X button
- No AI logic

### Milestone 4: AI rewrite loop
- Overlay “Run” calls proxy
- Render result + store AI transaction history

### Milestone 5: Accept/Reject apply
- Accept: replace selection or insert at cursor via transaction
- Preserve undo/redo

## Prompting rules for Claude calls
- Never add facts
- Preserve meaning and technical terms
- Keep user tone by default
- Canadian spelling by default (unless user says otherwise)
- Return JSON only when requested

## Troubleshooting guardrails
If something is ambiguous:
- Ask a single focused question OR choose a sensible default and clearly state it.
Do not redesign architecture.
