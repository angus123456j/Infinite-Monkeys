import { useMemo } from "react";
import { Link } from "react-router-dom";

type Node =
  | { type: "h1" | "h2" | "h3"; text: string; id: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "hr" };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function parseMarkdown(md: string): Node[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const nodes: Node[] = [];

  let para: string[] = [];
  let ul: string[] | null = null;
  let ol: string[] | null = null;
  let quote: string[] | null = null;

  const flushPara = () => {
    if (para.length) {
      nodes.push({ type: "p", text: para.join(" ").trim() });
      para = [];
    }
  };
  const flushUl = () => {
    if (ul && ul.length) nodes.push({ type: "ul", items: ul });
    ul = null;
  };
  const flushOl = () => {
    if (ol && ol.length) nodes.push({ type: "ol", items: ol });
    ol = null;
  };
  const flushQuote = () => {
    if (quote && quote.length) nodes.push({ type: "quote", text: quote.join(" ").trim() });
    quote = null;
  };
  const flushAll = () => {
    flushPara();
    flushUl();
    flushOl();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();

    // hr
    if (t === "---") {
      flushAll();
      nodes.push({ type: "hr" });
      continue;
    }

    // headings
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushAll();
      const level = h[1]!.length;
      const text = (h[2] ?? "").trim();
      const id = slugify(text);
      nodes.push({ type: level === 1 ? "h1" : level === 2 ? "h2" : "h3", text, id });
      continue;
    }

    // blockquote
    if (t.startsWith(">")) {
      flushPara();
      flushUl();
      flushOl();
      quote ??= [];
      quote.push(t.replace(/^>\s?/, ""));
      continue;
    }

    // ul
    const ulMatch = t.match(/^- (.*)$/);
    if (ulMatch) {
      flushPara();
      flushOl();
      flushQuote();
      ul ??= [];
      ul.push((ulMatch[1] ?? "").trim());
      continue;
    }

    // ol
    const olMatch = t.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      flushPara();
      flushUl();
      flushQuote();
      ol ??= [];
      ol.push((olMatch[1] ?? "").trim());
      continue;
    }

    // blank
    if (t === "") {
      flushAll();
      continue;
    }

    // paragraph
    flushUl();
    flushOl();
    flushQuote();
    para.push(t);
  }

  flushAll();
  return nodes;
}

