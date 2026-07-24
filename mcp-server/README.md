# spec-compiler-mcp

**Ask first, spend once.** An MCP server that asks the few questions AI
image/video generation actually needs, then compiles one ready-to-paste
prompt per platform — so agents (and the people driving them) stop burning
credits on the wrong format, length, or a missing dealbreaker detail.

Two tools:

- **`elicit_spec`** — given a domain (`image` | `video`) and whatever the
  user has said so far, returns the required questions still unanswered
  (with allowed options and *why each matters*), plus optional context.
- **`compile_spec`** — compiles the spec into one prompt per platform
  (image: Midjourney / DALL·E / Higgsfield · video: Higgsfield / Veo 3 /
  Runway), each with platform-correct syntax and model routing. Refuses to
  compile an incomplete spec unless `allowIncomplete: true`.

No API key, no network, no secrets — the compilers are pure functions.

## Run it

```bash
npx -y spec-compiler-mcp
```

## Add to a client

**Claude Code**
```bash
claude mcp add spec-compiler -- npx -y spec-compiler-mcp
```

**Claude Desktop** (`claude_desktop_config.json`), **Cursor**
(`.cursor/mcp.json`), **VS Code** (`.vscode/mcp.json`):
```json
{
  "mcpServers": {
    "spec-compiler": {
      "command": "npx",
      "args": ["-y", "spec-compiler-mcp"]
    }
  }
}
```

## Source & development

This package ships a single self-contained bundle built from
[`Give-AI-what-it-needs`](https://github.com/Ashish-ReddyA/Give-AI-what-it-needs)
(`spec-compiler-mvp/mcp/`). To build locally from the repo:

```bash
cd mcp-server && npm run build   # → dist/server.mjs, runnable with node
node dist/server.mjs
```

Publishing steps (npm + MCP Registry + Smithery) are in
[`PUBLISHING.md`](./PUBLISHING.md).

## License

MIT
