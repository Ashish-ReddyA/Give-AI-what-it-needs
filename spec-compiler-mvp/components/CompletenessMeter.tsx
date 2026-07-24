"use client";

import { CompletenessResult } from "@/lib/completeness";

interface Props {
  result: CompletenessResult;
}

export default function CompletenessMeter({ result }: Props) {
  const { score, regenRisks, missing } = result;
  const isSafe = regenRisks === 0;

  return (
    <div className="border border-line rounded-sm bg-paperRaised p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs uppercase tracking-wide text-inkMuted">
          Completeness
        </span>
        <span
          className={`font-mono text-xs font-bold px-2 py-0.5 rounded-sm ${
            isSafe ? "bg-safeSoft text-safe" : "bg-riskSoft text-risk"
          }`}
        >
          {isSafe ? "REGEN RISKS: 0" : `REGEN RISKS: ${regenRisks}`}
        </span>
      </div>

      <div className="h-2 w-full bg-line rounded-full overflow-hidden mb-3">
        <div
          className={`h-full transition-all duration-300 ${
            isSafe ? "bg-safe" : "bg-ink"
          }`}
          style={{ width: `${score}%` }}
        />
      </div>

      {missing.length > 0 ? (
        <>
          <ul className="space-y-1 mb-2">
            {missing.map((field) => (
              <li
                key={field.key}
                className="font-mono text-xs text-inkMuted flex gap-2"
              >
                <span className="text-risk">·</span>
                <span>
                  <span className="text-ink">{field.label}</span> — prevents{" "}
                  {field.prevents}
                </span>
              </li>
            ))}
          </ul>
          {/* Honest math: this is a count of unpinned fields, not a literal
              credit tally — say so instead of dressing it up. */}
          <p className="font-mono text-[10px] text-inkMuted">
            Each unpinned field above is a common cause of a throwaway run.
          </p>
        </>
      ) : (
        <p className="font-mono text-xs text-safe">
          All required fields answered. Nothing here should waste a generation.
        </p>
      )}
    </div>
  );
}
