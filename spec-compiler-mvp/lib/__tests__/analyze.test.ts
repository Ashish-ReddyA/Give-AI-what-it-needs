import { describe, it, expect } from "vitest";
import {
  mergeImageAnalysis,
  mergeVideoAnalysis,
  answeredImageFields,
  answeredVideoFields,
  ImageAnalysis,
} from "../analyze-core";
import { analyzeImageIdea, analyzeVideoIdea, ANALYZE_MODEL } from "../analyze";
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
      {
        ...NO_IMAGE_ANALYSIS,
        format: "portrait",
        style: "anime",
        nonNegotiable: "orange tabby",
      }
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

  it("treats null analysis fields as absent", () => {
    const { spec, filled } = mergeImageAnalysis(
      { ...EMPTY_SPEC, idea: "a cat" },
      NO_IMAGE_ANALYSIS
    );
    expect(spec).toEqual({ ...EMPTY_SPEC, idea: "a cat" });
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
      answeredImageFields({
        ...EMPTY_SPEC,
        idea: "x",
        style: "anime",
        nonNegotiable: "  ",
      })
    ).toEqual({ style: "anime" });
    expect(
      answeredVideoFields({
        ...EMPTY_VIDEO_SPEC,
        idea: "x",
        duration: "short",
        audio: "rain",
      })
    ).toEqual({ duration: "short", audio: "rain" });
  });
});

// ---- Wire-level tests: mocked fetch, real SDK request path ----

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function wireMessage(payload: unknown) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: ANALYZE_MODEL,
    content: [{ type: "text", text: JSON.stringify(payload) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

function mockFetch(response: unknown, captured: Captured[]): typeof fetch {
  return async (url, init) => {
    captured.push({
      url: String(url),
      headers: new Headers(init?.headers as HeadersInit),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("analyzeImageIdea (mocked wire)", () => {
  const imagePayload = {
    format: "landscape",
    style: "realistic",
    nonNegotiable: "golden hour light",
    exclusions: null,
    formatUse: "YouTube thumbnail",
    nextQuestion: "Should the subject face the camera?",
  };

  it("sends the BYOK request shape and returns the parsed analysis", async () => {
    const captured: Captured[] = [];
    const spec = {
      ...EMPTY_SPEC,
      idea: "photo of a hiker at golden hour for a YouTube thumbnail",
      style: "realistic" as const,
    };

    const analysis = await analyzeImageIdea(spec, {
      apiKey: "sk-ant-test",
      fetch: mockFetch(wireMessage(imagePayload), captured),
    });

    // Response parsed via structured outputs
    expect(analysis.domain).toBe("image");
    if (analysis.domain === "image") {
      expect(analysis.format).toBe("landscape");
      expect(analysis.nextQuestion).toContain("face the camera");
    }

    // Request shape: BYOK direct-browser call
    const req = captured[0];
    expect(req.url).toContain("/v1/messages");
    expect(req.headers.get("x-api-key")).toBe("sk-ant-test");
    expect(req.headers.get("anthropic-dangerous-direct-browser-access")).toBe(
      "true"
    );
    expect(req.body.model).toBe(ANALYZE_MODEL);
    const outputConfig = req.body.output_config as {
      format: { type: string; schema: { properties: Record<string, unknown> } };
    };
    expect(outputConfig.format.type).toBe("json_schema");
    expect(Object.keys(outputConfig.format.schema.properties).sort()).toEqual(
      ["exclusions", "format", "formatUse", "nextQuestion", "nonNegotiable", "style"].sort()
    );

    // Already-answered fields travel with the idea so they're never re-asked
    const messages = req.body.messages as Array<{ content: string }>;
    const sent = JSON.parse(messages[0].content);
    expect(sent.idea).toContain("hiker");
    expect(sent.alreadyAnswered).toEqual({ style: "realistic" });
  });

  it("throws a friendly error on refusal", async () => {
    const refusal = {
      ...wireMessage({}),
      content: [],
      stop_reason: "refusal",
    };
    await expect(
      analyzeImageIdea(
        { ...EMPTY_SPEC, idea: "x" },
        { apiKey: "sk-ant-test", fetch: mockFetch(refusal, []) }
      )
    ).rejects.toThrow(/declined/);
  });
});

describe("analyzeVideoIdea (mocked wire)", () => {
  it("returns a video-tagged analysis with video fields", async () => {
    const payload = {
      format: "portrait",
      duration: "short",
      motion: "static",
      nonNegotiable: null,
      audio: "barista says enjoy",
      exclusions: null,
      nextQuestion: null,
    };
    const captured: Captured[] = [];
    const analysis = await analyzeVideoIdea(
      { ...EMPTY_VIDEO_SPEC, idea: "5s locked-off TikTok of a barista saying enjoy" },
      { apiKey: "sk-ant-test", fetch: mockFetch(wireMessage(payload), captured) }
    );
    expect(analysis.domain).toBe("video");
    if (analysis.domain === "video") {
      expect(analysis.duration).toBe("short");
      expect(analysis.audio).toBe("barista says enjoy");
    }
    const props = (
      captured[0].body.output_config as {
        format: { schema: { properties: Record<string, unknown> } };
      }
    ).format.schema.properties;
    expect(Object.keys(props)).toContain("audio");
    expect(Object.keys(props)).toContain("motion");
  });
});
