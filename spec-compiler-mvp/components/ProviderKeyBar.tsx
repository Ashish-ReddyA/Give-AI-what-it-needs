"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import {
  PROVIDERS,
  PROVIDER_LIST,
  DEFAULT_PROVIDER_ID,
  ProviderConfig,
} from "@/lib/providers";

const STORAGE_KEY = "spec-compiler.provider.v1";
const LEGACY_ANTHROPIC_KEY = "spec-compiler.anthropic-key";
const RETIRED_NVIDIA_MODELS = new Set(["meta/llama-3.1-8b-instruct"]);

interface Props {
  onConfigChange: (config: ProviderConfig | null) => void;
}

function loadConfig(): ProviderConfig | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<ProviderConfig>;
      if (saved && typeof saved.apiKey === "string" && typeof saved.providerId === "string") {
        const providerId = PROVIDERS[saved.providerId] ? saved.providerId : DEFAULT_PROVIDER_ID;
        let model = typeof saved.model === "string" ? saved.model : "";
        // Existing users can still have the retired NVIDIA model in localStorage.
        // Migrate it automatically so the upstream 410 does not survive a code deploy.
        if (providerId === "nvidia" && RETIRED_NVIDIA_MODELS.has(model)) {
          model = PROVIDERS.nvidia.defaultModel;
        }
        return {
          providerId,
          apiKey: saved.apiKey,
          model,
          baseUrl: typeof saved.baseUrl === "string" ? saved.baseUrl : "",
        };
      }
    }
    const legacy = window.localStorage.getItem(LEGACY_ANTHROPIC_KEY);
    if (legacy) {
      return { providerId: "anthropic", apiKey: legacy, model: "", baseUrl: "" };
    }
  } catch {
    // Corrupt or unavailable storage leaves the provider disconnected.
  }
  return null;
}

export default function ProviderKeyBar({ onConfigChange }: Props) {
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [providerId, setProviderId] = useState(DEFAULT_PROVIDER_ID);
  const [draftKey, setDraftKey] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [draftBaseUrl, setDraftBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const loaded = loadConfig();
    if (loaded) {
      setConfig(loaded);
      setProviderId(loaded.providerId);
      onConfigChange(loaded);
      // Persist any retired-model migration immediately.
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
    } else {
      setDraftModel(PROVIDERS[DEFAULT_PROVIDER_ID].defaultModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const provider = PROVIDERS[providerId];
  const active = config && config.providerId === providerId ? config : null;

  const freeHint: Record<string, string> = {
    nvidia: "Free developer key available",
    google: "Free tier available",
    groq: "Free tier available",
    openrouter: "Free model variants available",
    anthropic: "Paid API access",
    openai: "Paid API access",
    mistral: "Limited trial access",
    custom: "Custom endpoint",
  };

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
      // Keep the configuration in memory for this session.
    }
    setConfig(next);
    setDraftKey("");
    onConfigChange(next);
  };

  const clear = () => {
    if (!window.confirm("Remove the saved AI provider key from this browser?")) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures; clear in-memory state anyway.
    }
    setConfig(null);
    setDraftModel(PROVIDERS[providerId].defaultModel);
    onConfigChange(null);
  };

  return (
    <section className="rounded-xl border border-borderUi bg-surface p-5 shadow-card" aria-labelledby="provider-title">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primarySoft text-primary">
            <KeyRound size={19} />
          </span>
          <div>
            <h2 id="provider-title" className="text-sm font-semibold text-textPrimary">AI provider</h2>
            <p className="mt-0.5 text-sm text-textSecondary">
              {config ? `${PROVIDERS[config.providerId].label} connected` : "Connect a provider to analyze and refine your brief"}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${config ? "bg-successSoft text-success" : "bg-surfaceSubtle text-textMuted"}`}>
          {config ? "Connected" : "Setup required"}
        </span>
      </div>

      {active ? (
        <div className="mt-4 rounded-lg border border-borderUi bg-surfaceSubtle p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-textPrimary">{provider.label}</p>
              {active.model && (
                <p className="mt-0.5 truncate font-mono text-xs text-textMuted" title={active.model}>{active.model}</p>
              )}
            </div>
            <button
              type="button"
              onClick={clear}
              className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-textSecondary hover:bg-dangerSoft hover:text-danger"
            >
              <Trash2 size={16} /> Remove
            </button>
          </div>
          <div className="mt-3 flex items-start gap-2 border-t border-borderUi pt-3 text-xs leading-5 text-textMuted">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
            <span>Saved in this browser. Requests use your key only when you analyze or compose a prompt.</span>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="provider-select" className="mb-1.5 block text-sm font-medium text-textPrimary">Provider</label>
            <select
              id="provider-select"
              value={providerId}
              onChange={(event) => onProviderChange(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-borderUi bg-surface px-3.5 text-sm text-textPrimary focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
            >
              {PROVIDER_LIST.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-textMuted">{freeHint[providerId]}</p>
          </div>

          {provider.editableBaseUrl && (
            <div>
              <label htmlFor="provider-base-url" className="mb-1.5 block text-sm font-medium text-textPrimary">Endpoint URL</label>
              <input
                id="provider-base-url"
                type="url"
                value={draftBaseUrl}
                onChange={(event) => setDraftBaseUrl(event.target.value)}
                placeholder="https://your-endpoint/v1"
                className="min-h-11 w-full rounded-lg border border-borderUi bg-surface px-3.5 text-sm text-textPrimary placeholder:text-textMuted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
            </div>
          )}

          {provider.kind === "openai-compat" && (
            <div>
              <label htmlFor="provider-model" className="mb-1.5 block text-sm font-medium text-textPrimary">Model</label>
              <input
                id="provider-model"
                value={draftModel}
                onChange={(event) => setDraftModel(event.target.value)}
                placeholder="Model ID"
                className="min-h-11 w-full rounded-lg border border-borderUi bg-surface px-3.5 font-mono text-sm text-textPrimary placeholder:text-textMuted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
            </div>
          )}

          <div>
            <label htmlFor="provider-key" className="mb-1.5 block text-sm font-medium text-textPrimary">API key</label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  id="provider-key"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  value={draftKey}
                  onChange={(event) => setDraftKey(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && save()}
                  placeholder={provider.keyHint}
                  className="min-h-11 w-full rounded-lg border border-borderUi bg-surface px-3.5 pr-11 font-mono text-sm text-textPrimary placeholder:text-textMuted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((value) => !value)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-textMuted hover:text-textPrimary"
                >
                  {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <button
                type="button"
                onClick={save}
                disabled={!draftKey.trim()}
                className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primaryHover disabled:cursor-not-allowed disabled:opacity-45"
              >
                Connect
              </button>
            </div>
          </div>

          <p className="flex items-start gap-2 text-xs leading-5 text-textMuted">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
            <span>
              Your key is saved in this browser. {provider.kind === "anthropic" ? "Requests go directly to Anthropic." : "Requests pass through the app proxy and are not logged."}
              {provider.keysUrl && (
                <> <a href={provider.keysUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Get a key</a>.</>
              )}
            </span>
          </p>
        </div>
      )}
    </section>
  );
}
