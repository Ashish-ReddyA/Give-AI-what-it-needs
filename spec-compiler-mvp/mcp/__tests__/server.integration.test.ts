// End-to-end test: spawns the real MCP server over stdio and drives it
// with the official MCP client — exactly what Claude Code/Desktop does.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let client: Client;

beforeAll(async () => {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "mcp/server.ts"],
    cwd: process.cwd(),
  });
  client = new Client({ name: "integration-test", version: "0.0.0" });
  await client.connect(transport);
}, 60_000);

afterAll(async () => {
  await client?.close();
});

function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  const block = content.find((c) => c.type === "text");
  expect(block?.text).toBeTruthy();
  return block!.text!;
}

describe("spec-compiler MCP server (stdio)", () => {
  it("lists both tools with schemas", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["compile_spec", "elicit_spec"]);
    const compileTool = tools.find((t) => t.name === "compile_spec")!;
    expect(compileTool.inputSchema.properties).toHaveProperty("allowIncomplete");
  }, 30_000);

  it("elicit_spec returns remaining questions as structured JSON", async () => {
    const result = await client.callTool({
      name: "elicit_spec",
      arguments: { domain: "video", idea: "a barista pouring latte art" },
    });
    const payload = JSON.parse(firstText(result));
    expect(payload.completeness.isComplete).toBe(false);
    expect(payload.questionsRemaining.map((q: { key: string }) => q.key)).toEqual(
      expect.arrayContaining(["format", "duration", "motion", "nonNegotiable"])
    );
  }, 30_000);

  it("compile_spec enforces the gate, then compiles when complete", async () => {
    const incomplete = await client.callTool({
      name: "compile_spec",
      arguments: { domain: "image", idea: "a cat" },
    });
    expect(JSON.parse(firstText(incomplete)).compiled).toBe(false);

    const complete = await client.callTool({
      name: "compile_spec",
      arguments: {
        domain: "image",
        idea: "a cat on a wooden table",
        format: "landscape",
        style: "anime",
        nonNegotiable: "orange tabby",
      },
    });
    const payload = JSON.parse(firstText(complete));
    expect(payload.compiled).toBe(true);
    expect(payload.prompts).toHaveLength(3);
    expect(payload.prompts[0].prompt).toContain("--ar 16:9");
  }, 30_000);

  it("rejects an invalid enum value at the schema layer", async () => {
    const result = await client.callTool({
      name: "compile_spec",
      arguments: { domain: "image", idea: "a cat", format: "banner" },
    });
    expect(result.isError).toBe(true);
  }, 30_000);
});
