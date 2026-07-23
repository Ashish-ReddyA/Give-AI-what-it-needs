"use client";

// BYOK AI assist: parses the idea with the user's OWN Anthropic key so the
// form never asks a question the idea already answered, and surfaces the
// next-best question. Strictly optional — without a key the app is the
// same static form it always was.
//
// Key handling: localStorage only, sent directly browser → Anthropic.
// It never touches any server of ours (there isn't one).

import { useEffect, useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { Domain, ImageSpec, VideoSpec } from "@/lib/types";
import { Analysis } from "@/lib/analyze-core";

const STORAGE_KEY = "spec-compiler.anthropic-key";

interface Props {
  domain: Domain;
  spec: ImageSpec | VideoSpec;
  /** Applies the analysis to the current spec; returns which fields it filled */
  onAnalysis: (a: Analysis) => { filled: string[] };
}

interface Hint {
  filled: string[];
  question: string | null;
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/401|authentication/i.test(msg)) {
    return "Anthropic rejected the key — check it and try again.";
  }
  if (/429|rate.?limit/i.test(msg)) {
    return "Rate-limited by Anthropic — wait a moment and retry.";
  }
  return `Analysis failed: ${msg.slice(0, 140)}`;
}

export default function AssistPanel({ domain, spec, onAnalysis }: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    setApiKey(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  // A hint about one domain's spec is meaningless in the other domain.
  useEffect(() => {
    setHint(null);
    setError(null);
  }, [domain]);

  const saveKey = () => {
    const k = draft.trim();
    if (!k) return;
    window.localStorage.setItem(STORAGE_KEY, k);
    setApiKey(k);
    setDraft("");
    setError(null);
  };

  const clearKey = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
    setHint(null);
    setError(null);
  };

  const analyze = async () => {
    if (!apiKey || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Dynamic import keeps the Anthropic SDK out of the main bundle.
      const { analyzeImageIdea, analyzeVideoIdea } = await import(
        "@/lib/analyze"
      );
      const analysis =
        domain === "image"
          ? await analyzeImageIdea(spec as ImageSpec, { apiKey })
          : await analyzeVideoIdea(spec as VideoSpec, { apiKey });
      const { filled } = onAnalysis(analysis);
      setHint({ filled, question: analysis.nextQuestion });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const hasIdea = spec.idea.trim().length > 0;

  return (
    <div className="border border-line rounded-sm bg-paperRaised p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs uppercase tracking-wide text-inkMuted flex items-center gap-1.5">
          <Sparkles size={12} /> AI assist
        </span>
        {apiKey ? (
          <button
            type="button"
            onClick={clearKey}
            className="flex items-center gap-1 font-mono text-[10px] text-inkMuted hover:text-risk transition-colors"
          >
            <X size={10} /> clear key
          </button>
        ) : (
          <span className="font-mono text-[10px] text-inkMuted">
            bring your own key
          </span>
        )}
      </div>

      {!apiKey ? (
        <>
          <p className="font-body text-xs text-inkMuted mb-2">
            Paste an Anthropic API key and the assist will pre-fill fields
            your idea already answers, then suggest the next best question.
            The key is stored only in this browser and sent only to
            api.anthropic.com — never to us.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveKey()}
              placeholder="sk-ant-..."
              className="flex-1 bg-paper border border-line rounded-sm px-3 py-1.5 text-xs font-mono text-ink placeholder:text-inkMuted focus:outline-none focus:border-ink"
            />
            <button
              type="button"
              onClick={saveKey}
              disabled={!draft.trim()}
              className="px-3 py-1.5 font-mono text-xs uppercase border border-line rounded-sm text-ink hover:border-ink disabled:opacity-40 transition-colors"
            >
              Save
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={analyze}
            disabled={!hasIdea || busy}
            className="w-full py-2 font-mono text-xs uppercase tracking-wide border border-ink bg-ink text-paperRaised rounded-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 size={12} className="animate-spin" /> analyzing…
              </>
            ) : (
              <>Pre-fill from idea</>
            )}
          </button>
          {!hasIdea && (
            <p className="font-mono text-[10px] text-inkMuted mt-1.5">
              type an idea first — the assist extracts only what you wrote
            </p>
          )}
        </>
      )}

      {error && (
        <p className="font-mono text-[11px] text-risk mt-2">{error}</p>
      )}

      {hint && (
        <div className="mt-3 pt-3 border-t border-dashed border-line space-y-1.5">
          <p className="font-mono text-[11px] text-ink">
            {hint.filled.length > 0
              ? `Pre-filled: ${hint.filled.join(", ")}. Your own picks were not touched.`
              : "Nothing new to pre-fill — the idea didn't state any unanswered field."}
          </p>
          {hint.question && (
            <p className="font-body text-xs text-inkMuted">
              <span className="font-mono uppercase text-[10px]">
                next best question →{" "}
              </span>
              {hint.question}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
