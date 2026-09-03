import { describe, it, expect } from "vitest";
import {
  generateEntities,
  generateEntityQuestions,
  composeScene,
  canonicalQuestion,
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
      ["What is in the cafe?"], // already asked elsewhere → must not repeat
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
    // the already-asked list travels so the model won't repeat questions
    const sent = JSON.parse(String(r.body.user));
    expect(sent.alreadyAsked).toEqual(["What is in the cafe?"]);
  });

  it("strips schema-keyword noise the model leaks into options", async () => {
    // A weaker model echoed the literal "multi" token before each real option
    // (the exact bug a user hit). Those junk tokens must never become chips.
    const questions = await generateEntityQuestions(
      "image",
      "a barista in a cafe",
      { id: "cafe", label: "Cafe" },
      {},
      [],
      {
        providerId: "nvidia",
        apiKey: "nv",
        model: "meta/llama-3.1-8b-instruct",
        fetch: capture(
          {
            text: JSON.stringify({
              questions: [
                {
                  id: "contents",
                  question: "What else is in the cafe?",
                  options: [
                    "multi",
                    "plants",
                    "multi",
                    "flowers",
                    "multi",
                    "other customers",
                    "multi",
                    "music playing",
                  ],
                  multi: true,
                },
              ],
            }),
          },
          []
        ),
      }
    );
    expect(questions[0].options).toEqual([
      "plants",
      "flowers",
      "other customers",
      "music playing",
    ]);
    expect(questions[0].multi).toBe(true);
  });

  it("pulls a string out of object-shaped options and dedupes", async () => {
    const questions = await generateEntityQuestions(
      "image",
      "a cat",
      { id: "cat", label: "Cat" },
      {},
      [],
      {
        providerId: "openai",
        apiKey: "k",
        model: "gpt-4o-mini",
        fetch: capture(
          {
            text: JSON.stringify({
              questions: [
                {
                  id: "fur",
                  question: "Fur?",
                  options: [
                    { value: "orange tabby" },
                    { label: "black" },
                    "black",
                    "white",
                  ],
                  multi: true,
                },
              ],
            }),
          },
          []
        ),
      }
    );
    expect(questions[0].options).toEqual(["orange tabby", "black", "white"]);
  });

  it("defaults multi to false when the model omits it", async () => {
    const questions = await generateEntityQuestions(
      "image",
      "a cat",
      { id: "cat", label: "Cat" },
      {},
      [],
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

describe("grounding — the cafe-at-sunrise bug", () => {
  // The exact failure the user reported: "a sunrise in a cafe" produced
  // "is it a cat or a dog?" questions even though no animal was ever
  // mentioned. The prompt rewrites are the primary fix; this test locks down
  // the deterministic backstop that drops stock-animal options when the idea
  // contains no animal. It also asserts the grounding rail text is present in
  // the system prompt so the model is told not to invent subjects.
  function okCapture(response: unknown): typeof fetch {
    return async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
  }

  it("system prompt forbids inventing subjects the idea does not mention", async () => {
    const captured: Captured[] = [];
    await generateEntityQuestions(
      "image",
      "a quiet cafe at sunrise",
      { id: "scene", label: "Scene" },
      {},
      [],
      {
        providerId: "openai",
        apiKey: "k",
        model: "gpt-4o-mini",
        fetch: capture(
          { text: JSON.stringify({ questions: [] }) },
          captured
        ),
      }
    );
    const system = String(captured[0].body.system);
    expect(system).toMatch(/never introduce a new subject/i);
    expect(system).toMatch(/idea.*is the only source of truth/i);
  });

  it("drops stock-animal options when the idea mentions no animal", async () => {
    // A weak model hallucinates animal options for a cafe-sunrise Scene.
    const questions = await generateEntityQuestions(
      "image",
      "a quiet cafe at sunrise",
      { id: "scene", label: "Scene" },
      {},
      [],
      {
        providerId: "nvidia",
        apiKey: "nv",
        model: "meta/llama-3.1-8b-instruct",
        fetch: okCapture({
          text: JSON.stringify({
            questions: [
              {
                id: "subject",
                question: "Is there a cat or a dog in the scene?",
                options: ["a cat", "a dog", "warm sunrise light", "soft steam"],
                multi: true,
              },
            ],
          }),
        }),
      }
    );
    // The animal cliches the user hit must be gone; the idea-relevant options
    // (sunrise light, steam) survive.
    expect(questions[0].options).not.toContain("a cat");
    expect(questions[0].options).not.toContain("a dog");
    expect(questions[0].options).toEqual(["warm sunrise light", "soft steam"]);
  });

  it("keeps animal options when the idea actually mentions that animal", async () => {
    // The filter must not over-fire: if the idea really is about a cat, the
    // cat option is legitimate and must be kept.
    const questions = await generateEntityQuestions(
      "image",
      "a cat sitting in a sunlit cafe",
      { id: "cat", label: "Cat" },
      {},
      [],
      {
        providerId: "openai",
        apiKey: "k",
        model: "gpt-4o-mini",
        fetch: okCapture({
          text: JSON.stringify({
            questions: [
              {
                id: "fur",
                question: "What kind of cat?",
                options: ["orange tabby cat", "black cat", "a ceramic cup"],
                multi: true,
              },
            ],
          }),
        }),
      }
    );
    expect(questions[0].options).toEqual([
      "orange tabby cat",
      "black cat",
      "a ceramic cup",
    ]);
  });
});

describe("question dedup — the girl/coin repeat bug", () => {
  // The user opened "Girl", got "What is the size of the coin?" (a relational
  // question the model asked while scoped to Girl), then opened "Coin" and got
  // the same question again. Exact-text dedup missed it because the model
  // rephrased. The fix is canonical token-bag similarity dedup in code.
  function okCapture(response: unknown): typeof fetch {
    return async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
  }

  it("canonicalQuestion collapses paraphrases to the same bag", () => {
    const a = canonicalQuestion("What is the size of the coin?");
    const b = canonicalQuestion("What size is the coin?");
    const c = canonicalQuestion("How big is the coin?");
    expect(a).toBe(b);
    // "how big" stems to the same bag as "what size" after stop-word removal
    // and stemming — both reduce to {big, coin} / {size, coin}; "big" and
    // "size" are different tokens so c is NOT equal to a, which is correct:
    // they're related but not identical. This documents the boundary.
    expect(a).not.toBe(c);
  });

  it("drops a paraphrase repeat asked on a second entity", async () => {
    // Coin returns the SAME conceptual question Girl already asked, but
    // rephrased. The dedup must drop it even though the text differs.
    const questions = await generateEntityQuestions(
      "image",
      "a girl holding a coin",
      { id: "coin", label: "Coin" },
      {},
      ["What is the size of the coin?"], // already asked under Girl
      {
        providerId: "openai",
        apiKey: "k",
        model: "gpt-4o-mini",
        fetch: okCapture({
          text: JSON.stringify({
            questions: [
              { id: "size", question: "What size is the coin?", options: ["small", "large"], multi: false },
              { id: "color", question: "What color is the coin?", options: ["gold", "silver"], multi: false },
            ],
          }),
        }),
      }
    );
    // The rephrased size question is dropped as a repeat; color survives.
    expect(questions.map((q) => q.question)).toEqual(["What color is the coin?"]);
  });

  it("keeps genuinely different attributes on the second entity", async () => {
    // A non-repeat question on Coin must not be dropped — the dedup must not
    // over-fire and strip everything from the second entity.
    const questions = await generateEntityQuestions(
      "image",
      "a girl holding a coin",
      { id: "coin", label: "Coin" },
      {},
      ["What is the girl wearing?", "What is the girl's pose?"],
      {
        providerId: "openai",
        apiKey: "k",
        model: "gpt-4o-mini",
        fetch: okCapture({
          text: JSON.stringify({
            questions: [
              { id: "material", question: "What metal is the coin made of?", options: ["gold", "silver"], multi: false },
              { id: "wear", question: "Is the coin worn or pristine?", options: ["worn", "pristine"], multi: false },
            ],
          }),
        }),
      }
    );
    expect(questions).toHaveLength(2);
    expect(questions.map((q) => q.question)).toEqual([
      "What metal is the coin made of?",
      "Is the coin worn or pristine?",
    ]);
  });

  it("drops a repeat within the same batch too", async () => {
    // The model emits the same question twice in one response (weak-model
    // behavior). The within-batch dedup catches it.
    const questions = await generateEntityQuestions(
      "image",
      "a coin",
      { id: "coin", label: "Coin" },
      {},
      [],
      {
        providerId: "openai",
        apiKey: "k",
        model: "gpt-4o-mini",
        fetch: okCapture({
          text: JSON.stringify({
            questions: [
              { id: "size", question: "What is the size of the coin?", options: [], multi: false },
              { id: "size2", question: "What size is the coin?", options: [], multi: false },
              { id: "color", question: "What color is the coin?", options: [], multi: false },
            ],
          }),
        }),
      }
    );
    expect(questions.map((q) => q.question)).toEqual([
      "What is the size of the coin?",
      "What color is the coin?",
    ]);
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
