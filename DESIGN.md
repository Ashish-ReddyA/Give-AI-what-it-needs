# Design v2 — Spec Compiler

_Decided 2026-07-23. This document records the critique of v1, the four
locked product decisions, and the target architecture. ROADMAP.md carries
the phasing; this carries the "why."_

---

## 1. Critique of v1 (what forced the redesign)

**Idea-level**
1. **Wrong economics for the wedge.** "Ask first, spend once" is strongest
   where generation is expensive and slow. Image regens are nearly free and
   iteration is part of the creative loop; the honest version of the pitch
   lives in **video** (10–100× cost per run, minutes of wait) and coding
   agents. v1 planted the value prop in the domain where it was weakest.
2. **The tool knew nothing the user didn't.** A static 4-field form + string
   concatenation. Type "orange tabby, anime, 16:9" into the idea box and the
   app asked for style and format *you already typed*. Below the
   minimum-intelligence threshold to prove the elicitation idea.
3. **"CREDITS AT RISK" was fake math** — `missing.length` relabeled. If honest
   economics is the centerpiece, the number must be honest.
4. **Distribution unsolved.** Nobody visits a separate site before opening
   Midjourney. Standalone web app is the weakest possible placement.
5. **The loop ended at "copy".** The moment of highest value — the failed
   first generation, the retry — was unsupported.

**Implementation-level**
- `--style raw --v 6` hardcoded on every Midjourney prompt (raw kills
  beautification; v6 stale). Nothing versioned or dated.
- "Shallow depth of field" appended to every realistic request — ruins
  landscapes.
- `chooseHiggsfieldModel` routed "**no** text" to the *text-rendering* model
  (naive substring match).
- Meter and gate contradicted each other: full results rendered at 25%
  completeness while the meter screamed "3 credits at risk."
- Zero tests on a ~90% pure-function codebase; no ESLint; no deploy.

## 2. The four locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| Wedge | **Image + video** | Video is where credits-at-risk is literally true; Higgsfield (already a target) is video-first. Image stays as the cheap-iteration domain. |
| Intelligence | **LLM with deterministic fallback** | One Claude call parses the idea (pre-fill fields, kill redundant questions) and picks the next best question. Template compilers stay the trustworthy, testable backbone. App works fully without a key. |
| Form factor | **Web app + MCP server** | The web app is the demo/dogfood surface. The pure-TS `lib/` compiles unchanged into an MCP server so agents can run elicit→compile inside chat — where people already prompt. |
| Goal | **Real users ASAP** | Deploy publicly, share to AI-art/prompting communities, lightweight analytics. Polish follows validation, not the reverse. |

## 3. Target architecture

```
                      ┌──────────────────────────────┐
                      │  lib/ (pure TS, fully tested)│
                      │  types · completeness ·      │
                      │  platforms (dated knowledge) │
                      │  compilers · compilers-video │
                      └──────┬──────────────┬────────┘
                             │              │
                   ┌─────────▼───┐    ┌─────▼──────────┐
                   │  Next.js app │    │  MCP server    │
                   │  (web/dogfood│    │  elicit_spec / │
                   │   + deploy)  │    │  compile_spec  │
                   └─────────┬───┘    └────────────────┘
                             │
                   ┌─────────▼─────────────┐
                   │ /api/analyze (opt-in) │
                   │ Claude parses idea →  │
                   │ pre-filled spec +     │
                   │ next-best question    │
                   └───────────────────────┘
```

**Principles**
- **Deterministic core, intelligent edges.** Compilers never call an LLM —
  they stay pure, testable, and free. The LLM does only what templates
  can't: extract what the idea already specifies, and choose the next
  question. If the LLM layer is down/unkeyed, the app degrades to v2's
  static form, never breaks.
- **Dated platform knowledge.** All platform facts (MJ version, model
  routing tables) live in `lib/platforms.ts` with a `KNOWLEDGE_VERIFIED`
  date that surfaces in every compiled result. Stale knowledge is visible,
  never silent. Tests assert against the config, not magic strings.
- **The meter never lies.** "REGEN RISKS: N" = unpinned required fields,
  and the UI says exactly that. Results are gated until complete or the
  user explicitly clicks "compile anyway" — the meter and the gate can't
  contradict each other.
- **Close the loop.** After the user generates, capture the outcome
  (first try / N regens / abandoned) and, on failure, compile a targeted
  refinement (add to `--no`, rephrase the failed constraint, reuse seed).
  This is both the killer feature and the instrumentation that finally
  measures "regenerations avoided."

## 4. The LLM layer — the question engine (✅ 2026-07-24)

**This is the core.** The AI does not pre-fill a fixed form — it **reads the
idea and generates the questions**, tailored to the subject, then lets the
user drill into any part. "a cat playing with a ball" → *cat pose? cat
color? the ball?* → **Deep Analysis** → sections (Cat · Ball · Background) →
click one → detailed questions about just that part. (An earlier version
merely pre-filled the fixed fields from the idea; that was the shallow
version — this is the real elicitation the whole project is named for.)

