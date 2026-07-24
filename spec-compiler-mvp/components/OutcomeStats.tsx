"use client";

// The one honest stat screen. No dashboard — just the comparison the
// whole product is betting on: do complete specs waste fewer runs than
// incomplete ones?

import { OutcomeRecord, summarizeOutcomes, Bucket } from "@/lib/outcomes";

interface Props {
  outcomes: OutcomeRecord[];
  onClear: () => void;
}

const MIN_SAMPLE = 5;

function fmt(bucket: Bucket): string {
  if (bucket.n === 0) return "no data yet";
  const avg = bucket.avgRegens!.toFixed(1);
  const rate = Math.round(bucket.firstTryRate! * 100);
  return `avg ${avg} regens · ${rate}% first try (n=${bucket.n})`;
}

export default function OutcomeStats({ outcomes, onClear }: Props) {
  if (outcomes.length === 0) return null;

  const s = summarizeOutcomes(outcomes);
  const smallSample = s.complete.n < MIN_SAMPLE || s.incomplete.n < MIN_SAMPLE;

  return (
    <div className="border border-line rounded-sm bg-paperRaised p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs uppercase tracking-wide text-inkMuted">
          The hypothesis — {s.total} outcome{s.total === 1 ? "" : "s"} logged
        </span>
        <button
          type="button"
          onClick={onClear}
          className="font-mono text-[10px] text-inkMuted hover:text-risk transition-colors"
        >
          clear log
        </button>
      </div>

      <p className="font-body text-xs text-inkMuted mb-3">
        Do fully-answered specs actually waste fewer runs?
      </p>

      <ul className="space-y-1.5 font-mono text-xs">
        <li className="flex justify-between gap-4">
          <span className="text-safe">complete specs</span>
          <span className="text-ink text-right">{fmt(s.complete)}</span>
        </li>
        <li className="flex justify-between gap-4">
          <span className="text-risk">incomplete specs</span>
          <span className="text-ink text-right">{fmt(s.incomplete)}</span>
        </li>
        {s.assisted.n > 0 && (
          <li className="flex justify-between gap-4">
            <span className="text-inkMuted">AI-assisted specs</span>
            <span className="text-ink text-right">{fmt(s.assisted)}</span>
          </li>
        )}
        {s.abandoned > 0 && (
          <li className="flex justify-between gap-4">
            <span className="text-inkMuted">abandoned runs</span>
            <span className="text-ink text-right">
              {s.abandoned} (excluded from averages)
            </span>
          </li>
        )}
      </ul>

      {smallSample && (
        <p className="font-mono text-[10px] text-inkMuted mt-3">
          small sample — keep logging before drawing conclusions (want n≥
          {MIN_SAMPLE} in both buckets)
        </p>
      )}
    </div>
  );
}
