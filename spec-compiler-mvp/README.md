# Spec Compiler — MVP

Ask a few questions before you generate. Get one compiled prompt per
platform (Midjourney / DALL-E / Higgsfield) so you don't burn a credit
on the wrong format, style, or a missing dealbreaker detail.

This is the Phase 1 cut of the "AI Requirement Elicitation Engine" idea —
scoped deliberately small so it's shippable in days, not weeks. See
**What's deliberately NOT here** below before extending it.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Fonts load from Google Fonts on first build —
you'll need normal internet access for `npm run build` / `npm run dev`
to pick up Space Grotesk / JetBrains Mono / Inter.

## How it's wired

```
lib/types.ts          → ImageSpec: the structured schema everything else builds on
lib/completeness.ts   → scoreSpec(): turns the spec into a % + "credits at risk" count
lib/compilers.ts       → compileMidjourney / compileDalle / compileHiggsfield / compileAll
components/QuestionFlow.tsx      → the 4-field intake (idea, format, style, non-negotiable, exclusions)
components/CompletenessMeter.tsx → the "credits at risk" ticker + missing-field list
components/ResultsPanel.tsx      → the 3 receipt-style output cards with copy buttons
app/page.tsx           → orchestrates state; the only place spec/results live
```

There's no backend, no database, no LLM call anywhere in this MVP. The
compilers are pure template functions — spec in, prompt string out. That's
intentional: it proves the "ask first" UX loop without betting on the
harder infrastructure yet.

## Design intent

Everything is framed around the actual value prop this idea validated on:
not "better prompts," but **avoiding wasted spend**. The completeness
meter is a "CREDITS AT RISK" counter, not a generic progress bar. Each
missing field is labeled with what it *prevents*, not just "required."
Results render as torn-receipt cards — the visual metaphor for "this is
what you're about to spend."

## The one real design decision: Higgsfield model routing

`chooseHiggsfieldModel()` in `lib/compilers.ts` is a simple heuristic
(text/logo → GPT Image 2, realistic style → Seedream, exclusions →
Nano Banana Pro, otherwise → Reve). This is the one place the compiler
does more than reformat a string — it's picking *which* of Higgsfield's
models to route to. Replace this with real usage data once you have it;
it's isolated in one function on purpose.

## What's deliberately NOT here (from the original PRD)

Don't add these until this loop has proven itself with real use:

- **Intent Classifier / domain detection** — domain is hardcoded to image gen
- **Requirement Graph Engine** — questions are a fixed Level 1 set, not a dynamic graph
- **Level 2 / Level 3 question depth** — only the 4 highest-leverage fields exist
- **Coding domain** — the original wedge idea; comes after this validates
- **Accounts / persistence** — spec lives in React state only, resets on refresh
- **Real generation calls** — this only compiles prompts, it doesn't call
  Midjourney/DALL-E/Higgsfield APIs. Wiring that up (Higgsfield has an MCP
  server) is a reasonable next step once the question set is proven useful.

## Suggested next step

Dogfood it for a week on real image requests before adding anything.
The test that matters: does answering these 4 fields upfront actually
cut the number of regenerations, or does it just add friction? If it's
the latter, the question set — not the architecture — is what needs
to change first.
