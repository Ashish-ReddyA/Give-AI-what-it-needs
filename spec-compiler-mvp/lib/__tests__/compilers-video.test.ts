import { describe, it, expect } from "vitest";
import {
  compileVeo,
  compileRunway,
  compileHiggsfieldVideo,
  chooseHiggsfieldVideoModel,
  compileAllVideo,
} from "../compilers-video";
import { EMPTY_VIDEO_SPEC, VideoSpec } from "../types";
import { HIGGSFIELD_VIDEO_MODELS } from "../platforms";

const spec = (overrides: Partial<VideoSpec>): VideoSpec => ({
  ...EMPTY_VIDEO_SPEC,
  idea: "a barista pouring latte art",
  ...overrides,
});

describe("compileVeo", () => {
  it("includes audio cues when audio is specified", () => {
    const out = compileVeo(spec({ audio: "soft cafe ambience" }));
    expect(out.prompt).toContain("Audio: soft cafe ambience.");
    expect(out.meta?.audio).toBe("native");
  });

  it("includes explicit camera language", () => {
    const out = compileVeo(spec({ motion: "slow" }));
    expect(out.prompt).toContain("Camera: slow smooth camera pan.");
  });

  it("warns about stitching for long clips", () => {
    expect(compileVeo(spec({ duration: "long" })).note).toContain("stitching");
    expect(compileVeo(spec({ duration: "short" })).note).not.toContain(
      "stitching"
    );
  });
});

describe("compileRunway", () => {
  it("flags audio requirements Runway cannot render", () => {
    expect(compileRunway(spec({ audio: "dialogue" })).note).toContain(
      "does not render audio"
    );
    expect(compileRunway(spec({})).note).not.toContain("does not render audio");
  });
});

describe("chooseHiggsfieldVideoModel routing", () => {
  it("routes audio requirements to the audio-capable model", () => {
    expect(chooseHiggsfieldVideoModel(spec({ audio: "dialogue" }))).toEqual(
      HIGGSFIELD_VIDEO_MODELS.audio
    );
  });

  it("audio outranks motion", () => {
    expect(
      chooseHiggsfieldVideoModel(spec({ audio: "music", motion: "dynamic" }))
    ).toEqual(HIGGSFIELD_VIDEO_MODELS.audio);
  });

  it("routes dynamic/handheld motion to the motion model", () => {
    expect(chooseHiggsfieldVideoModel(spec({ motion: "dynamic" }))).toEqual(
      HIGGSFIELD_VIDEO_MODELS.motion
    );
    expect(chooseHiggsfieldVideoModel(spec({ motion: "handheld" }))).toEqual(
      HIGGSFIELD_VIDEO_MODELS.motion
    );
  });

  it("routes long clips to the long-form model", () => {
    expect(
      chooseHiggsfieldVideoModel(spec({ duration: "long", motion: "static" }))
    ).toEqual(HIGGSFIELD_VIDEO_MODELS.long);
  });

  it("falls back to the default model", () => {
    expect(chooseHiggsfieldVideoModel(spec({}))).toEqual(
      HIGGSFIELD_VIDEO_MODELS.default
    );
  });
});

describe("compileAllVideo", () => {
  it("compiles one prompt per platform", () => {
    const outs = compileAllVideo(
      spec({ format: "portrait", duration: "short", motion: "static" })
    );
    expect(outs.map((o) => o.platform)).toEqual([
      "Higgsfield",
      "Veo 3",
      "Runway",
    ]);
    outs.forEach((o) => expect(o.prompt.length).toBeGreaterThan(0));
  });

  it("carries duration and aspect in meta", () => {
    const [higgsfield] = compileAllVideo(
      spec({ format: "portrait", duration: "medium" })
    );
    expect(higgsfield.meta?.aspectRatio).toBe("9:16");
    expect(higgsfield.meta?.duration).toBe("8–10s");
  });
});
