# Spec Compiler — MCP server

The elicit → compile loop as MCP tools, so any agent (Claude Code, Claude
Desktop, anything MCP-capable) can run "ask first, spend once" inside chat —
where people already prompt. Same pure `lib/` as the web app; this directory
is only registration + stdio transport.

## Tools

| Tool | What it does |
|------|--------------|
| `elicit_spec` | Given a domain (`image` \| `video`) and whatever the user has said so far, returns the required questions still unanswered — with allowed options and *why each matters* — plus optional context worth asking for (e.g. audio, which changes video model routing). |
| `compile_spec` | Compiles the spec into one ready-to-paste prompt per platform (image: Midjourney / DALL·E / Higgsfield · video: Higgsfield / Veo 3 / Runway), each with platform-correct syntax, model routing, and an explanatory note. **Refuses to compile an incomplete spec** unless `allowIncomplete: true` — the same explicit gate the web UI has. |

Both return structured JSON with an `instructions` field telling the agent
what to do next, so the loop is self-documenting.

## Run it

```bash
npm install          # once, from spec-compiler-mvp/

# dev (tsx, no build step)
npm run mcp

# production single-file bundle (no tsx needed at runtime)
npm run mcp:build    # → mcp/dist/server.mjs
node mcp/dist/server.mjs
```

## Connect from Claude Code

From the repo root (`.mcp.json` is already checked in, so opening this repo
in Claude Code picks the server up automatically). To add it manually or in
another project:

```bash
claude mcp add spec-compiler -- npm --prefix /abs/path/to/spec-compiler-mvp run -s mcp
# or, after npm run mcp:build:
claude mcp add spec-compiler -- node /abs/path/to/spec-compiler-mvp/mcp/dist/server.mjs
```

## Connect from Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "spec-compiler": {
      "command": "node",
      "args": ["/abs/path/to/spec-compiler-mvp/mcp/dist/server.mjs"]
    }
  }
}
```

(Build the bundle first: `npm run mcp:build`.)

## Example exchange

```
elicit_spec { domain: "video", idea: "a barista pouring latte art" }
→ 4 questions remaining (format, duration, motion, non-negotiable),
  optional: audio ("changes which model is routed to"), exclusions

compile_spec { domain: "video", idea: "...", format: "portrait",
               duration: "short", motion: "static",
               nonNegotiable: "heart-shaped latte art",
               audio: "barista says enjoy" }
→ compiled: true — Higgsfield (routed to Veo 3.1 because audio is
  required), Veo 3 (prose + Audio: cue), Runway (⚠ flags that it
  cannot render the requested audio)
```

## Testing

`npm test` includes this server: unit tests over the pure tool logic
(`mcp/__tests__/tools.test.ts`) and an end-to-end test that spawns the
real stdio server and drives it with the official MCP client
(`mcp/__tests__/server.integration.test.ts`).
