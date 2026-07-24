import { describe, it, expect } from "vitest";
import {
  generateEntities,
  generateEntityQuestions,
  composeScene,
} from "../analyze";

// ---- wire tests: mocked fetch, real request paths ----

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function capture(
  response: unknown,
  captured: Captured[],
  status = 200
): typeof fetch {
  return async (url, init) => {
    captured.push({
      url: String(url),
      headers: new Headers(init?.headers as HeadersInit),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify(response), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
}

function anthropicWire(payload: unknown) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [{ type: "text", text: JSON.stringify(payload) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

describe("generateEntities", () => {
  it("extracts the things in the idea (Anthropic browser-direct)", async () => {
    const captured: Captured[] = [];
    const entities = await generateEntities(
      "image",
      "a barista pouring latte in a sunset cafe",
      { style: "realistic" },
      {
        providerId: "anthropic",
        apiKey: "sk-ant",
        fetch: capture(
          anthropicWire({
            entities: [
              { id: "barista", label: "Barista" },
              { id: "latte", label: "Latte" },
              { id: "cafe", label: "Cafe" },
              { id: "scene", label: "Scene" },
            ],
          }),
          captured
        ),
      }
    );
    expect(entities.map((e) => e.label)).toEqual([
      "Barista",
      "Latte",
      "Cafe",
      "Scene",
    ]);
    const r = captured[0];
    expect(r.url).toContain("api.anthropic.com");
    expect(r.headers.get("anthropic-dangerous-direct-browser-access")).toBe("true");
    const sent = JSON.parse((r.body.messages as Array<{ content: string }>)[0].content);
    expect(sent.alreadyAnswered).toEqual({ style: "realistic" });
  });

  it("drops entities without a label and caps the list", async () => {
    const entities = await generateEntities(
      "image",
      "x",
      {},
      {
        providerId: "openai",
        apiKey: "k",
        model: "gpt-4o-mini",
        fetch: capture(
          {
            text: JSON.stringify({
              entities: [{ id: "a", label: "A" }, { id: "b" }, { junk: 1 }],
            }),
          },
          []
        ),
      }
    );
    expect(entities).toEqual([{ id: "a", label: "A" }]);
  });
});

describe("generateEntityQuestions", () => {
  it("namespaces ids by entity and carries the multi flag (proxy path)", async () => {
    const captured: Captured[] = [];
    const questions = await generateEntityQuestions(
      "image",
      "a barista pouring latte in a sunset cafe",
      { id: "barista", label: "Barista" },
      {},
      {
        providerId: "openai",
        apiKey: "sk-openai",
        model: "gpt-4o-mini",
        fetch: capture(
          {
            text: JSON.stringify({
              questions: [
                { id: "traits", question: "Barista traits?", options: ["young adult", "female"], multi: true },
                { id: "pose", question: "Pose?", options: ["pouring"], multi: false },
                { question: "" }, // dropped
              ],
            }),
          },
          captured
        ),
      }
    );
    expect(questions).toHaveLength(2);
    expect(questions[0].id).toBe("barista_traits");
    expect(questions[0].multi).toBe(true);
    expect(questions[1].multi).toBe(false);

    const r = captured[0];
    expect(r.url).toBe("/api/analyze");
    expect(r.headers.get("x-provider-key")).toBe("sk-openai");
    expect(String(r.body.system)).toMatch(/Barista/);
  });

  it("defaults multi to false when the model omits it", async () => {
    const questions = await generateEntityQuestions(
      "image",
      "a cat",
      { id: "cat", label: "Cat" },
      {},
      {
        providerId: "groq",
        apiKey: "gsk",
        model: "openai/gpt-oss-20b",
        fetch: capture({ text: '{"questions":[{"id":"fur","question":"Fur?","options":["orange"]}]}' }, []),
      }
    );
    expect(questions[0].multi).toBe(false);
  });
});

describe("composeScene", () => {
  it("returns the AI-written prose prompt (proxy path)", async () => {
    const captured: Captured[] = [];
    const prompt = await composeScene(
      "video",
      "a barista pouring latte in a sunset cafe",
      { "Barista traits?": "young adult, female", "Latte?": "being poured from a steel jug" },
      {
        providerId: "openai",
        apiKey: "sk-openai",
        model: "gpt-4o-mini",
        fetch: capture(
          { text: JSON.stringify({ prompt: "A young female barista pours latte from a steel jug in a sunset-lit cafe." }) },
          captured
        ),
      }
    );
    expect(prompt).toContain("young female barista");
    expect(prompt).not.toContain(","); // it's prose, not the comma dump
    // details travel to the model
    const sent = JSON.parse(String(captured[0].body.user));
    expect(sent.details["Barista traits?"]).toBe("young adult, female");
  });

  it("uses structured output on the Anthropic path", async () => {
    const captured: Captured[] = [];
    const prompt = await composeScene(
      "image",
      "a cat",
      { "Fur?": "orange tabby" },
      {
        providerId: "anthropic",
        apiKey: "sk-ant",
        fetch: capture(anthropicWire({ prompt: "An orange tabby cat." }), captured),
      }
    );
    expect(prompt).toBe("An orange tabby cat.");
    expect((captured[0].body.output_config as { format: { type: string } }).format.type).toBe(
      "json_schema"
    );
  });

  it("throws on an empty prompt", async () => {
    await expect(
      composeScene(
        "image",
        "a cat",
        {},
        { providerId: "openai", apiKey: "k", model: "gpt-4o-mini", fetch: capture({ text: '{"prompt":""}' }, []) }
      )
    ).rejects.toThrow(/empty/);
  });
});
