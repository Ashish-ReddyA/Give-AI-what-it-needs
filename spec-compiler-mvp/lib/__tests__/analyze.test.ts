import { describe, it, expect } from "vitest";
import {
  mergeImageAnalysis,
  mergeVideoAnalysis,
  answeredImageFields,
  answeredVideoFields,
  ImageAnalysis,
} from "../analyze-core";
import { analyzeImageIdea, analyzeVideoIdea } from "../analyze";
import { EMPTY_SPEC, EMPTY_VIDEO_SPEC } from "../types";

const NO_IMAGE_ANALYSIS: ImageAnalysis = {
  format: null,
  style: null,
  nonNegotiable: null,
  exclusions: null,
  formatUse: null,
  nextQuestion: null,
};

describe("mergeImageAnalysis", () => {
  it("fills only empty fields and reports what it filled", () => {
    const { spec, filled } = mergeImageAnalysis(
      { ...EMPTY_SPEC, idea: "a cat" },
      { ...NO_IMAGE_ANALYSIS, format: "portrait", style: "anime", nonNegotiable: "orange tabby" }
    );
    expect(spec.format).toBe("portrait");
    expect(spec.style).toBe("anime");
    expect(spec.nonNegotiable).toBe("orange tabby");
    expect(filled).toEqual(["format", "style", "non-negotiable"]);
  });

  it("NEVER overwrites a field the user already set", () => {
    const userSpec = {
      ...EMPTY_SPEC,
      idea: "a cat",
      format: "square" as const,
      nonNegotiable: "must be MY cat Milo",
    };
    const { spec, filled } = mergeImageAnalysis(userSpec, {
      ...NO_IMAGE_ANALYSIS,
      format: "landscape",
      nonNegotiable: "something else entirely",
    });
    expect(spec.format).toBe("square");
    expect(spec.nonNegotiable).toBe("must be MY cat Milo");
    expect(filled).toEqual([]);
  });
});

describe("mergeVideoAnalysis", () => {
  it("fills video fields including audio", () => {
    const { spec, filled } = mergeVideoAnalysis(
      { ...EMPTY_VIDEO_SPEC, idea: "a barista" },
      {
        format: "portrait",
        duration: "short",
        motion: null,
        nonNegotiable: null,
        audio: "cafe ambience",
        exclusions: null,
        nextQuestion: "Static or moving camera?",
      }
    );
    expect(spec.format).toBe("portrait");
    expect(spec.duration).toBe("short");
    expect(spec.audio).toBe("cafe ambience");
    expect(spec.motion).toBeNull();
    expect(filled).toEqual(["format", "duration", "audio"]);
  });
});

describe("answered-field context", () => {
  it("includes only non-empty fields", () => {
    expect(
      answeredImageFields({ ...EMPTY_SPEC, idea: "x", style: "anime", nonNegotiable: "  " })
    ).toEqual({ style: "anime" });
    expect(
      answeredVideoFields({ ...EMPTY_VIDEO_SPEC, idea: "x", duration: "short", audio: "rain" })
    ).toEqual({ duration: "short", audio: "rain" });
  });
});

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

// --- Anthropic path: browser-direct to api.anthropic.com ---

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

describe("analyzeImageIdea — Anthropic (browser-direct)", () => {
  it("calls api.anthropic.com with the BYOK headers and structured output", async () => {
    const captured: Captured[] = [];
    const analysis = await analyzeImageIdea(
      { ...EMPTY_SPEC, idea: "photo of a hiker at golden hour", style: "realistic" },
      {
        providerId: "anthropic",
        apiKey: "sk-ant-test",
        fetch: capture(
          anthropicWire({
            format: "landscape",
            style: "realistic",
            nonNegotiable: null,
            exclusions: null,
            formatUse: null,
            nextQuestion: "Should the subject face the camera?",
          }),
          captured
        ),
      }
    );

    expect(analysis.domain).toBe("image");
    if (analysis.domain === "image") expect(analysis.format).toBe("landscape");

    const r = captured[0];
    expect(r.url).toContain("api.anthropic.com");
    expect(r.url).toContain("/v1/messages");
    expect(r.headers.get("x-api-key")).toBe("sk-ant-test");
    expect(r.headers.get("anthropic-dangerous-direct-browser-access")).toBe("true");
    expect(r.body.model).toBe("claude-opus-4-8");
    expect((r.body.output_config as { format: { type: string } }).format.type).toBe(
      "json_schema"
    );
    // Already-answered fields ride along so they're never re-extracted.
    const sent = JSON.parse((r.body.messages as Array<{ content: string }>)[0].content);
    expect(sent.alreadyAnswered).toEqual({ style: "realistic" });
  });

  it("throws a friendly error on refusal", async () => {
    const refusal = { ...anthropicWire({}), content: [], stop_reason: "refusal" };
    await expect(
      analyzeImageIdea(
        { ...EMPTY_SPEC, idea: "x" },
        { providerId: "anthropic", apiKey: "sk-ant-test", fetch: capture(refusal, []) }
      )
    ).rejects.toThrow(/declined/);
  });
});

