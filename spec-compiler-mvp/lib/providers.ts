// The set of AI providers a user can bring a key for. One active at a time.
//
// Two kinds:
//  - "anthropic": called browser-direct (Anthropic allows it via a CORS
//     opt-in header), so the key never leaves the browser.
//  - "openai-compat": an OpenAI-compatible chat-completions API. These
//     providers block direct browser calls (CORS), so requests go through
//     the app's own /api/analyze proxy, which forwards to `baseUrl` with
//     the user's key and never stores it.
//
// This module is imported by BOTH the browser (AssistPanel, analyze) and
// the server route, so it stays pure data — no browser/node-only APIs.
//
// defaultModel values verified 2026-07-24. Model IDs drift — each is
// editable in the UI, so a stale default is a nuisance, not a breakage.
// Free-tier notes (for a free key from each provider):
//   NVIDIA  — free `nvapi-` key (NVIDIA Developer Program, no card, ~40 rpm)
//   Google  — free tier ~30 rpm / 1500 rpd
//   Groq    — gpt-oss models are on the free tier
//   OpenRouter — `:free` model variants exist (rotate; not used as default)
//   OpenAI / Mistral — paid (Mistral has a limited free experiment tier)

export type ProviderKind = "anthropic" | "openai-compat";

export interface Provider {
  id: string;
  label: string;
  kind: ProviderKind;
  /** openai-compat only: chat-completions base, WITHOUT the trailing
   * /chat/completions. Undefined for the custom provider (user supplies it). */
  baseUrl?: string;
  /** Pre-filled, editable for openai-compat providers (model names drift). */
  defaultModel: string;
  /** Where the user gets a key. */
  keysUrl: string;
  /** Input placeholder / key-shape hint. */
  keyHint: string;
  /** custom provider: the user types the base URL themselves. */
  editableBaseUrl?: boolean;
}

export const PROVIDERS: Record<string, Provider> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    kind: "anthropic",
    defaultModel: "claude-opus-4-8",
    keysUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-...",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compat",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    keysUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-...",
  },
  nvidia: {
    id: "nvidia",
    label: "NVIDIA",
    kind: "openai-compat",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    // meta/llama-3.1-8b-instruct hit end-of-life on 2026-08-26 (NVIDIA now
    // returns 410 Gone for it). nemotron-70b-instruct is a current, strong
    // instruction model that handles the JSON-mode structured outputs this
    // app needs. For a lighter free-tier pick, nvidia/mistral-nemo-minitron-8b
    // or mistralai/mistral-7b-instruct-v0.3 also work.
    defaultModel: "nvidia/llama-3.1-nemotron-70b-instruct",
    keysUrl: "https://build.nvidia.com",
    keyHint: "nvapi-...",
  },
  google: {
    id: "google",
    label: "Google (Gemini)",
    kind: "openai-compat",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    // gemini-2.0-flash was shut off 2026-03-03; 2.5-flash-lite is the cheap
    // current flash on the free tier.
    defaultModel: "gemini-2.5-flash-lite",
    keysUrl: "https://aistudio.google.com/apikey",
    keyHint: "AIza...",
  },
  groq: {
    id: "groq",
    label: "Groq",
    kind: "openai-compat",
    baseUrl: "https://api.groq.com/openai/v1",
    // llama-3.3-70b-versatile is deprecated (stops ~Aug 2026); gpt-oss-20b
    // is Groq's small/fast free-tier replacement.
    defaultModel: "openai/gpt-oss-20b",
    keysUrl: "https://console.groq.com/keys",
    keyHint: "gsk_...",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    kind: "openai-compat",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    keysUrl: "https://console.mistral.ai/api-keys",
    keyHint: "your Mistral key",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    keysUrl: "https://openrouter.ai/keys",
    keyHint: "sk-or-...",
  },
  custom: {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    kind: "openai-compat",
    defaultModel: "",
    editableBaseUrl: true,
    keysUrl: "",
    keyHint: "your API key",
  },
};

export const PROVIDER_LIST: Provider[] = Object.values(PROVIDERS);

export const DEFAULT_PROVIDER_ID = "anthropic";

/** The user's active BYOK choice — one provider + its key at a time. */
export interface ProviderConfig {
  providerId: string;
  apiKey: string;
  /** openai-compat model id (editable); "" for Anthropic. */
  model: string;
  /** custom provider base URL; "" otherwise. */
  baseUrl: string;
}

/** SSRF guard for the custom provider's user-supplied base URL. Only https,
 * and never pointed at loopback / private / link-local hosts. */
export function isSafeBaseUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  // Block obvious private / loopback / link-local IPv4 literals.
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return false;
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (host === "[::1]" || host.startsWith("[fd") || host.startsWith("[fe80")) {
    return false;
  }
  return true;
}

/** Resolve the chat-completions base URL for an openai-compat provider,
 * validating the custom case. Returns null if unusable. */
export function resolveBaseUrl(
  provider: Provider,
  customBaseUrl?: string
): string | null {
  if (provider.editableBaseUrl) {
    const base = (customBaseUrl ?? "").trim().replace(/\/+$/, "");
    return base && isSafeBaseUrl(base) ? base : null;
  }
  return provider.baseUrl ?? null;
}
