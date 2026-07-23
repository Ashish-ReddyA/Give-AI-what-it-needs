"use client";

import { CompletenessResult } from "@/lib/completeness";

interface Props {
  result: CompletenessResult;
}

export default function CompletenessMeter({ result }: Props) {
  const { score, creditsAtRisk, missing } = result;
  const isSafe = creditsAtRisk === 0;

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
          {isSafe
            ? "CREDITS AT RISK: 0"
            : `CREDITS AT RISK: ${creditsAtRisk}`}
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
        <ul className="space-y-1">
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
      ) : (
        <p className="font-mono text-xs text-safe">
          All required fields answered. Nothing here should waste a generation.
        </p>
      )}
    </div>
  );
}
