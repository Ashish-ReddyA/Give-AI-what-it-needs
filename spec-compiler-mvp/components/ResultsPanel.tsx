"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { CompiledPrompt } from "@/lib/types";

function ReceiptCard({
  result,
  onCopied,
}: {
  result: CompiledPrompt;
  onCopied?: (platform: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      // A successful copy is the "about to spend credits" moment — this is
      // what starts an outcome-tracking entry.
      onCopied?.(result.platform);
    } catch {
      // clipboard access can fail in some environments — fail silently,
      // the text is still selectable/visible.
    }
  };

  return (
    <div className="receipt-card perforated-top bg-paperRaised border border-line shadow-cardLg">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-dashed border-line">
        <span className="font-mono text-xs font-bold uppercase tracking-wide text-ink">
          {result.platform}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs font-mono text-inkMuted hover:text-ink transition-colors px-1.5 py-0.5 rounded-sm hover:bg-paper"
        >
          {copied ? (
            <>
              <Check size={12} /> copied
            </>
          ) : (
            <>
              <Copy size={12} /> copy
            </>
          )}
        </button>
      </div>

      <div className="px-4 py-3.5">
        <p className="font-mono text-sm text-ink leading-relaxed whitespace-pre-wrap break-words">
          {result.prompt}
        </p>

        {result.meta && (
          <div className="mt-3.5 pt-3 border-t border-dashed border-line space-y-1.5">
            {Object.entries(result.meta).map(([k, v]) => (
              <div key={k} className="flex justify-between font-mono text-xs">
                <span className="text-inkFaint uppercase">{k}</span>
                <span className="text-ink">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pb-3.5">
        <p className="font-mono text-[11px] text-inkFaint italic leading-relaxed">
          {result.note}
        </p>
      </div>
    </div>
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-wide text-ink">
          Compiled prompts
        </span>
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] text-inkFaint">
          one per platform · copy to generate
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-1">
        {results.map((r) => (
          <ReceiptCard key={r.platform} result={r} onCopied={onCopy} />
        ))}
      </div>
    </div>
  );
}
