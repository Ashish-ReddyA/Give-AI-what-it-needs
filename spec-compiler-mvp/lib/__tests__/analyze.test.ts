import { describe, it, expect } from "vitest";
import {
  generateOverallQuestions,
  generateSections,
  generateSectionQuestions,
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

const OVERALL = {
  questions: [
    { id: "cat_pose", question: "How is the cat posed?", options: ["sitting", "mid-pounce"] },
    { id: "cat_color", question: "What colour is the cat?", options: ["orange tabby"] },
    { id: "ball", question: "Describe the ball", options: [] },
  ],
};

describe("generateOverallQuestions — Anthropic (browser-direct)", () => {
  it("calls api.anthropic.com with structured output and namespaces ids", async () => {
    const captured: Captured[] = [];
    const questions = await generateOverallQuestions(
      "image",
      "a cat playing with a ball",
      { style: "realistic" },
      {
        providerId: "anthropic",
        apiKey: "sk-ant-test",
        fetch: capture(anthropicWire(OVERALL), captured),
      }
    );

    expect(questions).toHaveLength(3);
    expect(questions[0].id).toBe("o_cat_pose");
    expect(questions[0].options).toEqual(["sitting", "mid-pounce"]);
    expect(questions[2].options).toEqual([]);

    const r = captured[0];
    expect(r.url).toContain("api.anthropic.com");
    expect(r.headers.get("x-api-key")).toBe("sk-ant-test");
    expect(r.headers.get("anthropic-dangerous-direct-browser-access")).toBe("true");
    expect((r.body.output_config as { format: { type: string } }).format.type).toBe(
      "json_schema"
    );
    const sent = JSON.parse((r.body.messages as Array<{ content: string }>)[0].content);
    expect(sent.idea).toContain("cat");
    expect(sent.alreadyAnswered).toEqual({ style: "realistic" });
  });
});

describe("generateOverallQuestions — openai-compat (via proxy)", () => {
  it("posts to /api/analyze with provider/model/key and namespaces ids", async () => {
    const captured: Captured[] = [];
    const questions = await generateOverallQuestions(
      "video",
      "a barista pouring latte art",
      {},
      {
        providerId: "openai",
        apiKey: "sk-openai-test",
        model: "gpt-4o-mini",
        fetch: capture({ text: JSON.stringify(OVERALL) }, captured),
      }
    );

    expect(questions.map((q) => q.id)).toEqual(["o_cat_pose", "o_cat_color", "o_ball"]);

    const r = captured[0];
    expect(r.url).toBe("/api/analyze");
    expect(r.headers.get("x-provider-key")).toBe("sk-openai-test");
    expect(r.body.provider).toBe("openai");
    expect(r.body.model).toBe("gpt-4o-mini");
    expect(String(r.body.system)).toMatch(/JSON object/i);
  });

  it("salvages JSON wrapped in prose / code fences and drops junk questions", async () => {
    const questions = await generateOverallQuestions(
      "image",
      "a cat",
      {},
      {
        providerId: "groq",
        apiKey: "gsk-x",
        model: "openai/gpt-oss-20b",
        fetch: capture(
          {
            text:
              'Sure!\n```json\n{"questions":[{"id":"a","question":"Q1","options":["x"]},{"question":""},{"nope":1}]}\n```',
          },
          []
        ),
      }
    );
    expect(questions).toHaveLength(1); // blank + malformed dropped
    expect(questions[0].id).toBe("o_a");
  });

  it("surfaces a proxy error", async () => {
    await expect(
      generateOverallQuestions(
        "image",
        "a cat",
        {},
        {
          providerId: "openai",
          apiKey: "sk-bad",
          model: "gpt-4o-mini",
          fetch: capture({ error: "Incorrect API key provided." }, [], 401),
        }
      )
    ).rejects.toThrow(/Incorrect API key/);
  });
});

describe("generateSections", () => {
  it("returns normalized, capped sections", async () => {
    const sections = await generateSections(
      "image",
      "a cat playing with a ball",
      {},
      {
        providerId: "openrouter",
        apiKey: "sk-or-x",
        model: "openai/gpt-4o-mini",
        fetch: capture(
          {
            text: JSON.stringify({
              sections: [
                { id: "cat", label: "Cat" },
                { id: "ball", label: "Ball" },
                { id: "bg", label: "Background" },
                { label: "no id still ok" },
                { id: "x" }, // no label → dropped
              ],
            }),
          },
          []
        ),
      }
    );
    const labels = sections.map((s) => s.label);
    expect(labels).toContain("Cat");
    expect(labels).toContain("Background");
    expect(labels).not.toContain(undefined);
    expect(sections.every((s) => s.id && s.label)).toBe(true);
  });
});

describe("generateSectionQuestions", () => {
  it("namespaces question ids by section", async () => {
    const questions = await generateSectionQuestions(
      "image",
      "a cat playing with a ball",
      { id: "cat", label: "Cat" },
      {},
      {
        providerId: "anthropic",
        apiKey: "sk-ant",
        fetch: capture(
          anthropicWire({
            questions: [
              { id: "fur", question: "Fur colour?", options: ["orange"] },
              { id: "eyes", question: "Eye colour?", options: ["green"] },
            ],
          }),
          []
        ),
      }
    );
    expect(questions.map((q) => q.id)).toEqual(["s_cat_fur", "s_cat_eyes"]);
  });
});
