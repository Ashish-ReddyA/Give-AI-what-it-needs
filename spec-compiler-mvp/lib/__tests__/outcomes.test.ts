import { describe, it, expect } from "vitest";
import {
  summarizeOutcomes,
  regensOf,
  OutcomeRecord,
  OutcomeResult,
} from "../outcomes";
import {
  loadPersistedState,
  savePersistedState,
  loadOutcomes,
  saveOutcomes,
  clearOutcomes,
  KV,
  PersistedState,
} from "../store";
import { EMPTY_SPEC, EMPTY_VIDEO_SPEC } from "../types";
import { EMPTY_QA } from "../questions";

function record(overrides: Partial<OutcomeRecord>): OutcomeRecord {
  return {
    id: "x",
    at: 1,
    domain: "image",
    platform: "Midjourney",
    score: 100,
    isComplete: true,
    regenRisks: 0,
    assisted: false,
    result: "first_try",
    resolvedAt: 2,
    ...overrides,
  };
}

describe("regensOf", () => {
  it("maps results to regen counts, 3+ floored to 3, abandoned excluded", () => {
    const cases: Array<[OutcomeResult, number | null]> = [
      ["first_try", 0],
      ["one_regen", 1],
      ["two_regens", 2],
      ["three_plus", 3],
      ["abandoned", null],
    ];
    cases.forEach(([r, n]) => expect(regensOf(r)).toBe(n));
  });
});

describe("summarizeOutcomes", () => {
  it("compares complete vs incomplete buckets — the hypothesis test", () => {
    const s = summarizeOutcomes([
      record({ isComplete: true, result: "first_try" }),
      record({ isComplete: true, result: "one_regen" }),
      record({ isComplete: false, result: "three_plus" }),
      record({ isComplete: false, result: "two_regens" }),
      record({ isComplete: false, result: "first_try" }),
    ]);
    expect(s.total).toBe(5);
    expect(s.complete.n).toBe(2);
    expect(s.complete.avgRegens).toBe(0.5);
    expect(s.complete.firstTryRate).toBe(0.5);
    expect(s.incomplete.n).toBe(3);
    expect(s.incomplete.avgRegens).toBeCloseTo(5 / 3);
  });

  it("counts abandoned separately and excludes it from averages", () => {
    const s = summarizeOutcomes([
      record({ result: "abandoned" }),
      record({ result: "first_try" }),
    ]);
    expect(s.abandoned).toBe(1);
    expect(s.complete.n).toBe(1);
    expect(s.complete.avgRegens).toBe(0);
  });

  it("tracks the assisted bucket", () => {
    const s = summarizeOutcomes([
      record({ assisted: true, result: "one_regen" }),
      record({ assisted: false, result: "three_plus" }),
    ]);
    expect(s.assisted.n).toBe(1);
    expect(s.assisted.avgRegens).toBe(1);
  });

  it("handles an empty log", () => {
    const s = summarizeOutcomes([]);
    expect(s.total).toBe(0);
    expect(s.complete.avgRegens).toBeNull();
    expect(s.incomplete.firstTryRate).toBeNull();
  });
});

// ---------- storage ----------

function fakeKV(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const baseState: PersistedState = {
  domain: "video",
  imageSpec: { ...EMPTY_SPEC, idea: "a cat", style: "anime" },
  videoSpec: { ...EMPTY_VIDEO_SPEC, idea: "a barista", duration: "short" },
  pending: [
    {
      id: "p1",
      at: 123,
      domain: "video",
      platform: "Veo 3",
      score: 80,
      isComplete: false,
      regenRisks: 1,
      assisted: true,
    },
  ],
  qa: {
    image: {
      overall: [{ id: "o_pose", question: "Pose?", options: ["sitting"] }],
      sections: [{ id: "cat", label: "Cat" }],
      sectionQuestions: {
        cat: [{ id: "s_cat_fur", question: "Fur?", options: ["orange"] }],
      },
      answers: { o_pose: "sitting", s_cat_fur: "orange tabby" },
    },
    video: EMPTY_QA,
  },
};

describe("persisted state", () => {
  it("round-trips state (specs, pending, and the QA tree) through storage", () => {
    const kv = fakeKV();
    savePersistedState(baseState, kv);
    expect(loadPersistedState(kv)).toEqual(baseState);
  });

  it("returns null when nothing is stored, on corrupt JSON, and with no storage", () => {
    const kv = fakeKV();
    expect(loadPersistedState(kv)).toBeNull();
    kv.setItem("spec-compiler.state.v2", "{not json");
    expect(loadPersistedState(kv)).toBeNull();
    expect(loadPersistedState(null)).toBeNull();
  });

  it("sanitizes tampered values field-by-field instead of crashing", () => {
    const kv = fakeKV();
    kv.setItem(
      "spec-compiler.state.v2",
      JSON.stringify({
        domain: "audio", // invalid enum
        imageSpec: { idea: 42, style: "vaporwave", format: "landscape" },
        videoSpec: null,
        pending: [{ id: "ok", domain: "video", platform: "Veo 3" }, { junk: 1 }],
        qa: {
          image: {
            overall: [
              { id: "keep", question: "Q", options: ["a", 5] },
              { question: "no id" }, // dropped
            ],
            answers: { keep: "a", bad: 7 }, // non-string dropped
          },
        },
      })
    );
    const s = loadPersistedState(kv)!;
    expect(s.domain).toBe("image"); // fell back
    expect(s.imageSpec.idea).toBe(""); // wrong type dropped
    expect(s.imageSpec.style).toBeNull(); // invalid enum dropped
    expect(s.imageSpec.format).toBe("landscape"); // valid value kept
    expect(s.videoSpec).toEqual(EMPTY_VIDEO_SPEC);
    expect(s.pending).toHaveLength(1); // junk entry dropped
    expect(s.qa.image.overall).toHaveLength(1); // question without id dropped
    expect(s.qa.image.overall[0].options).toEqual(["a"]); // non-string option dropped
    expect(s.qa.image.answers).toEqual({ keep: "a" }); // non-string answer dropped
    expect(s.qa.video).toEqual(EMPTY_QA); // missing → empty
  });
});

describe("outcome storage", () => {
  it("round-trips outcomes and drops invalid entries on load", () => {
    const kv = fakeKV();
    saveOutcomes([record({ id: "a" }), record({ id: "b", result: "abandoned" })], kv);
    expect(loadOutcomes(kv)).toHaveLength(2);

    kv.setItem(
      "spec-compiler.outcomes.v1",
      JSON.stringify([record({ id: "ok" }), { result: "not_a_result" }, "junk"])
    );
    const loaded = loadOutcomes(kv);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("ok");
  });

  it("caps the log at 500 records, keeping the newest", () => {
    const kv = fakeKV();
    const many = Array.from({ length: 520 }, (_, i) => record({ id: `r${i}` }));
    saveOutcomes(many, kv);
    const loaded = loadOutcomes(kv);
    expect(loaded).toHaveLength(500);
    expect(loaded[0].id).toBe("r20");
    expect(loaded[499].id).toBe("r519");
  });

  it("clears the log", () => {
    const kv = fakeKV();
    saveOutcomes([record({})], kv);
    clearOutcomes(kv);
    expect(loadOutcomes(kv)).toEqual([]);
  });
});
