import { describe, it, expect } from "vitest";
import {
  QAState,
  composeSubject,
  answeredCount,
  qaAnsweredByText,
  buildAnswered,
  EMPTY_QA,
} from "../questions";
import { EMPTY_SPEC, EMPTY_VIDEO_SPEC } from "../types";

const qa: QAState = {
  entities: [
    { id: "barista", label: "Barista" },
    { id: "latte", label: "Latte" },
  ],
  entityQuestions: {
    barista: [
      { id: "barista_traits", question: "Barista traits?", options: ["young adult", "female"], multi: true },
      { id: "barista_hair", question: "Hair colour?", options: [], multi: false },
    ],
    latte: [
      { id: "latte_state", question: "Latte state?", options: ["being poured"], multi: false },
    ],
  },
  answers: {
    barista_traits: "young adult, female", // multi answer
    barista_hair: "  ", // blank → ignored
    latte_state: "being poured from a steel jug",
  },
};

describe("composeSubject (deterministic fallback)", () => {
  it("joins the idea with answered details, skipping blanks", () => {
    expect(composeSubject("a barista pouring latte", qa)).toBe(
      "a barista pouring latte, young adult, female, being poured from a steel jug"
    );
  });
  it("is just the idea when nothing is answered", () => {
    expect(composeSubject("a cat", EMPTY_QA)).toBe("a cat");
  });
});

describe("answeredCount", () => {
  it("counts non-blank answers (multi counts once)", () => {
    expect(answeredCount(qa)).toBe(2);
    expect(answeredCount(EMPTY_QA)).toBe(0);
  });
});

describe("qaAnsweredByText", () => {
  it("maps answered ids back to question text", () => {
    expect(qaAnsweredByText(qa)).toEqual({
      "Barista traits?": "young adult, female",
      "Latte state?": "being poured from a steel jug",
    });
  });
});

describe("buildAnswered", () => {
  it("merges fixed-field answers with answered questions", () => {
    const spec = { ...EMPTY_SPEC, idea: "x", style: "anime" as const };
    expect(buildAnswered("image", spec, qa)).toEqual({
      style: "anime",
      "Barista traits?": "young adult, female",
      "Latte state?": "being poured from a steel jug",
    });
  });
  it("works for video specs too", () => {
    const spec = { ...EMPTY_VIDEO_SPEC, idea: "x", duration: "short" as const };
    expect(buildAnswered("video", spec, EMPTY_QA)).toEqual({ duration: "short" });
  });
});
