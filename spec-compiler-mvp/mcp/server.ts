// Spec Compiler MCP server — stdio transport.
//
// Exposes the elicit → compile loop to any MCP client (Claude Code,
// Claude Desktop, other agents). All logic lives in mcp/tools.ts and the
// shared lib/; this file is only registration + transport.
//
// The executable shebang is injected by the esbuild banner at bundle time
// (see mcp:build / the published spec-compiler-mcp package), so the source
// stays a plain module that tsx and node can both run.
//
// Run (dev):    npm run mcp
// Run (built):  npm run mcp:build && node mcp/dist/server.mjs
//
// IMPORTANT: stdio servers must never write to stdout except JSON-RPC —
// use console.error for any diagnostics.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { elicit, compile, SpecArgs } from "./tools";

const server = new McpServer({
  name: "spec-compiler",
  version: "0.2.0",
});

// Flat, agent-friendly shape shared by both tools. Fields that don't
// apply to the chosen domain are ignored (documented per field).
const specShape = {
  domain: z
    .enum(["image", "video"])
    .describe(
      "Generation domain. Video is where a wasted run costs real credits — spec it tightly."
    ),
  idea: z
    .string()
    .optional()
    .describe("The user's raw starting idea, e.g. 'a cat on a wooden table'"),
  format: z
    .enum(["square", "landscape", "portrait"])
    .optional()
    .describe("Aspect ratio bucket: square 1:1, landscape 16:9, portrait 9:16"),
  style: z
    .enum(["realistic", "anime", "3d", "illustration"])
    .optional()
    .describe("IMAGE ONLY: visual style bucket"),
  duration: z
    .enum(["short", "medium", "long"])
    .optional()
    .describe("VIDEO ONLY: clip length — short ~5s, medium ~8–10s, long 15s+"),
  motion: z
    .enum(["static", "slow", "dynamic", "handheld"])
    .optional()
    .describe("VIDEO ONLY: camera motion character"),
  nonNegotiable: z
    .string()
    .optional()
    .describe(
      "The ONE dealbreaker detail — if this is wrong the generation is wasted"
    ),
  audio: z
    .string()
    .optional()
    .describe(
      "VIDEO ONLY: dialogue/sound that must be in the clip. Changes model routing — only some models render audio."
    ),
  exclusions: z
    .string()
    .optional()
    .describe("Comma-separated things that must NOT appear, e.g. 'text, watermark'"),
  formatUse: z
    .string()
    .optional()
    .describe("IMAGE ONLY: what the image is for, e.g. 'Instagram post'"),
};

const asJson = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

server.registerTool(
  "elicit_spec",
  {
    title: "Elicit a generation spec",
    description:
      "Start here BEFORE generating an image or video. Given a domain and whatever the user has said so far, returns the required questions still unanswered (with allowed options), plus optional context worth asking for. Ask the user those questions — don't invent answers — then call compile_spec. Each unanswered field is a common cause of a wasted, credit-burning generation.",
    inputSchema: specShape,
  },
  async (args) => asJson(elicit(args as SpecArgs))
);

server.registerTool(
  "compile_spec",
  {
    title: "Compile a spec into platform prompts",
    description:
      "Compile an elicited spec into one ready-to-paste prompt per platform (image: Midjourney / DALL-E / Higgsfield; video: Higgsfield / Veo 3 / Runway), each with platform-correct syntax, model routing, and a note explaining the choices. Refuses to compile an incomplete spec unless allowIncomplete is true — the point is to catch waste BEFORE credits are spent.",
    inputSchema: {
      ...specShape,
      allowIncomplete: z
        .boolean()
        .optional()
        .describe(
          "Explicitly accept compiling with unanswered required fields (counted as regen risks). Default false."
        ),
    },
  },
  async (args) => asJson(compile(args as SpecArgs & { allowIncomplete?: boolean }))
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    "spec-compiler MCP server running on stdio (tools: elicit_spec, compile_spec)"
  );
}

main().catch((err) => {
  console.error("spec-compiler MCP server failed to start:", err);
  process.exit(1);
});
