import { describe, expect, it } from "vitest";
import { getAspectBlueprints, inferEntityKind } from "../question-blueprints";

describe("deterministic question blueprints", () => {
  it("classifies common people and places", () => {
    expect(inferEntityKind({ id: "girl", label: "Girl" })).toBe("person");
    expect(inferEntityKind({ id: "traveler", label: "Traveler" })).toBe("person");
    expect(inferEntityKind({ id: "forest", label: "Forest" })).toBe("place");
    expect(inferEntityKind({ id: "scene", label: "Scene" })).toBe("scene");
  });

  it("guarantees separate upper and lower clothing aspects for a person", () => {
    const ids = getAspectBlueprints(
      { id: "girl", label: "Girl" },
      "video",
      "standard"
    ).map((aspect) => aspect.id);
    expect(ids).toContain("top_clothing");
    expect(ids).toContain("bottom_clothing");
    expect(ids).toContain("footwear");
    expect(ids).toContain("expression_gaze");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("adds temporal motion aspects only to advanced video questions", () => {
    const image = getAspectBlueprints(
      { id: "girl", label: "Girl" },
      "image",
      "deep"
    ).map((aspect) => aspect.id);
    const video = getAspectBlueprints(
      { id: "girl", label: "Girl" },
      "video",
      "deep"
    ).map((aspect) => aspect.id);
    expect(image).not.toContain("motion_arc");
    expect(video).toContain("motion_arc");
    expect(video).toContain("gait_timing");
    expect(video.length).toBeGreaterThan(image.length);
  });

  it("gives video scenes a deterministic moment structure and pacing", () => {
    const ids = getAspectBlueprints(
      { id: "scene", label: "Scene" },
      "video",
      "standard"
    ).map((aspect) => aspect.id);
    expect(ids).toContain("moment_structure");
    expect(ids).toContain("pacing");
  });
});
