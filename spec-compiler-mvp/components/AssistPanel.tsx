"use client";

// BYOK AI assist — bring a key from ANY supported provider (one at a time).
// It parses the idea so the form never re-asks what you already typed, and
// suggests the next-best question. Strictly optional; without a key the app
// is the same static form.
//
// Key handling:
//  - Anthropic: sent browser → api.anthropic.com directly; never touches
//    our server.
//  - Other providers: sent to our same-origin /api/analyze proxy, which
//    forwards it to the provider and never stores it (those providers block
//    direct browser calls).
// Either way the key lives only in this browser's localStorage.

import { useEffect, useState } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { Domain, ImageSpec, VideoSpec } from "@/lib/types";
import { Analysis } from "@/lib/analyze-core";
import {
  PROVIDERS,
  PROVIDER_LIST,
  DEFAULT_PROVIDER_ID,
} from "@/lib/providers";

const STORAGE_KEY = "spec-compiler.provider.v1";
const LEGACY_ANTHROPIC_KEY = "spec-compiler.anthropic-key";

interface ProviderConfig {
  providerId: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface Props {
  domain: Domain;
  spec: ImageSpec | VideoSpec;
  onAnalysis: (a: Analysis) => { filled: string[] };
}

interface Hint {
  filled: string[];
  question: string | null;
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/401|403|authentication|unauthor/i.test(msg)) {
    return "The provider rejected that key — check it and try again.";
  }
  if (/429|rate.?limit/i.test(msg)) {
    return "Rate-limited by the provider — wait a moment and retry.";
  }
  return msg.slice(0, 180);
}

function loadConfig(): ProviderConfig | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as Partial<ProviderConfig>;
      if (c && typeof c.apiKey === "string" && typeof c.providerId === "string") {
        return {
          providerId: PROVIDERS[c.providerId] ? c.providerId : DEFAULT_PROVIDER_ID,
          apiKey: c.apiKey,
          model: typeof c.model === "string" ? c.model : "",
          baseUrl: typeof c.baseUrl === "string" ? c.baseUrl : "",
        };
      }
    }
    // Migrate the old Anthropic-only key.
    const legacy = window.localStorage.getItem(LEGACY_ANTHROPIC_KEY);
    if (legacy) {
      return { providerId: "anthropic", apiKey: legacy, model: "", baseUrl: "" };
    }
  } catch {
    /* corrupt storage — fall through to no config */
  }
  return null;
}

