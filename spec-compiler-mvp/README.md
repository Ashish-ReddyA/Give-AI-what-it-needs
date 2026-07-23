# Spec Compiler

Ask a few questions before you generate. Get one compiled prompt per
platform so you don't burn a credit on the wrong format, length, style,
or a missing dealbreaker detail.

Two domains:

- **Image** — Midjourney / DALL·E / Higgsfield. Cheap to regenerate, so this
  is the low-stakes practice domain.
- **Video** — Higgsfield / Veo 3 / Runway. One run costs 10–100× an image
  and minutes of wait — this is where "ask first, spend once" actually bites.

This is the Phase 1.25 cut of the "AI Requirement Elicitation Engine" idea.
The critique that produced it and the four locked product decisions are in
[`../DESIGN.md`](../DESIGN.md); the phase plan is in
[`../ROADMAP.md`](../ROADMAP.md).

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # 32 unit tests on the pure-function core
npm run lint     # next/core-web-vitals
npm run build    # static production build
```

Fonts load from Google Fonts on first build, so `build`/`dev` need network
access.

## How it's wired

```
lib/types.ts            ImageSpec + VideoSpec — the schemas everything builds on
lib/platforms.ts        DATED platform knowledge: MJ version, model routing
                        tables, all stamped KNOWLEDGE_VERIFIED — the only
                        place platform facts live
lib/completeness.ts     scoreSpec(spec, fields) — generic over domain;
                        REGEN RISKS = unpinned required fields (and the UI
                        says exactly that — no fake credit math)
lib/compilers.ts        Midjourney / DALL·E / Higgsfield (image)
lib/compilers-video.ts  Higgsfield / Veo 3 / Runway (video)
lib/outcomes.ts         outcome log types + summarizeOutcomes() — the
                        hypothesis math (complete vs incomplete specs)
lib/store.ts            localStorage persistence, defensively sanitized
                        field-by-field on load (corrupt data → defaults)
lib/__tests__/          vitest suite for all of the above
components/             fields (shared primitives) · QuestionFlow ·
                        VideoQuestionFlow · CompletenessMeter ·
                        ResultsPanel · OutcomeTracker · OutcomeStats
app/page.tsx            domain toggle + state + persistence + compile gate
```

No backend, no database. The compilers are pure template functions, and
that's permanent (deterministic core, intelligent edges — see DESIGN.md §3).
The one LLM call in the app is the optional **AI assist** below — and it
runs in the user's browser, not on a server.

## AI assist (BYOK)

Paste your own Anthropic API key into the AI assist panel and one Claude
call (`claude-opus-4-8`, structured outputs) parses your idea to pre-fill
the fields it already answers — so the form never re-asks what you typed —
and suggests the next best question, tailored to the idea.

- **The key never leaves your browser** except to `api.anthropic.com`
  directly (localStorage + the SDK's browser CORS opt-in). There is no
  server to send it to.
- **It only fills empty fields** — your explicit picks are never
  overwritten, and extraction is deliberately conservative (it won't guess
  a format from "for Instagram").
- **Fully optional** — without a key the app is the same static form.

```
lib/analyze-core.ts     types + merge logic (fills empty fields only) — no SDK
lib/analyze.ts          the one Claude call (dynamically imported, lazy chunk)
components/AssistPanel  key management + pre-fill button + next-question hint
```

## Design decisions worth knowing

- **The compile gate and the meter can't disagree.** Results render only
  when every required field is answered — or after the user explicitly
  clicks "compile anyway," accepting the counted risks. v1 showed full
  results at 25% completeness while warning about them; that contradiction
  is gone.
- **Model routing is data, not code.** `chooseHiggsfieldModel` /
  `chooseHiggsfieldVideoModel` read routing tables from `lib/platforms.ts`.
  The heuristics are deliberately simple and explainable; replace them with
  real usage data once the Phase 1.5 outcome log exists.
- **Negation-aware text detection.** "must say OPEN 24/7" routes to a
  text-rendering model; "no text anywhere" does not (v1 got this backwards).
- **Style descriptors never smuggle in composition.** No more forced
  "shallow depth of field" on every realistic request.

## The MCP server

The same elicit → compile loop is exposed as MCP tools in [`mcp/`](./mcp)
(`elicit_spec`, `compile_spec`) so agents can run it in-chat. `npm run mcp`
for dev, `npm run mcp:build` for a single-file `node`-runnable bundle —
see [`mcp/README.md`](./mcp/README.md) for Claude Code / Desktop setup.
`npm test` covers it, including an end-to-end stdio integration test.

## The outcome log

The product's one claim is "answering questions upfront cuts wasted
generations" — and the app now measures that claim about itself:

1. Copying a prompt opens a **pending outcome** (it survives refresh —
   you leave to generate and come back).
2. One tap records the result: *first try / 1 / 2 / 3+ regens / abandoned*.
3. The stats panel compares **complete vs. incomplete specs** — average
   regens and first-try rate per bucket, with AI-assisted specs broken out.

Honesty rules: "3+" is floored to 3 (understates bad outcomes — the safe
direction to be wrong in), abandoned runs are counted separately rather
than polluting the averages, and the panel says "small sample" until both
buckets have n≥5. Everything is local to your browser; nothing is sent
anywhere.

Dogfood it for a week, then read one screen: either the intake cuts
regens or it doesn't — and either answer decides what gets built next
(see ROADMAP.md).

## What's deliberately NOT here (see ROADMAP.md before adding)

- Refinement compile after a failed run ("what went wrong?") — Phase 3
- Requirement Graph Engine, coding domain, accounts — gated on validation
