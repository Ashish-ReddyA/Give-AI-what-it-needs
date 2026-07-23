# Project Status & Roadmap

_Last updated: 2026-07-23 (v2 — after the design review; see DESIGN.md)_

This is the "where are we / what's next" document. It's grounded in the code
actually in the repo, not in intentions.

> **2026-07-23 design review:** the v1 plan below was critiqued and four
> product decisions were locked — image+video wedge, LLM-with-fallback
> intelligence, web+MCP distribution, real-users-ASAP goal. DESIGN.md has
> the critique and target architecture. Phase 1.25 shipped the same day;
> the phase table in §3 reflects the v2 plan. Sections 1–2 below describe
> the v1 state and are kept for history.

---

## 1. Where we are

### The one-line status
A **working Phase 1 MVP exists and builds clean**, but until this change it was
trapped inside a `.zip` and not version-controlled. The product loop
("ask 4 questions → compile a prompt per platform") is complete and shippable.
Nothing downstream of it — real generation, measurement, persistence — exists
yet, and that's deliberate.

### What shipped in this change (Phase 0 — housekeeping)
- Extracted the MVP source from `Prompt-help-mvp.zip` into
  [`spec-compiler-mvp/`](./spec-compiler-mvp) so it's actually in git.
- Removed the redundant zip (its full contents now live as source; git history
  retains it).
- Added a real top-level `README.md` and this roadmap.
- Added `*.tsbuildinfo` to `.gitignore`.

### The MVP, verified (2026-07-23)
| Check | Result |
|-------|--------|
| `npm install` | ✓ 111 packages, clean |
| `tsc --noEmit` (strict) | ✓ no errors |
| `npm run build` | ✓ compiles, static-prerenders 4 routes |
| Bundle size | ~4.2 kB page / ~91 kB first load JS |

Stack: Next.js 14.2 (App Router) · React 18 · TypeScript (strict) · Tailwind 3.4.
Pure client-side. No backend, no database, no LLM call anywhere.

### How it's wired
```
lib/types.ts          ImageSpec — the structured schema everything builds on
lib/completeness.ts   scoreSpec() — spec → % complete + "credits at risk" count
lib/compilers.ts      compileMidjourney / compileDalle / compileHiggsfield
components/           QuestionFlow · CompletenessMeter · ResultsPanel
app/page.tsx          orchestrates state — the only place spec + results live
```
The core loop: a 4-field intake (idea, format, style, non-negotiable; plus
optional format-use and exclusions) feeds a completeness score, which gates
three compiled "receipt" cards you can copy. The compilers are deterministic
template functions — spec in, prompt string out.

The single non-trivial piece of logic is `chooseHiggsfieldModel()` in
`lib/compilers.ts` — a small, explainable heuristic that routes to one of
Higgsfield's models (GPT Image 2 for text/logos, Seedream for realism,
Nano Banana Pro when exclusions are present, else Reve). It's isolated in one
function on purpose, ready to be replaced by real usage data.

### What is deliberately NOT built yet
Straight from the original PRD / MVP README — do not add these until the loop
proves itself with real use:
- **Intent classifier / domain detection** — domain is hardcoded to image gen.
- **Requirement Graph Engine** — questions are a fixed Level 1 set, not dynamic.
- **Level 2 / Level 3 question depth** — only the 4 highest-leverage fields exist.
- **Coding domain** — the original wedge idea; comes after image gen validates.
- **Accounts / persistence** — spec lives in React state, resets on refresh.
- **Real generation calls** — it compiles prompts, it doesn't call any image API.

### Known gaps in the MVP itself (cheap to close, not blocking)
- ~~No test suite.~~ ✅ Closed in Phase 1.25 — 32 vitest unit tests on the
  pure-function core.
- ~~No ESLint config.~~ ✅ Closed in Phase 1.25 (`next/core-web-vitals`).
- No persistence — refreshing the page loses the spec, which makes the
  dogfooding the README asks for actively painful.
- No instrumentation — there is no way to measure the one thing the product
  claims to improve (regenerations avoided).

---

## 2. What to build next