- **Hybrid split (locked with the user):** the enumerated technical picks
  (aspect ratio, duration, style, motion…) stay as instant fixed taps on
  the spec; the AI generates only the **subject/detail** questions. Two
  levels: overall → sections → per-section questions (`lib/questions.ts`,
  `lib/analyze.ts`, `components/QuestionEngine.tsx`).
- **Answers → prompt:** every answer accumulates in `qa.answers` and
  `composeSubject()` weaves them into the subject the deterministic
  compilers see. Compilation stays 100% deterministic; the AI only asks.
- **Skippable & additive:** answer only what matters; question ids are
  namespaced (`o_…`, `s_<section>_…`); the whole tree persists to
  localStorage (defensively sanitized).
- **Tests:** the three generators over both transports (id namespacing,
  JSON salvage, error passthrough), `composeSubject`/`buildAnswered`, the
  route handler, and a browser e2e (generate → chip answer → deep
  analysis → section answer → both woven into the compiled prompt →
  persistence).

### Transport & providers (BYOK, any provider, one at a time)

The user picks one provider (Anthropic, OpenAI, NVIDIA, Google, Groq,
Mistral, OpenRouter, or a custom OpenAI-compatible endpoint) and brings that
provider's key. `lib/providers.ts` is the single registry the UI and the
route share.

- **Two routes, by provider kind (`lib/analyze.ts` dispatches):**
  - **Anthropic** → called **directly from the browser** with the user's
    key (`dangerouslyAllowBrowser` sets the CORS opt-in header). Key never
    leaves the browser. Structured outputs via `messages.parse()` +
    `zodOutputFormat` (zod v4). `claude-opus-4-8`.
  - **Everything else** → the browser posts to the app's own same-origin
    **`/api/analyze`** proxy (`app/api/analyze/route.ts`), which forwards
    to the provider's OpenAI-compatible `/chat/completions` with the user's
    key and returns the text. Needed because those providers block direct
    browser calls (CORS). JSON mode + a spelled-out key contract, then the
    result is validated **client-side** (invalid enums → null). The proxy
    never logs or stores the key; there is no app-side API key.
- **Why the proxy:** confirmed empirically — only Anthropic (and a couple
  of others) permit browser-direct calls; NVIDIA/OpenAI/Groq/Mistral do
  not. The proxy is a pure pass-through so *any* provider works while the
  Anthropic path keeps its key-stays-local property.
- **Architecture cost:** the app is no longer 100% static — it now has one
  serverless function (`ƒ /api/analyze`). Still **zero env vars** (every
  request carries the user's own key). Vercel deploys it automatically.
- **SSRF guard:** the custom provider's user-supplied base URL is
  restricted to `https://` and rejected for loopback/private/link-local
  hosts (`isSafeBaseUrl`).
- **Already-answered context:** the answered fixed fields *and* answered
  questions ride along on every call (`buildAnswered`) so the AI never
  re-asks something the user has settled.
- **No key → no questions:** the question engine requires a provider key
  (it's inherently AI). Without one, the app is the plain fixed form.

## 5. The MCP server (✅ shipped 2026-07-23)

- Lives at `spec-compiler-mvp/mcp/` — pure logic in `mcp/tools.ts`
  (unit-tested, imports `lib/` directly), thin stdio wrapper in
  `mcp/server.ts` (`@modelcontextprotocol/sdk`).
- Tools: `elicit_spec` (remaining questions + options + why each matters)
  and `compile_spec` (per-platform prompts; refuses incomplete specs
  unless `allowIncomplete: true` — the web UI's gate, preserved for
  agents). Both return JSON with an `instructions` field so the loop is
  self-documenting.
- Run: `npm run mcp` (dev, tsx) or `npm run mcp:build` →
  `node mcp/dist/server.mjs` (single-file bundle, plain node). Repo-root
  `.mcp.json` auto-registers it for Claude Code. See `mcp/README.md`.
- Verified end-to-end: integration tests spawn the real stdio server and
  drive it with the official MCP client; the built bundle is smoke-tested
  with plain node.
- HTTP transport: later, if remote use materializes.
- This is the differentiated distribution: the elicitation engine becomes
  something *other agents call*, riding the ecosystem instead of fighting
  for a bookmark.

## 6. What we still refuse to build (until data says otherwise)

- **Deeper than two levels** — the question engine (§4) is now the
  dynamic, subject-aware elicitation the project was named for, but capped
  at overall → sections → per-section questions. Unlimited recursive
  drill-down (sub-sections of sub-sections) waits until the two-level
  version proves useful.
- Coding domain — the original wedge; revisit after image+video validates
  (the MCP server is the natural bridge when it happens).
- Accounts — localStorage until someone actually asks to log in.
