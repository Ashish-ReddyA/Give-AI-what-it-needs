"use client";

import { OutcomeRecord, summarizeOutcomes, Bucket } from "@/lib/outcomes";

interface Props {
  outcomes: OutcomeRecord[];
  onClear: () => void;
}

const MIN_SAMPLE = 5;

function fmt(bucket: Bucket): string {
  if (bucket.n === 0) return "No data yet";
  return `${bucket.avgRegens!.toFixed(1)} avg retries, ${Math.round(bucket.firstTryRate! * 100)}% first try, n=${bucket.n}`;
}

export default function OutcomeStats({ outcomes, onClear }: Props) {
  if (outcomes.length === 0) return null;
  const summary = summarizeOutcomes(outcomes);
  const smallSample = summary.complete.n < MIN_SAMPLE || summary.incomplete.n < MIN_SAMPLE;

  return (
    <details className="rounded-xl border border-borderUi bg-surface shadow-card">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-textPrimary sm:px-6">
        Insights from {summary.total} logged outcome{summary.total === 1 ? "" : "s"}
      </summary>
      <div className="border-t border-borderUi px-5 py-5 sm:px-6">
        <p className="text-sm text-textSecondary">Do complete specifications need fewer retries?</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-successSoft p-4">
            <dt className="text-sm font-semibold text-success">Complete specs</dt>
            <dd className="mt-1 text-sm text-textPrimary">{fmt(summary.complete)}</dd>
          </div>
          <div className="rounded-lg bg-warningSoft p-4">
            <dt className="text-sm font-semibold text-warning">Incomplete specs</dt>
            <dd className="mt-1 text-sm text-textPrimary">{fmt(summary.incomplete)}</dd>
          </div>
        </dl>
        {smallSample && (
          <p className="mt-3 text-xs leading-5 text-textMuted">
            Small sample. Aim for at least {MIN_SAMPLE} outcomes in each group before drawing conclusions.
          </p>
        )}
        <button type="button" onClick={onClear} className="mt-4 min-h-10 rounded-lg px-3 text-sm font-medium text-textMuted hover:bg-dangerSoft hover:text-danger">
          Clear outcome history
        </button>
      </div>
    </details>
  );
}
