# Give AI What It Needs

Elicit the requirements *before* you generate — so you don't burn a credit
(or a coding-agent run) on the wrong format, style, or a missing dealbreaker.

The long-term idea is an **AI Requirement Elicitation Engine**: ask the few
highest-leverage questions upfront, structure the answers into a spec, and
compile that spec into whatever the downstream tool actually wants.

## Where the code is

| Path | What it is |
|------|-----------|
| [`spec-compiler-mvp/`](./spec-compiler-mvp) | The working Next.js app — **image + video** domains. The AI **extracts the things in your idea** (barista · latte · cafe · scene), asks deep multi-select questions about each, then **writes one coherent prompt per platform** (image: Midjourney / DALL·E / Higgsfield · video: Higgsfield / Veo 3 / Runway). BYOK, any provider. |
| [`spec-compiler-mvp/mcp/`](./spec-compiler-mvp/mcp) | **MCP server source** — the same elicit → compile loop as tools (`elicit_spec`, `compile_spec`) for Claude Code / Claude Desktop / any MCP agent. `.mcp.json` at this repo's root auto-registers it for Claude Code. |
| [`mcp-server/`](./mcp-server) | The **publishable npm package** (`spec-compiler-mcp`) wrapping that server — a single self-contained bundle so anyone can `npx -y spec-compiler-mcp`. Registry manifests (`server.json`, `smithery.yaml`) and [`PUBLISHING.md`](./mcp-server/PUBLISHING.md) live here. |
| [`DESIGN.md`](./DESIGN.md) | The v1 critique, the four locked product decisions, and the target architecture. |
| [`ROADMAP.md`](./ROADMAP.md) | Project status + what to build next. **Start here** if you're deciding what to work on. |

## Use the MCP server

```bash
# once published to npm:
npx -y spec-compiler-mcp
claude mcp add spec-compiler -- npx -y spec-compiler-mcp
```

See [`mcp-server/README.md`](./mcp-server/README.md) for Claude Desktop /
Cursor / VS Code configs.

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
