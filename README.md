# Give AI What It Needs

Elicit the requirements *before* you generate — so you don't burn a credit
(or a coding-agent run) on the wrong format, style, or a missing dealbreaker.

The long-term idea is an **AI Requirement Elicitation Engine**: ask the few
highest-leverage questions upfront, structure the answers into a spec, and
compile that spec into whatever the downstream tool actually wants.

## Where the code is

| Path | What it is |
|------|-----------|
| [`spec-compiler-mvp/`](./spec-compiler-mvp) | The working Next.js app — **image + video** domains. Answer a few questions → get one compiled prompt per platform (image: Midjourney / DALL·E / Higgsfield · video: Higgsfield / Veo 3 / Runway). Optional **BYOK AI assist**: your own Anthropic key (browser-only) pre-fills fields your idea already answers. |
| [`spec-compiler-mvp/mcp/`](./spec-compiler-mvp/mcp) | **MCP server** — the same elicit → compile loop as tools (`elicit_spec`, `compile_spec`) for Claude Code / Claude Desktop / any MCP agent. `.mcp.json` at this repo's root auto-registers it for Claude Code. |
| [`DESIGN.md`](./DESIGN.md) | The v1 critique, the four locked product decisions, and the target architecture. |
| [`ROADMAP.md`](./ROADMAP.md) | Project status + what to build next. **Start here** if you're deciding what to work on. |

## Quick start

```bash
cd spec-compiler-mvp
npm install
npm run dev      # http://localhost:3000
```

Verified on 2026-07-23: `npm run build` and `tsc --noEmit` both pass clean
(Next.js 14.2, React 18, TypeScript strict). The build fetches Google Fonts,
so it needs network access.

## The bet

The value prop is **not** "better prompts." It's **avoiding wasted spend**.
Every design choice in the MVP is framed around that — the completeness meter
is a "CREDITS AT RISK" counter, and each missing field is labeled with what
it *prevents*, not just "required." See [`ROADMAP.md`](./ROADMAP.md) for how
that hypothesis gets tested next.
