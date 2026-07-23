import { describe, it, expect } from "vitest";
import { elicit, compile } from "../tools";

describe("elicit_spec", () => {
  it("asks all required image questions for an empty call", () => {
    const r = elicit({ domain: "image" });
    expect(r.questionsRemaining.map((q) => q.key).sort()).toEqual(
      ["format", "idea", "nonNegotiable", "style"].sort()
    );
    expect(r.completeness.isComplete).toBe(false);
  });

  it("only asks what's still missing", () => {
    const r = elicit({
      domain: "image",
      idea: "a cat",
      format: "square",
      style: "anime",
    });
    expect(r.questionsRemaining.map((q) => q.key)).toEqual(["nonNegotiable"]);
  });

  it("provides allowed options for choice fields, none for free text", () => {
    const r = elicit({ domain: "video" });
    const byKey = Object.fromEntries(r.questionsRemaining.map((q) => [q.key, q]));
    expect(byKey.duration.options?.map((o) => o.value)).toEqual([
      "short",
      "medium",
      "long",
    ]);
    expect(byKey.motion.options?.length).toBe(4);
    expect(byKey.idea.options).toBeUndefined();
  });

  it("surfaces audio as optional context for video until provided", () => {
    const before = elicit({ domain: "video", idea: "a barista" });
    expect(before.optionalContext.map((q) => q.key)).toContain("audio");
    const after = elicit({
      domain: "video",
      idea: "a barista",
      audio: "cafe ambience",
    });
    expect(after.optionalContext.map((q) => q.key)).not.toContain("audio");
  });

  it("tells the agent to compile once complete", () => {
    const r = elicit({
      domain: "image",
      idea: "a cat",
      format: "square",
      style: "anime",
      nonNegotiable: "orange tabby",
    });
    expect(r.completeness.isComplete).toBe(true);
    expect(r.questionsRemaining).toEqual([]);
    expect(r.instructions).toContain("compile_spec");
  });
});

describe("compile_spec", () => {
  const fullImage = {
    domain: "image" as const,
    idea: "a cat on a wooden table",
    format: "landscape" as const,
    style: "realistic" as const,
    nonNegotiable: "must be an orange tabby",
  };

  it("refuses to compile without an idea", () => {
    const r = compile({ domain: "image", format: "square" });
    expect(r.compiled).toBe(false);
    expect(r.prompts).toBeUndefined();
  });

  it("refuses an incomplete spec by default (the compile gate)", () => {
    const r = compile({ domain: "image", idea: "a cat" });
    expect(r.compiled).toBe(false);
    expect(r.questionsRemaining?.length).toBe(3);
    expect(r.instructions).toContain("allowIncomplete");
  });

  it("compiles an incomplete spec when the risk is explicitly accepted", () => {
    const r = compile({ domain: "image", idea: "a cat", allowIncomplete: true });
    expect(r.compiled).toBe(true);
    expect(r.prompts?.length).toBe(3);
    expect(r.instructions).toContain("accepted regen risk");
  });

  it("compiles a complete image spec to all three platforms", () => {
    const r = compile(fullImage);
    expect(r.compiled).toBe(true);
    expect(r.prompts?.map((p) => p.platform)).toEqual([
      "Midjourney",
      "DALL-E / GPT Image",
      "Higgsfield",
    ]);
    expect(r.prompts?.[0].prompt).toContain("--ar 16:9");
  });

  it("compiles a complete video spec, routing audio to Veo via Higgsfield", () => {
    const r = compile({
      domain: "video",
      idea: "a barista pouring latte art",
      format: "portrait",
      duration: "short",
      motion: "static",
      nonNegotiable: "heart-shaped latte art",
      audio: "barista says enjoy",
    });
    expect(r.compiled).toBe(true);
    expect(r.prompts?.map((p) => p.platform)).toEqual([
      "Higgsfield",
      "Veo 3",
      "Runway",
    ]);
    expect(r.prompts?.[0].meta?.model).toBe("Veo 3.1");
  });
});