// --- openai-compat path: through the /api/analyze proxy ---

describe("analyzeImageIdea — openai-compat (via proxy)", () => {
  it("posts to /api/analyze with the provider, model, and key header", async () => {
    const captured: Captured[] = [];
    const analysis = await analyzeImageIdea(
      { ...EMPTY_SPEC, idea: "a neon cat, 9:16" },
      {
        providerId: "openai",
        apiKey: "sk-openai-test",
        model: "gpt-4o-mini",
        fetch: capture(
          { text: '{"format":"portrait","style":null,"nonNegotiable":null,"exclusions":null,"formatUse":null,"nextQuestion":"Realistic or illustration?"}' },
          captured
        ),
      }
    );

    expect(analysis.domain).toBe("image");
    if (analysis.domain === "image") {
      expect(analysis.format).toBe("portrait");
      expect(analysis.nextQuestion).toContain("Realistic");
    }

    const r = captured[0];
    expect(r.url).toBe("/api/analyze");
    expect(r.headers.get("x-provider-key")).toBe("sk-openai-test");
    expect(r.body.provider).toBe("openai");
    expect(r.body.model).toBe("gpt-4o-mini");
    expect(typeof r.body.system).toBe("string");
  });

  it("coerces invalid enum values from the model to null", async () => {
    const analysis = await analyzeImageIdea(
      { ...EMPTY_SPEC, idea: "a cat" },
      {
        providerId: "nvidia",
        apiKey: "nvapi-x",
        model: "meta/llama-3.1-8b-instruct",
        fetch: capture(
          { text: '{"format":"banner","style":"vaporwave","nonNegotiable":"orange tabby"}' },
          []
        ),
      }
    );
    if (analysis.domain === "image") {
      expect(analysis.format).toBeNull(); // "banner" isn't valid
      expect(analysis.style).toBeNull(); // "vaporwave" isn't valid
      expect(analysis.nonNegotiable).toBe("orange tabby"); // free text kept
    }
  });

  it("salvages JSON wrapped in stray prose / code fences", async () => {
    const analysis = await analyzeImageIdea(
      { ...EMPTY_SPEC, idea: "a cat" },
      {
        providerId: "groq",
        apiKey: "gsk-x",
        model: "llama-3.3-70b-versatile",
        fetch: capture(
          { text: 'Here you go:\n```json\n{"format":"square"}\n```' },
          []
        ),
      }
    );
    if (analysis.domain === "image") expect(analysis.format).toBe("square");
  });

  it("surfaces a proxy error", async () => {
    await expect(
      analyzeImageIdea(
        { ...EMPTY_SPEC, idea: "x" },
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

describe("analyzeVideoIdea — openai-compat", () => {
  it("returns a video-tagged analysis with video fields", async () => {
    const analysis = await analyzeVideoIdea(
      { ...EMPTY_VIDEO_SPEC, idea: "5s locked-off TikTok of a barista saying enjoy" },
      {
        providerId: "openrouter",
        apiKey: "sk-or-x",
        model: "openai/gpt-4o-mini",
        fetch: capture(
          { text: '{"format":"portrait","duration":"short","motion":"static","nonNegotiable":null,"audio":"barista says enjoy","exclusions":null,"nextQuestion":null}' },
          []
        ),
      }
    );
    expect(analysis.domain).toBe("video");
    if (analysis.domain === "video") {
      expect(analysis.duration).toBe("short");
      expect(analysis.motion).toBe("static");
      expect(analysis.audio).toBe("barista says enjoy");
    }
  });
});
