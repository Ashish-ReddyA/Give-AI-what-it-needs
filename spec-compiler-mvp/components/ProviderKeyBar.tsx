"use client";

// BYOK key management — one provider at a time. Owns the localStorage
// config and reports the active config up so the question engine can use
// it. No analysis button here; asking is the question engine's job.

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import {
  PROVIDERS,
  PROVIDER_LIST,
  DEFAULT_PROVIDER_ID,
  ProviderConfig,
} from "@/lib/providers";

const STORAGE_KEY = "spec-compiler.provider.v1";
const LEGACY_ANTHROPIC_KEY = "spec-compiler.anthropic-key";

interface Props {
  onConfigChange: (config: ProviderConfig | null) => void;
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
    const legacy = window.localStorage.getItem(LEGACY_ANTHROPIC_KEY);
    if (legacy) return { providerId: "anthropic", apiKey: legacy, model: "", baseUrl: "" };
  } catch {
    /* corrupt storage → no config */
  }
  return null;
}

export default function ProviderKeyBar({ onConfigChange }: Props) {
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [providerId, setProviderId] = useState<string>(DEFAULT_PROVIDER_ID);
  const [draftKey, setDraftKey] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState("");

  useEffect(() => {
    const loaded = loadConfig();
    if (loaded) {
      setConfig(loaded);
      setProviderId(loaded.providerId);
      onConfigChange(loaded);
    } else {
      setDraftModel(PROVIDERS[DEFAULT_PROVIDER_ID].defaultModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const provider = PROVIDERS[providerId];
  const active = config && config.providerId === providerId ? config : null;

  const onProviderChange = (id: string) => {
    setProviderId(id);
    setDraftKey("");
    setDraftModel(PROVIDERS[id].defaultModel);
    setDraftBaseUrl("");
  };

  const save = () => {
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
      /* keep in memory for this session */
    }
    setConfig(next);
    setDraftKey("");
    onConfigChange(next);
  };

  const clear = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setConfig(null);
    setDraftModel(PROVIDERS[providerId].defaultModel);
    onConfigChange(null);
  };

  const keyRoute =
    provider.kind === "anthropic"
      ? "Sent to Anthropic directly — never touches our server."
      : "Sent through this app's proxy to the provider — never stored.";

  // Free-tier hint so a new user knows they can try this without paying.
  const freeHint: Record<string, string> = {
    nvidia: "free key available · no card",
    google: "free tier · ~30 rpm",
    groq: "free tier · gpt-oss models",
    openrouter: "free :free model variants exist",
    anthropic: "paid",
    openai: "paid",
    mistral: "limited free experiment tier",
    custom: "",
  };

  return (
    <div className="border border-line rounded-sm bg-paperRaised p-4 sm:p-5 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs uppercase tracking-wide text-inkMuted flex items-center gap-1.5">
          <Sparkles size={13} /> AI key
        </span>
        <span className="font-mono text-[10px] text-inkFaint">
          bring your own key
        </span>
      </div>

      <label className="block mb-2.5">
        <span className="font-mono text-[10px] uppercase text-inkFaint">Provider</span>
        <select
          value={providerId}
          onChange={(e) => onProviderChange(e.target.value)}
          className="mt-1 w-full bg-paper border border-line rounded-sm px-2.5 py-2 text-xs font-mono text-ink focus:outline-none focus:border-ink transition-colors"
        >
          {PROVIDER_LIST.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {freeHint[providerId] && (
        <p className="font-mono text-[10px] text-safe mb-2.5 flex items-center gap-1">
          <span className="inline-block w-1 h-1 rounded-full bg-safe" />
          {freeHint[providerId]}
        </p>
      )}

      {active ? (
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-inkMuted">
            {provider.label}
            {provider.kind === "openai-compat" && active.model
              ? ` · ${active.model}`
              : ""}{" "}
            key saved
          </span>
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1 font-mono text-[10px] text-inkMuted hover:text-risk transition-colors"
          >
            <X size={10} /> clear key
          </button>
        </div>
      ) : (
        <>
          {provider.editableBaseUrl && (
            <input
              value={draftBaseUrl}
              onChange={(e) => setDraftBaseUrl(e.target.value)}
              placeholder="https://your-endpoint/v1"
              className="w-full mb-2 bg-paper border border-line rounded-sm px-2.5 py-2 text-xs font-mono text-ink placeholder:text-inkFaint focus:outline-none focus:border-ink transition-colors"
            />
          )}
          {provider.kind === "openai-compat" && (
            <input
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              placeholder="model id, e.g. gpt-4o-mini"
              className="w-full mb-2 bg-paper border border-line rounded-sm px-2.5 py-2 text-xs font-mono text-ink placeholder:text-inkFaint focus:outline-none focus:border-ink transition-colors"
            />
          )}
          <div className="flex gap-2">
            <input
              type="password"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              placeholder={provider.keyHint}
              className="flex-1 bg-paper border border-line rounded-sm px-2.5 py-2 text-xs font-mono text-ink placeholder:text-inkFaint focus:outline-none focus:border-ink transition-colors"
            />
            <button
              type="button"
              onClick={save}
              disabled={!draftKey.trim()}
              className="px-3.5 py-2 font-mono text-xs uppercase border border-line rounded-sm text-ink hover:border-ink hover:bg-paperRaised disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Save
            </button>
          </div>
          <p className="font-mono text-[10px] text-inkFaint mt-2.5 leading-relaxed">
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
    </div>
  );
}