const GUIDE_MD = `# Infinite Monkeys — System Documentation

## Overview

Infinite Monkeys is a document-native writing system built around modular AI agents, reusable context, and flow-preserving interaction design.

Unlike traditional AI writing tools that interrupt writing through chat panels or aggressive rewrite prompts, Infinite Monkeys keeps the document itself as the primary workspace. Intelligence is introduced only when summoned, at the exact place where intervention is needed.

The system is designed around one core principle:

> Writing should remain continuous. AI should extend thought, not interrupt it.

This means every feature inside Infinite Monkeys exists to preserve authorship, reduce friction, and allow language to evolve inside the document without forcing the writer out of their flow.

---

# The Document System

## The Document as the Core Operating Environment

The document inside Infinite Monkeys is not passive text storage.

It is an active execution surface where writing, rewriting, comparison, and refinement all occur directly in place.

The system is designed so that users never need to leave the document to invoke intelligence.

---

## Highlight-Based Execution Flow

The primary interaction model works as follows:

1. User writes naturally inside the document
2. User highlights a specific sentence, phrase, or paragraph
3. User invokes a monkey agent
4. Agent processes only the selected scope
5. Output returns inline

This makes intervention precise.

The AI does not guess where help is needed.

The user defines the exact target.

---

## Inline Rewrite Philosophy

Traditional AI tools often force immediate replacement.

Infinite Monkeys instead allows temporary branching.

The original writing remains visible.

The user can:

- accept output
- reject output
- partially merge output
- continue writing before deciding

This protects authorship and reduces pressure.

---

## Why Inline Matters

When rewriting happens inside the document:

- comparison becomes immediate
- thought continuity remains intact
- edits feel like extensions rather than replacements

This creates a fundamentally different psychological writing experience.

---

# Context Library

## What Context Is

The Context Library allows users to store reusable contextual material in structured units called books.

A book may contain:

- writing samples
- research excerpts
- personal stories
- project notes
- references
- tone examples

Each book becomes reusable intelligence that agents can pull from when needed.

---

## Why Context Exists

Without persistent context, users repeatedly explain the same background every time they invoke AI.

This creates prompt fatigue.

The Context Library removes that repetition.

Instead of restating important information manually, users attach context once and reuse it across writing sessions.

---

## Selective Retrieval Logic

Context is not fully injected every time.

Only relevant fragments should be retrieved.

This is critical because full context dumping causes:

- token waste
- irrelevant noise
- weaker outputs

The system should retrieve only fragments that are semantically useful to the selected writing task.

---

## How Context Gets Woven Into Writing

Good context should influence output invisibly.

It should not appear pasted.

It should affect:

- examples
- specificity
- factual grounding
- tone consistency
- reference quality

The ideal result is writing that feels naturally informed rather than artificially injected.

---

## Context vs Prompting

Traditional prompting requires rebuilding context repeatedly.

Infinite Monkeys turns context into reusable infrastructure.

This changes writing from repeated prompting into controlled contextual composition.

---

# Monkey Agent System

## Why Agents Exist

Writing problems are not singular.

Different writing tasks require different kinds of intervention.

Changing perspective is not the same as tightening structure.

Finding synonyms is not the same as balancing an argument.

For this reason, Infinite Monkeys uses specialist agents rather than one general rewrite tool.

---

## Agent Invocation Model

Each monkey agent receives:

- selected text
- nearby document context
- optional context library material
- its own behavior definition

The agent then performs one specialized transformation.

---

## Current Agent Philosophy

Each agent should be narrow enough to remain predictable.

Each agent should solve one writing problem clearly.

---

## Example Agents

### Synonym Sensei

Finds replacements using sentence meaning rather than isolated word replacement.

The goal is semantic precision.

---

### Perspective Monkey

Changes writing viewpoint cleanly.

Examples:

- first person to third person
- third person to first person

Without breaking tense consistency.

---

### Architecture Monkey

Helps reshape writing structure.

Looks at:

- sequence
- paragraph logic
- idea build-up

---

### Balance Monkey

Useful for persuasive writing.

Can expose:

- strengths
- weaknesses
- missing angles

---

### Critic Monkey

Analyzes writing quality critically.

Looks for:

- weak rhythm
- vague phrasing
- repetitive patterns

---

### AI Scrutiny Layer

A special evaluation layer that detects AI-like writing drift.

It helps users identify where writing may sound overly generated.

The purpose is not punishment.

The purpose is voice protection.

---

# Orchestrator Layer

## Why Orchestration Exists

Writers often refine in stages.

One pass may improve clarity.

Another may improve rhythm.

Another may strengthen structure.

The Orchestrator exists to coordinate multiple agents in sequence.

---

## Example Flow

A selected paragraph may pass through:

1. Critic Monkey
2. Synonym Sensei
3. Architecture Monkey

This creates layered refinement.

---

## Long-Term Direction

The Orchestrator should eventually become adaptive.

It should determine which sequence is most useful depending on the writing problem.

---

# Agent Neural Network

## Why the Graph Exists

The monkey graph is not decorative.

It represents relationships between cognitive writing tools.

Each node is an agent.

Each connection suggests functional relationship.

---

## Why Graph Instead of List

Lists imply flat tools.

Graphs imply intelligence relationships.

This matters because some agents naturally pair together more often than others.

---

## Search Behavior

Users should be able to search agents directly inside the graph.

Matching nodes should highlight instantly.

This turns the graph into navigable writing infrastructure.

---

## Future Dynamic Graph Logic

Over time, relationships between agents can become adaptive.

Frequently paired agents may cluster closer together.

Rare combinations may remain distant.

This turns the graph into living usage intelligence.

---

# Writing Flow and UX Logic

## Flow Preservation Is Core

The strongest product principle inside Infinite Monkeys is preserving writing momentum.

Every design decision should support uninterrupted thinking.

---

## Why Side Interruptions Are Dangerous

Popups, forced decisions, and aggressive overlays damage thought continuity.

This is why agent interactions must remain lightweight.

---

## Overlay Philosophy

Overlays should appear only when useful.

They should never dominate the page.

---

## Suggestion Timing

Suggestions must feel immediate enough to support flow, but not visually overwhelming.

`;

