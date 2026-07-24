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

## 4. The LLM layer (✅ shipped 2026-07-23; multi-provider 2026-07-23)

BYOK, and **any provider** — the user picks one (Anthropic, OpenAI, NVIDIA,
Google, Groq, Mistral, OpenRouter, or a custom OpenAI-compatible endpoint)
and brings that provider's key, one at a time. `lib/providers.ts` is the
single registry both the UI and the server route read.

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
- **Behavior (unchanged):** conservative extraction (the prompt forbids
  inventing fields), already-answered fields ride along so they're never
  re-asked, `mergeAnalysis` fills **empty fields only** — user picks always
  win, and `nextQuestion` is the single highest-leverage question.
- **Tests:** merge invariants; both analyze paths with mocked fetch
  (Anthropic headers/model/schema, proxy provider/model/key + enum
  coercion + JSON salvage + error passthrough); the route handler
  (forwarding, SSRF, error passthrough, Anthropic-refusal); provider
  registry + `isSafeBaseUrl`.
- **Key strategy — DECIDED 2026-07-23: BYOK.** The user pastes their own
  Anthropic API key into the UI; it lives in browser `localStorage` only
  and is never persisted server-side. Two implementation options when
  building: direct browser → Anthropic calls (the API supports CORS via
  the `anthropic-dangerous-direct-browser-access: true` header — keeps the
  app fully static, key never touches our infra) or a thin pass-through
  route. Prefer the direct-browser path: with BYOK the key is the user's
  own, and static hosting stays possible.
- **Fallback:** route absent/erroring → client keeps the static form.
  No feature of the app may *require* the route.

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

- Requirement Graph Engine (dynamic question DAG) — the LLM "next best
  question" is the cheap approximation; graduate only if it proves out.
- Coding domain — the original wedge; revisit after image+video validates
  (the MCP server is the natural bridge when it happens).
- Accounts — localStorage until someone actually asks to log in.
