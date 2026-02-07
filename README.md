# Infinite Monkeys

Infinite Monkeys is a local-first, Google Docs–like writing editor with a deliberate AI copilot overlay.  
It is designed to make AI-assisted writing intentional, controllable, and reversible rather than automatic or intrusive.

Instead of inline autocomplete or background edits, all AI actions are explicit, previewed, and applied only with user confirmation.

---

## Motivation

Most AI writing tools today optimize for speed:
- autocomplete while you type
- silent rewrites
- background “fixing” of text

This project explores a different philosophy:

AI should assist writing, not replace authorship.

Infinite Monkeys treats AI as a tool you invoke deliberately, with full visibility and control over every change.

---

## Inspiration

This project is inspired by ThePrimeagen’s “99 Prompt” idea — the rejection of full “vibe coding” in favor of explicit, inspectable prompts and actions.

Instead of letting AI continuously guess what you want, Infinite Monkeys:
- waits for user intent
- shows exactly what the AI proposes to change
- allows explicit accept, reject, or revision

The goal is to bring this philosophy to writing, not just programming.

---

## Core Idea

Infinite Monkeys is built around a simple interaction loop:

1. Write normally in a rich-text editor
2. Highlight text (sentence, paragraph, or block)
3. Press a keyboard shortcut (for example, Cmd + K)
4. A floating AI overlay appears near the selection
5. Provide a prompt (e.g. “rewrite clearer”)
6. The AI generates a preview
7. Explicitly accept or reject the change

Nothing is applied automatically.

---

## Key Features

### Docs-like Editor
- Rich text editing (paragraphs, headings, lists)
- Cursor- and selection-aware
- Undo and redo always preserved
- Local-first by default

### AI Copilot Overlay
- Triggered by a keyboard shortcut
- Anchored to the current selection
- Never modifies text without confirmation
- Designed for paragraph- and idea-level edits

### Accept / Reject Model
- AI edits are previews, not mutations
- Every change can be accepted or discarded
- Undo history remains intact after AI actions

### Timelines and Rewrites (Planned)
- View previous AI rewrites
- Revert to earlier versions
- Compare multiple rewrites of the same text
- Treat AI edits as a timeline rather than a one-way operation

### Skills (Planned)
Skills are writing guidelines, not models.

Examples:
- Academic tone
- Concise technical explanation
- Persuasive essay style
- Casual blog voice

Skills act as constraints and guidance for the AI:
- They do not force changes
- They shape how rewrites are generated
- Multiple skills can be combined

This allows the same text to be rewritten under different stylistic rules, transparently.

---

## What This Project Is Not

- Inline autocomplete
- Background AI rewriting
- One-click rewriting of entire documents
- Hidden edits applied without visibility

Infinite Monkeys is intentionally slower by design.

---

## Architecture Overview

- Frontend: Vite, React, TypeScript
- Editor: Custom Docs-like editor with selection awareness
- AI Integration: Pluggable provider layer
  - Mock provider for free local development
  - Gemini API for free-tier prototyping
  - Claude or OpenAI as optional future providers
- State Model:
  - The editor owns document state
  - AI operates on snapshots of selected text
  - Changes are applied via explicit editor transactions

The AI is replaceable plumbing.  
The interaction model and user control are the product.

---

## Why “Infinite Monkeys”

The name references the infinite monkey theorem: given enough attempts, random processes can produce meaningful results.

This project flips that idea:
- The AI can generate infinite variations
- The human decides which ones matter

Meaning is curated, not guessed.

---

## Project Status

This is an active exploratory project focused on:
- AI UX design
- Human–AI collaboration
- Editor interaction models
- Writing workflows that emphasize intent and control

It is not optimized for scale or commercialization at this stage.

---

## Long-Term Vision

- Writing tools that respect authorship
- AI systems that are inspectable
- Rewrites as reversible decisions
- Skills as transparent constraints
- Editors that make AI feel like a collaborator rather than a replacement

---

## License

MIT (subject to change)
