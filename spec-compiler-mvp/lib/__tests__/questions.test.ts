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
  overall: [
    { id: "o_cat_pose", question: "How is the cat posed?", options: ["sitting"] },
    { id: "o_cat_color", question: "Cat colour?", options: [] },
  ],
  sections: [{ id: "ball", label: "Ball" }],
  sectionQuestions: {
    ball: [{ id: "s_ball_size", question: "Ball size?", options: ["small"] }],
  },
  answers: {
    o_cat_pose: "mid-pounce",
    o_cat_color: "  ", // blank → ignored
    s_ball_size: "small red rubber ball",
  },
};

describe("composeSubject", () => {
  it("weaves answered details into the idea, skipping blanks", () => {
    expect(composeSubject("a cat playing with a ball", qa)).toBe(
      "a cat playing with a ball, mid-pounce, small red rubber ball"
    );
  });
  it("returns just the idea when nothing is answered", () => {
    expect(composeSubject("a cat", EMPTY_QA)).toBe("a cat");
  });
});

describe("answeredCount", () => {
  it("counts only non-blank answers", () => {
    expect(answeredCount(qa)).toBe(2);
    expect(answeredCount(EMPTY_QA)).toBe(0);
  });
});

describe("qaAnsweredByText", () => {
  it("maps answered ids back to their question text", () => {
    expect(qaAnsweredByText(qa)).toEqual({
      "How is the cat posed?": "mid-pounce",
      "Ball size?": "small red rubber ball",
    });
  });
});

describe("buildAnswered", () => {
  it("merges fixed-field answers with the answered questions", () => {
    const spec = { ...EMPTY_SPEC, idea: "a cat", style: "anime" as const };
    expect(buildAnswered("image", spec, qa)).toEqual({
      style: "anime",
      "How is the cat posed?": "mid-pounce",
      "Ball size?": "small red rubber ball",
    });
  });
  it("works for video specs too", () => {
    const spec = { ...EMPTY_VIDEO_SPEC, idea: "x", duration: "short" as const };
    expect(buildAnswered("video", spec, EMPTY_QA)).toEqual({ duration: "short" });
  });
});
