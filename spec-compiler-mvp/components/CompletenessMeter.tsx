"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { CompletenessResult } from "@/lib/completeness";

interface Props {
  result: CompletenessResult;
}

export default function CompletenessMeter({ result }: Props) {
  const { score, regenRisks, missing } = result;
  const ready = regenRisks === 0;

  return (
    <div>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ready ? "bg-successSoft text-success" : "bg-warningSoft text-warning"}`}>
          {ready ? <CheckCircle2 size={19} /> : <CircleAlert size={19} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-textPrimary">
              {ready ? "Ready to compile" : `${missing.length} required detail${missing.length === 1 ? "" : "s"} missing`}
            </h2>
            <span className="text-sm font-semibold text-textPrimary">{score}%</span>
          </div>
          <p className="mt-1 text-sm leading-5 text-textSecondary">
            {ready
              ? "The core specification is complete."
              : "Complete these fields to reduce the chance of an unusable generation."}
          </p>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label="Specification completeness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        className="mt-4 h-2 overflow-hidden rounded-full bg-borderUi"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${ready ? "bg-success" : "bg-primary"}`}
          style={{ width: `${score}%` }}
        />
      </div>

      {missing.length > 0 && (
        <ul className="mt-4 space-y-2">
          {missing.map((field) => (
            <li key={field.key} className="rounded-lg bg-surfaceSubtle px-3 py-2.5 text-sm text-textSecondary">
              <span className="font-medium text-textPrimary">{field.label}</span>
              <span className="block text-xs leading-5 text-textMuted">Helps prevent {field.prevents}.</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
