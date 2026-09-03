"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { CompiledPrompt } from "@/lib/types";

function PromptCard({
  result,
  onCopied,
}: {
  result: CompiledPrompt;
  onCopied?: (platform: string) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.prompt);
      setCopyState("copied");
      onCopied?.(result.platform);
      setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  };

  return (
    <article className="overflow-hidden rounded-xl border border-borderUi bg-surface shadow-card">
      <header className="flex items-center justify-between gap-4 border-b border-borderUi px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-textPrimary">{result.platform}</h3>
          <p className="mt-0.5 text-xs text-textMuted">Platform-ready prompt</p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-white hover:bg-primaryHover"
        >
          {copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}
          {copyState === "copied" ? "Copied" : "Copy prompt"}
        </button>
      </header>

      <div className="p-5">
        <div className="rounded-lg border border-borderUi bg-surfaceSubtle p-4">
          <p className="select-text whitespace-pre-wrap break-words font-mono text-sm leading-7 text-textPrimary">
            {result.prompt}
          </p>
        </div>

        {result.meta && (
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            {Object.entries(result.meta).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-surfaceSubtle px-3 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-textMuted">{key}</dt>
                <dd className="mt-0.5 break-words text-sm font-medium text-textPrimary">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <details className="mt-4 border-t border-borderUi pt-3">
          <summary className="cursor-pointer text-sm font-medium text-textSecondary">Why these settings?</summary>
          <p className="mt-2 text-sm leading-6 text-textSecondary">{result.note}</p>
        </details>

        <p aria-live="polite" className={`mt-3 text-sm ${copyState === "error" ? "text-danger" : "text-success"}`}>
          {copyState === "error" ? "Clipboard access failed. Select the prompt text and copy it manually." : copyState === "copied" ? "Prompt copied to clipboard." : ""}
        </p>
      </div>
    </article>
  );
}

export default function ResultsPanel({
  results,
  onCopy,
}: {
  results: CompiledPrompt[];
  onCopy?: (platform: string) => void;
}) {
  return (
    <section aria-labelledby="results-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Output</p>
          <h2 id="results-title" className="mt-1 text-xl font-semibold text-textPrimary">Compiled prompts</h2>
        </div>
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-textMuted shadow-card">
          {results.length} platforms
        </span>
      </div>
      <div className="space-y-4">
        {results.map((result) => (
          <PromptCard key={result.platform} result={result} onCopied={onCopy} />
        ))}
      </div>
    </section>
  );
}
