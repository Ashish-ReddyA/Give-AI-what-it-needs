import { describe, it, expect } from "vitest";
import {
  scoreSpec,
  IMAGE_REQUIRED_FIELDS,
  VIDEO_REQUIRED_FIELDS,
} from "../completeness";
import { EMPTY_SPEC, EMPTY_VIDEO_SPEC } from "../types";

describe("scoreSpec (image)", () => {
  it("scores an empty spec at 0 with all fields missing", () => {
    const r = scoreSpec(EMPTY_SPEC, IMAGE_REQUIRED_FIELDS);
    expect(r.score).toBe(0);
    expect(r.regenRisks).toBe(4);
    expect(r.isComplete).toBe(false);
    expect(r.hasIdea).toBe(false);
  });

  it("scores a full spec at 100 / complete", () => {
    const r = scoreSpec(
      {
        ...EMPTY_SPEC,
        idea: "a cat",
        format: "square",
        style: "anime",
        nonNegotiable: "orange tabby",
      },
      IMAGE_REQUIRED_FIELDS
    );
    expect(r.score).toBe(100);
    expect(r.regenRisks).toBe(0);
    expect(r.isComplete).toBe(true);
    expect(r.hasIdea).toBe(true);
  });

  it("treats whitespace-only text fields as unfilled", () => {
    const r = scoreSpec(
      { ...EMPTY_SPEC, idea: "   ", nonNegotiable: "  " },
      IMAGE_REQUIRED_FIELDS
    );
    expect(r.hasIdea).toBe(false);
    expect(r.missing.map((m) => m.key)).toContain("idea");
    expect(r.missing.map((m) => m.key)).toContain("nonNegotiable");
  });

  it("names what each missing field prevents", () => {
    const r = scoreSpec({ ...EMPTY_SPEC, idea: "a cat" }, IMAGE_REQUIRED_FIELDS);
    r.missing.forEach((m) => expect(m.prevents.length).toBeGreaterThan(0));
  });
});

describe("scoreSpec (video)", () => {
  it("requires idea, format, duration, motion, and non-negotiable", () => {
    const r = scoreSpec(EMPTY_VIDEO_SPEC, VIDEO_REQUIRED_FIELDS);
    expect(r.regenRisks).toBe(5);
    expect(r.missing.map((m) => m.key).sort()).toEqual(
      ["duration", "format", "idea", "motion", "nonNegotiable"].sort()
    );
  });

  it("does not count optional audio/exclusions toward completeness", () => {
    const r = scoreSpec(
      {
        ...EMPTY_VIDEO_SPEC,
        idea: "a barista",
        format: "portrait",
        duration: "short",
        motion: "static",
        nonNegotiable: "heart-shaped latte art",
        // audio and exclusions left empty on purpose
      },
      VIDEO_REQUIRED_FIELDS
    );
    expect(r.isComplete).toBe(true);
    expect(r.score).toBe(100);
  });
});
