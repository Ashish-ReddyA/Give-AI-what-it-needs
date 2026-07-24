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
lib/questions.ts        question-engine model + composeSubject (weaves
                        answers into the subject the compilers see)
lib/store.ts            localStorage persistence, defensively sanitized
                        field-by-field on load (corrupt data → defaults)
lib/__tests__/          vitest suite for all of the above
components/             fields · QuestionFlow · VideoQuestionFlow ·
                        ProviderKeyBar · QuestionEngine · CompletenessMeter ·
                        ResultsPanel · OutcomeTracker · OutcomeStats
app/page.tsx            domain toggle + state + persistence + compile gate
```

No database. The compilers are pure template functions, and that's
permanent (deterministic core, intelligent edges — see DESIGN.md §3). The
AI's job is the **question engine** below.

## The question engine (BYOK — any provider)

**The AI asks; it doesn't fill a form.** Type an idea, and the AI generates
the questions *that idea* needs — "a cat playing with a ball" → cat pose?
cat color? the ball? — each with tap-or-type options. Hit **Deep Analysis**
and it breaks the idea into parts (Cat · Ball · Background); click one and
it asks detailed questions about just that part. Every answer weaves into
the compiled prompt. The fixed technical picks (aspect ratio, duration,
style…) stay as instant taps — the AI only asks the subject questions.

Pick a provider (Anthropic, OpenAI, NVIDIA, Google, Groq, Mistral,
OpenRouter, or a custom OpenAI-compatible endpoint), paste **your own** key,
one at a time.

- **Where the key goes:** Anthropic is **browser-direct**, so the key never
  leaves your browser. Every other provider blocks browser calls (CORS), so
  its request goes through the app's own `/api/analyze` proxy — a pure
  pass-through that forwards to the provider and **never stores the key**.
  The key lives only in your browser's localStorage; there is no app-side
  API key.
- **Skippable & additive** — answer only what matters; nothing is
  overwritten; the whole question tree persists across refresh.
- **Needs a key** — the questions are AI-generated. Without one, the app is
  the plain fixed form.

```
lib/providers.ts        provider registry (UI + proxy read it) + SSRF guard
lib/analyze-core.ts     "already answered" helpers — no SDK
lib/analyze.ts          3 generators: overall / sections / section questions;
                        Anthropic browser-direct, others via proxy
app/api/analyze/route   the same-origin proxy for OpenAI-compatible providers
components/ProviderKeyBar   provider picker + key/model
components/QuestionEngine    the dynamic Q&A + Deep Analysis drill-down
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
