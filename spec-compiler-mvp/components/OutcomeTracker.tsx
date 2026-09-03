"use client";

import { X } from "lucide-react";
import { PendingCopy, OutcomeResult, RESULT_LABELS } from "@/lib/outcomes";

interface Props {
  pending: PendingCopy[];
  onResolve: (id: string, result: OutcomeResult) => void;
  onDismiss: (id: string) => void;
}

const RESOLUTIONS: OutcomeResult[] = ["first_try", "one_regen", "two_regens", "three_plus", "abandoned"];

function timeAgo(timestamp: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function OutcomeTracker({ pending, onResolve, onDismiss }: Props) {
  if (pending.length === 0) return null;

  return (
    <section className="rounded-xl border border-borderUi bg-surface p-5 shadow-card sm:p-6" aria-labelledby="outcomes-title">
      <div className="mb-4">
        <h2 id="outcomes-title" className="text-lg font-semibold text-textPrimary">How did the generation perform?</h2>
        <p className="mt-1 text-sm text-textSecondary">A quick answer helps measure whether detailed specs reduce retries.</p>
      </div>
      <div className="space-y-3">
        {pending.map((item) => (
          <div key={item.id} className="rounded-lg border border-borderUi bg-surfaceSubtle p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-textPrimary">{item.platform}</p>
                <p className="mt-0.5 text-xs text-textMuted">
                  {item.domain} prompt, copied {timeAgo(item.at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                aria-label={`Dismiss ${item.platform} outcome request`}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-textMuted hover:bg-surface hover:text-danger"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {RESOLUTIONS.map((result) => (
                <button
                  key={result}
                  type="button"
                  onClick={() => onResolve(item.id, result)}
                  className="min-h-10 rounded-lg border border-borderUi bg-surface px-3 text-sm font-medium text-textSecondary hover:border-primary hover:text-primary"
                >
                  {RESULT_LABELS[result]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
