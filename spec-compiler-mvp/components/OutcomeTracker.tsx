"use client";

// Pending copies waiting for their outcome. This closes the measurement
// loop: copy → generate on the platform → come back → one tap. Pending
// items persist across refreshes because the user leaves to generate.

import { X } from "lucide-react";
import {
  PendingCopy,
  OutcomeResult,
  RESULT_LABELS,
} from "@/lib/outcomes";

interface Props {
  pending: PendingCopy[];
  onResolve: (id: string, result: OutcomeResult) => void;
  onDismiss: (id: string) => void;
}

const RESOLUTIONS: OutcomeResult[] = [
  "first_try",
  "one_regen",
  "two_regens",
  "three_plus",
  "abandoned",
];

function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function OutcomeTracker({ pending, onResolve, onDismiss }: Props) {
  if (pending.length === 0) return null;

  return (
    <div className="border border-line rounded-sm bg-paperRaised p-4 space-y-3">
      <span className="font-mono text-xs uppercase tracking-wide text-inkMuted">
        How did it go?
      </span>
      {pending.map((p) => (
        <div key={p.id} className="border-t border-dashed border-line pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-xs text-ink">
              {p.platform}{" "}
              <span className="text-inkMuted">
                · {p.domain} · copied {timeAgo(p.at)} ·{" "}
                {p.isComplete ? "complete spec" : `${p.regenRisks} risks accepted`}
              </span>
            </p>
            <button
              type="button"
              onClick={() => onDismiss(p.id)}
              aria-label="dismiss without recording"
              className="text-inkMuted hover:text-risk transition-colors"
            >
              <X size={12} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RESOLUTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onResolve(p.id, r)}
                className={`px-2.5 py-1 font-mono text-[11px] border rounded-sm transition-colors ${
                  r === "first_try"
                    ? "border-safe text-safe hover:bg-safeSoft"
                    : r === "abandoned"
                      ? "border-risk text-risk hover:bg-riskSoft"
                      : "border-line text-ink hover:border-ink"
                }`}
              >
                {RESULT_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="font-mono text-[10px] text-inkMuted">
        one tap after you generate — this is the data that tests whether the
        questions actually save regens
      </p>
    </div>
  );
}
