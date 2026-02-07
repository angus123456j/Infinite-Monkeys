# Project Context: AI Writing App with Copilot Overlay

## What this project is
This is a single-player, local-first Google Docs–like writing app.

Users write rich text in a custom editor. A built-in AI copilot helps rewrite selected text.

## Core UX flow (non-negotiable)
1. User highlights text (sentence or paragraph)
2. User presses a keyboard shortcut (Cmd+K)
3. A floating AI overlay appears near the selection
4. User enters a prompt (e.g. "rewrite clearer")
5. AI generates a rewrite
6. User can Accept (replace selection) or Reject

This overlay is NOT a sidebar and NOT inline autocomplete.

## Editor rules
- The editor is the source of truth
- Selection and cursor position matter
- AI never edits text automatically
- All AI changes are previewed before applying

## Architecture rules
- Editor owns document state
- AI overlay is UI-only until Accept
- Rewrites are applied via editor transactions
- Undo/redo must continue to work

## Keyboard behavior
- Cmd+K opens overlay at selection
- Esc closes overlay without changes
- Accept applies rewrite and closes overlay

## What NOT to suggest
- Inline autocomplete while typing
- Replacing the whole document
- Sidebar-only AI
- Auto-editing without user confirmation
