# Publishing `spec-compiler-mcp`

The distribution ladder from DESIGN.md/ROADMAP.md, cheapest rung first.
Everything below assumes the app's deps are installed
(`cd ../spec-compiler-mvp && npm ci`) because the bundle is built from that
source.

## 0. Sanity check the bundle

```bash
cd mcp-server
npm run build                 # → dist/server.mjs (self-contained)
node dist/server.mjs          # should print the stdio-ready line on stderr
```

## 1. Publish to npm  ← highest leverage

Turns "clone my repo" into `npx -y spec-compiler-mcp`.

```bash
# One-time: log in (create a free npmjs.com account first)
npm login

cd mcp-server
npm publish --access public   # prepublishOnly rebuilds dist/ automatically
```

- **Verify the name is free first:** `npm view spec-compiler-mcp` — a 404
  means it's available. If taken, scope it (`@ashish-reddya/spec-compiler-mcp`)
  in `package.json` `name`, and update `server.json` + this file.
- Bump `version` in `package.json` **and** `server.json` on every release
  (npm rejects a re-publish of the same version).

## 2. List in registries  ← free discovery

### Official MCP Registry
The [`server.json`](./server.json) here is the manifest. Install the
official CLI and let it validate/publish (it authenticates via GitHub, which
authorizes the `io.github.ashish-reddya/*` namespace):

```bash
# https://github.com/modelcontextprotocol/registry — install `mcp-publisher`
mcp-publisher login github
mcp-publisher validate         # checks server.json against the live schema
mcp-publisher publish
```

> `server.json` is written to the 2025-07-09 schema. If `validate` flags a
> field, the CLI is the source of truth — run `mcp-publisher init` to
> regenerate it against the current schema, then re-apply the description.

### Smithery
[`smithery.yaml`](./smithery.yaml) describes the stdio start command.
Submit at [smithery.ai](https://smithery.ai) → **Add Server** → point it at
this repo. Smithery indexes the yaml and gives you a one-click install page.

### PulseMCP / Glama / mcp.so
These auto-index public GitHub repos and npm packages — usually no file
needed. If you want to hurry it along, submit the repo URL on each site.
Being on npm (step 1) is what makes these light up.

## 3. Remote transport (later, only if there's demand)

The current server is stdio (local). A hosted Streamable-HTTP transport
would let people add it by URL with zero install. The tools are pure and
need no secrets, so it's an easy lift — but validate the tool first. Not
built yet on purpose (see ROADMAP.md).
