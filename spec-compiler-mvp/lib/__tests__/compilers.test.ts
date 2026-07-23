import { describe, it, expect } from "vitest";
import {
  compileMidjourney,
  compileDalle,
  compileHiggsfield,
  chooseHiggsfieldModel,
  wantsRenderedText,
  compileAll,
} from "../compilers";
import { EMPTY_SPEC, ImageSpec } from "../types";
import { MIDJOURNEY, HIGGSFIELD_IMAGE_MODELS } from "../platforms";

const spec = (overrides: Partial<ImageSpec>): ImageSpec => ({
  ...EMPTY_SPEC,
  idea: "a cat on a wooden table",
  ...overrides,
});

describe("compileMidjourney", () => {
  it("carries format and exclusions as flags, pinned to the configured version", () => {
    const out = compileMidjourney(
      spec({ format: "landscape", exclusions: "text, watermark" })
    );
    expect(out.prompt).toContain("--ar 16:9");
    expect(out.prompt).toContain("--no text, watermark");
    expect(out.prompt).toContain(`--v ${MIDJOURNEY.version}`);
  });

  it("only uses --style raw for realistic style (raw kills beautification)", () => {
    expect(compileMidjourney(spec({ style: "realistic" })).prompt).toContain(
      "--style raw"
    );
    expect(compileMidjourney(spec({ style: "anime" })).prompt).not.toContain(
      "--style raw"
    );
    expect(compileMidjourney(spec({})).prompt).not.toContain("--style raw");
  });

  it("omits --no when there are no exclusions", () => {
    expect(compileMidjourney(spec({})).prompt).not.toContain("--no");
  });
});

describe("compileDalle", () => {
  it("phrases exclusions as an instruction, not a flag", () => {
    const out = compileDalle(spec({ exclusions: "text, watermark" }));
    expect(out.prompt).toContain("Do not include text or watermark.");
    expect(out.prompt).not.toContain("--no");
  });

  it("leads with the styled subject sentence", () => {
    const out = compileDalle(spec({ style: "anime" }));
    expect(out.prompt).toMatch(/^An? anime image of a cat on a wooden table\./);
  });
});

describe("wantsRenderedText", () => {
  it("detects a genuine text-rendering requirement", () => {
    expect(wantsRenderedText("the sign must say OPEN 24/7")).toBe(true);
    expect(wantsRenderedText("include our logo top-left")).toBe(true);
  });

  it("does NOT fire on negated mentions (the v1 bug)", () => {
    expect(wantsRenderedText("no text anywhere")).toBe(false);
    expect(wantsRenderedText("without any logo")).toBe(false);
    expect(wantsRenderedText("avoid words on screen")).toBe(false);
  });

  it("ignores specs that never mention text", () => {
    expect(wantsRenderedText("must be an orange tabby")).toBe(false);
  });
});

describe("chooseHiggsfieldModel routing", () => {
  it("routes text-rendering requirements to the text model", () => {
    expect(
      chooseHiggsfieldModel(spec({ nonNegotiable: "must show the word SALE" }))
    ).toEqual(HIGGSFIELD_IMAGE_MODELS.text);
  });

  it("does not route 'no text' to the text model", () => {
    const chosen = chooseHiggsfieldModel(
      spec({ nonNegotiable: "no text anywhere", style: "anime" })
    );
    expect(chosen).not.toEqual(HIGGSFIELD_IMAGE_MODELS.text);
  });

  it("routes realistic style before exclusions", () => {
    expect(
      chooseHiggsfieldModel(spec({ style: "realistic", exclusions: "text" }))
    ).toEqual(HIGGSFIELD_IMAGE_MODELS.realistic);
  });

  it("routes exclusions to the control model", () => {
    expect(
      chooseHiggsfieldModel(spec({ style: "anime", exclusions: "watermark" }))
    ).toEqual(HIGGSFIELD_IMAGE_MODELS.exclusions);
  });

  it("falls back to the default model with no signal", () => {
    expect(chooseHiggsfieldModel(spec({}))).toEqual(
      HIGGSFIELD_IMAGE_MODELS.default
    );
  });
});

describe("compileHiggsfield / compileAll", () => {
  it("exposes routing in meta and note", () => {
    const out = compileHiggsfield(spec({ style: "realistic" }));
    expect(out.meta?.model).toBe(HIGGSFIELD_IMAGE_MODELS.realistic.model);
    expect(out.note).toContain(HIGGSFIELD_IMAGE_MODELS.realistic.model);
  });

  it("compiles one prompt per platform", () => {
    const outs = compileAll(spec({ format: "square", style: "3d" }));
    expect(outs.map((o) => o.platform)).toEqual([
      "Midjourney",
      "DALL-E / GPT Image",
      "Higgsfield",
    ]);
    outs.forEach((o) => expect(o.prompt.length).toBeGreaterThan(0));
  });
});