function renderNode(n: Node, key: string | number) {
  if (n.type === "h1") {
    return (
      <h1 key={key} id={n.id} className="im-guide-h1">
        {n.text}
      </h1>
    );
  }
  if (n.type === "h2") {
    return (
      <h2 key={key} id={n.id} className="im-guide-h2">
        {n.text}
      </h2>
    );
  }
  if (n.type === "h3") {
    return (
      <h3 key={key} id={n.id} className="im-guide-h3">
        {n.text}
      </h3>
    );
  }
  if (n.type === "p") {
    return (
      <p key={key} className="im-guide-p">
        {n.text}
      </p>
    );
  }
  if (n.type === "quote") {
    return (
      <blockquote key={key} className="im-guide-quote">
        {n.text}
      </blockquote>
    );
  }
  if (n.type === "ul") {
    return (
      <ul key={key} className="im-guide-ul">
        {n.items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    );
  }
  if (n.type === "ol") {
    return (
      <ol key={key} className="im-guide-ol">
        {n.items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ol>
    );
  }
  return <hr key={key} className="im-guide-hr" />;
}

export default function GuidePage() {
  const nodes = useMemo(() => parseMarkdown(GUIDE_MD), []);
  const headings = useMemo(
    () =>
      nodes
        .filter((n): n is Extract<Node, { type: "h1" | "h2" | "h3" }> =>
          n.type === "h1" || n.type === "h2" || n.type === "h3"
        )
        .map((h) => ({ level: h.type, text: h.text, id: h.id })),
    [nodes]
  );

  const top = useMemo(() => headings.filter((h) => h.level === "h1"), [headings]);
  const byH1 = useMemo(() => {
    const groups: Array<{
      h1: { text: string; id: string };
      h2: Array<{ text: string; id: string; h3: Array<{ text: string; id: string }> }>;
    }> = [];

    let current:
      | {
          h1: { text: string; id: string };
          h2: Array<{ text: string; id: string; h3: Array<{ text: string; id: string }> }>;
        }
      | null = null;
    let currentH2: { text: string; id: string; h3: Array<{ text: string; id: string }> } | null =
      null;

    for (const h of headings) {
      if (h.level === "h1") {
        current = { h1: { text: h.text, id: h.id }, h2: [] };
        groups.push(current);
        currentH2 = null;
      } else if (h.level === "h2") {
        if (!current) {
          current = { h1: { text: top[0]?.text ?? "Guide", id: top[0]?.id ?? "guide" }, h2: [] };
          groups.push(current);
        }
        currentH2 = { text: h.text, id: h.id, h3: [] };
        current.h2.push(currentH2);
      } else if (h.level === "h3") {
        if (!current) continue;
        if (!currentH2) {
          currentH2 = { text: "Details", id: `${current.h1.id}-details`, h3: [] };
          current.h2.push(currentH2);
        }
        currentH2.h3.push({ text: h.text, id: h.id });
      }
    }

    return groups;
  }, [headings, top]);

  return (
    <div className="im-guide">
      <aside className="im-guide-sidebar" aria-label="Guide navigation">
        <div className="im-guide-sidebar-inner">
          <div className="im-guide-brand">Infinite Monkeys</div>
          <div className="im-guide-side-actions">
            <Link to="/drive" className="im-guide-back">
              ← Back to Drive
            </Link>
          </div>

          <nav className="im-guide-nav">
            {byH1.map((g) => (
              <details key={g.h1.id} className="im-guide-nav-group" open>
                <summary className="im-guide-nav-h1">
                  <a href={`#${g.h1.id}`}>{g.h1.text}</a>
                </summary>
                <div className="im-guide-nav-h2wrap">
                  {g.h2.map((h2) => (
                    <details key={h2.id} className="im-guide-nav-sub" open={false}>
                      <summary className="im-guide-nav-h2">
                        <a href={`#${h2.id}`}>{h2.text}</a>
                      </summary>
                      {h2.h3.length ? (
                        <div className="im-guide-nav-h3wrap">
                          {h2.h3.map((h3) => (
                            <a key={h3.id} className="im-guide-nav-h3" href={`#${h3.id}`}>
                              {h3.text}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </nav>
        </div>
      </aside>

      <main className="im-guide-main" aria-label="Guide content">
        <div className="im-guide-content">{nodes.map((n, i) => renderNode(n, i))}</div>
      </main>
    </div>
  );
}