export default function AssistPanel({ domain, spec, onAnalysis }: Props) {
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  // Draft inputs (before Save)
  const [providerId, setProviderId] = useState<string>(DEFAULT_PROVIDER_ID);
  const [draftKey, setDraftKey] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    const loaded = loadConfig();
    if (loaded) {
      setConfig(loaded);
      setProviderId(loaded.providerId);
    } else {
      setDraftModel(PROVIDERS[DEFAULT_PROVIDER_ID].defaultModel);
    }
  }, []);

  // A hint about one domain's spec is meaningless in the other.
  useEffect(() => {
    setHint(null);
    setError(null);
  }, [domain]);

  const provider = PROVIDERS[providerId];
  const active = config && config.providerId === providerId ? config : null;

  const onProviderChange = (id: string) => {
    setProviderId(id);
    setDraftKey("");
    setDraftModel(PROVIDERS[id].defaultModel);
    setDraftBaseUrl("");
    setError(null);
  };

  const saveConfig = () => {
    const key = draftKey.trim();
    if (!key) return;
    const next: ProviderConfig = {
      providerId,
      apiKey: key,
      model:
        provider.kind === "openai-compat"
          ? draftModel.trim() || provider.defaultModel
          : "",
      baseUrl: provider.editableBaseUrl ? draftBaseUrl.trim() : "",
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.localStorage.removeItem(LEGACY_ANTHROPIC_KEY);
    } catch {
      /* non-fatal: keep it in memory for this session */
    }
    setConfig(next);
    setDraftKey("");
    setError(null);
  };

  const clearConfig = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setConfig(null);
    setHint(null);
    setError(null);
    setDraftModel(PROVIDERS[providerId].defaultModel);
  };

  const analyze = async () => {
    if (!active || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { analyzeImageIdea, analyzeVideoIdea } = await import("@/lib/analyze");
      const opts = {
        providerId: active.providerId,
        apiKey: active.apiKey,
        model: active.model,
        baseUrl: active.baseUrl,
      };
      const analysis =
        domain === "image"
          ? await analyzeImageIdea(spec as ImageSpec, opts)
          : await analyzeVideoIdea(spec as VideoSpec, opts);
      const { filled } = onAnalysis(analysis);
      setHint({ filled, question: analysis.nextQuestion });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const hasIdea = spec.idea.trim().length > 0;
  const keyRoute =
    provider.kind === "anthropic"
      ? "Sent to Anthropic directly — never touches our server."
      : "Sent through this app's proxy to the provider — never stored.";

  return (
    <div className="border border-line rounded-sm bg-paperRaised p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs uppercase tracking-wide text-inkMuted flex items-center gap-1.5">
          <Sparkles size={12} /> AI assist
        </span>
        <span className="font-mono text-[10px] text-inkMuted">
          bring your own key
        </span>
      </div>

      {/* Provider picker — always visible */}
      <label className="block mb-2">
        <span className="font-mono text-[10px] uppercase text-inkMuted">
          Provider
        </span>
        <select
          value={providerId}
          onChange={(e) => onProviderChange(e.target.value)}
          className="mt-1 w-full bg-paper border border-line rounded-sm px-2 py-1.5 text-xs font-mono text-ink focus:outline-none focus:border-ink"
        >
          {PROVIDER_LIST.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {active ? (
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
          <div className="flex items-center justify-between mt-1.5">
            <span className="font-mono text-[10px] text-inkMuted">
              {provider.label}
              {provider.kind === "openai-compat" && active.model
                ? ` · ${active.model}`
                : ""}{" "}
              key saved
            </span>
            <button
              type="button"
              onClick={clearConfig}
              className="flex items-center gap-1 font-mono text-[10px] text-inkMuted hover:text-risk transition-colors"
            >
              <X size={10} /> clear key
            </button>
          </div>
          {!hasIdea && (
            <p className="font-mono text-[10px] text-inkMuted mt-1">
              type an idea first — the assist extracts only what you wrote
            </p>
          )}
        </>
      ) : (
        <>
          {provider.editableBaseUrl && (
            <input
              value={draftBaseUrl}
              onChange={(e) => setDraftBaseUrl(e.target.value)}
              placeholder="https://your-endpoint/v1"
              className="w-full mb-2 bg-paper border border-line rounded-sm px-3 py-1.5 text-xs font-mono text-ink placeholder:text-inkMuted focus:outline-none focus:border-ink"
            />
          )}
          {provider.kind === "openai-compat" && (
            <input
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              placeholder="model id, e.g. gpt-4o-mini"
              className="w-full mb-2 bg-paper border border-line rounded-sm px-3 py-1.5 text-xs font-mono text-ink placeholder:text-inkMuted focus:outline-none focus:border-ink"
            />
          )}
          <div className="flex gap-2">
            <input
              type="password"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveConfig()}
              placeholder={provider.keyHint}
              className="flex-1 bg-paper border border-line rounded-sm px-3 py-1.5 text-xs font-mono text-ink placeholder:text-inkMuted focus:outline-none focus:border-ink"
            />
            <button
              type="button"
              onClick={saveConfig}
              disabled={!draftKey.trim()}
              className="px-3 py-1.5 font-mono text-xs uppercase border border-line rounded-sm text-ink hover:border-ink disabled:opacity-40 transition-colors"
            >
              Save
            </button>
          </div>
          <p className="font-mono text-[10px] text-inkMuted mt-1.5">
            {keyRoute}
            {provider.keysUrl && (
              <>
                {" "}
                <a
                  href={provider.keysUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-ink"
                >
                  get a key
                </a>
              </>
            )}
          </p>
        </>
      )}

      {error && <p className="font-mono text-[11px] text-risk mt-2">{error}</p>}

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