### The gate we're at
The MVP README is explicit and correct: **dogfood before adding features.**
The test that matters is *"does answering these 4 fields upfront actually cut
the number of regenerations, or does it just add friction?"*

The problem: **the app currently cannot answer that question about itself.**
The spec resets on refresh and nothing is logged. So the honest next build
isn't a new feature — it's the instrumentation that turns dogfooding into a
signal.

### ⭐ Recommendation: Phase 1.5 — Make the loop measurable
**Goal:** be able to tell, after a week of real use, whether the intake helps.

Scope (all client-side, no backend bet):
1. **Persist state to `localStorage`** — spec + last compiled results survive a
   refresh; add a visible "clear / new spec" control. Removes the biggest
   friction in dogfooding.
2. **Outcome log** — after copying a prompt, capture a one-tap result:
   *first try* / *N regenerations* / *abandoned*, plus which platform. Append
   to a local history.
3. **A single honest stat** — show the running history (e.g. avg regenerations,
   count of specs where the completeness meter was full vs. partial). No
   dashboards; just enough to eyeball the hypothesis.

**Why this first:** it's small (days, not weeks), it bets on nothing risky, and
it directly unblocks *every* later decision — you'll have data on whether to
double down on the question set, deepen it (Level 2), or pivot the domain.

**Acceptance:** you can dogfood for a week, then read one screen and say
"the intake cut regenerations from ~X to ~Y" or "it didn't — the question set
is the problem." Either answer is a win; today you can produce neither.

### The alternative, if the goal is "make it real" instead of "measure"
**Phase 2a — Close the loop with real generation** (wire up Higgsfield's MCP
server so a compiled spec actually generates an image in-app). This is the more
exciting step and the natural sequel, but it's higher effort and bets on
infrastructure *before* the question set is validated — the ordering the README
warns against. Recommend it only if you've already got a gut read that the
intake helps and want an end-to-end demo.

---

## 3. Phased roadmap (v2 — post design review)

| Phase | Theme | Ships | Status |
|-------|-------|-------|--------|
| 0 | Housekeeping | Code in git, README, roadmap | ✅ 2026-07-23 |
| **1.25** | **Design-review hardening** | **Video domain (Higgsfield/Veo/Runway) · compiler correctness fixes (MJ v7, conditional `--style raw`, negation-aware routing) · dated platform knowledge (`lib/platforms.ts`) · honest meter + coherent compile gate · 32 unit tests · ESLint** | ✅ 2026-07-23 |
| 1.5 | Measure + ship | localStorage persistence + outcome log + one stat · **deploy publicly (Vercel)** · share to communities | ⭐ next — owner will handle deploy account |
| 2a | LLM intake | **BYOK (decided 2026-07-23)**: user's key in localStorage, Claude parses the idea → pre-fills fields + next-best question, graceful fallback (DESIGN.md §4) | unblocked — buildable now |
| 2b | MCP server | `elicit_spec` / `compile_spec` over stdio; agents run the flow in-chat (DESIGN.md §5, `spec-compiler-mvp/mcp/`) | ✅ 2026-07-23 |
| 3 | Close the retry loop | "What went wrong?" → compiled refinement per platform | after 1.5 instruments outcomes |
| 4 | New domain | Intent classifier + the **coding** wedge | after image+video validates |
| 5 | Product | Accounts, saved specs, sharing | when someone asks to log in |

Guardrail unchanged: **each phase is gated by the previous one producing
signal.** The Requirement Graph Engine stays unbuilt until the LLM
next-question approximation (2a) proves the concept.

---

## 4. Owner decisions (recorded 2026-07-23)
- **Deploy target + account** (Phase 1.5): owner will set up the deploy
  (Vercel) after the current build phases. Note: with BYOK there is no
  server-side secret, so a fully static deploy is possible.
- **API key strategy** (Phase 2a): **BYOK** — the user pastes their own
  Anthropic key, stored in browser localStorage only. See DESIGN.md §4.
- **Where to announce** (Phase 1.5): **all channels** — r/midjourney,
  AI-video Discords, and X.
