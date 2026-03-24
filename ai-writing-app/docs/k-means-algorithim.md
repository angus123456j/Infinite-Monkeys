# Infinite Monkey Day 20 — Teaching k-means to respect the monkeys

*A build log: from “pretty graph” to “these clusters actually mean something.”*

---

## Why k-means at all?

The Monkey Agents Network is a 3D view: each agent is a node, edges connect nearby nodes, and **clusters** color the spheres so you can see families of related specialists at a glance. I didn’t need a PhD thesis—I needed a **fast, deterministic** way to group agents on the client with **no extra API** and **no model weights** shipped to the browser.

k-means is a natural fit: fix a number **k**, throw vectors at **Lloyd’s algorithm**, get assignments, then lay clusters out on a ring for the scene. The interesting part is everything *around* vanilla k-means: **what the vectors are**, **how you pick k**, and **how you initialize** the centroids.

---

## Version 1: good enough to *look* clustered

The first pass was intentionally minimal:

### Feature vectors

- Concatenate the agent’s text fields (name, role, strengths, identity, behavior, constraints).
- Tokenize, hash words into a **fixed number of buckets** (96 dimensions), add a bit of bigram signal, then **L2-normalize** each row.

**L2 normalization** scales every vector to unit length. That throws away “how long the profile is” and keeps **direction** in space, so one verbose agent doesn’t dominate purely because its vector is huge.

### How many clusters?

A simple heuristic: **k ≈ round(√n)**, clamped between **2** and **8**, and never larger than the number of agents. That’s a classic “don’t use too many clusters” rule for visualization—not statistically optimal, but stable.

### The algorithm

**Lloyd’s algorithm** (what people usually mean by “k-means”):

1. Start with **k** centroids.
2. Assign each point to the **nearest** centroid (Euclidean distance, on squared distance in code).
3. Move each centroid to the **mean** of its assigned points.
4. Repeat until assignments stop changing or you hit a **max iteration** cap.

Initialization was **Forgy-style**: shuffle agent indices with a fixed seed, take the first **k** agents’ vectors as initial centroids. Simple and reproducible.

### After clustering

Assignments feed a **layout** function: cluster centers sit on a ring in 3D, with a little jitter so nodes don’t sit on top of each other. The graph edges are k-nearest style within/between clusters depending on mode.

**Honest assessment:** this was **optimized for the demo**: it ran fast, looked fine with a handful of agents, and didn’t require tuning. It was *not* optimized for **semantic faithfulness**. Similar-sounding generalists could land in the same bucket because raw hash counts and collisions blur distinctions.

---

## Version 2: when “Rebuttal” and “Rhythm” shouldn’t share a cluster

I started noticing pairs that *felt* wrong—agents with very different jobs lumped together. The clustering wasn’t “wrong” mathematically; it was **under-informed**. Same algorithm, richer signal.

### TF–IDF *flavor* in a hashed space

Instead of counting raw hits per bucket, I build **per-agent word counts** over the whole corpus, compute **document frequency** per word, then weight each token with a **TF × IDF**-style score before accumulating into hash buckets.

Intuition:

- Words that appear **everywhere** (“monkey,” “agent,” common glue words) get **down-weighted** via IDF.
- Words that are **specific** to one or a few agents (“rebuttal,” “rhythm,” “meter”) get **boosted**.

I also:

- Bumped the hash space to **256 dimensions** to reduce **collision noise** (two unrelated words smashing into the same bucket).
- Added a **stopword** list (English glue + theme words like “monkey” so every profile doesn’t look identical).
- Included **`defaultPrompt`** in the text so the model has more to chew on.
- Kept **bigrams** for short phrases that matter.

Still **L2-normalize** after building the vector so k-means isn’t dominated by magnitude.

### Better starts: k-means++

Forgy initialization can land centroids too close together; you get **bad local minima**. **k-means++** spreads initial centroids: the first is random, each next one is chosen with probability proportional to **squared distance** to the nearest existing centroid. Far from existing centers → more likely to be picked. Same Lloyd loop afterward.

It costs a bit more up front but the partitions are usually **cleaner** without changing the distance metric.

### Slightly more room for structure: k

The **√n** rule stayed, but the **ceiling** went from **8** to **12** clusters so larger rosters can separate into finer groups before hitting the cap.

### Cluster *names*, not just “Group 3”

Pure UX win: after assignments, each cluster gets a **title** built from **distinctive terms**—TF–IDF-style scoring over the cluster’s combined text vs the global corpus, top few words joined with middots (e.g. `Rhythm · Meter · …`). No LLM required; it’s explainable and matches what the embedding actually emphasized.

---

## The nitty-gritty table

| Piece | v1 | v2 |
|--------|----|----|
| Vector | Hash counts + L2 | TF–IDF-weighted hash + L2 |
| Dim | 96 | 256 |
| Stopwords | No | Yes |
| defaultPrompt | No | Yes |
| Init | Seeded Forgy | k-means++ |
| k cap | 8 | 12 |
| Legend | “Group N” | Auto titles from terms |

---

## What k-means still *doesn’t* do

- It doesn’t read arbitrary markdown files at cluster time—it clusters **whatever lives in the agent records** exposed to the app.
- It’s not guaranteed to find the “true” number of semantic communities; **k** is still a **heuristic** with a cap.
- If two agents have **thin or near-duplicate profiles**, they’ll stay close in vector space no matter how clever the IDF is.

The real upgrade was **representation + initialization + labels**: same Lloyd loop, much more honest geometry for a writing app.

---

## Closing

Day 20 was the day the network stopped being only a **pretty marble constellation** and started acting like a **map of who does what**—with the math on the page to prove it. If you’re building something similar: **cheap embeddings + TF–IDF thinking + k-means++** buys a lot before you pay for real embedding APIs.

*— Infinite Monkey Day 20*
