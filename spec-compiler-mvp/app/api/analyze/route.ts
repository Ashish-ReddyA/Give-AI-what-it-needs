// Same-origin proxy for OpenAI-compatible providers.
//
// Why it exists: NVIDIA / OpenAI / Groq / Mistral / etc. block direct
// browser calls (CORS). The browser posts the request here with the user's
// key in a header; this function forwards it server-to-server and returns
// the model's text. Anthropic does NOT use this path — it's called
// browser-direct so its key never leaves the browser.
//
// The key is read from a header, used for one outbound request, and never
// logged or persisted. There is no app-side API key — every request carries
// the user's own.

import { PROVIDERS, resolveBaseUrl } from "@/lib/providers";

export const runtime = "nodejs";
// Never cache — every request carries a distinct user key + prompt.
export const dynamic = "force-dynamic";

interface ProxyBody {
  provider?: string;
  model?: string;
  system?: string;
  user?: string;
  baseUrl?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  const key = req.headers.get("x-provider-key");
  if (!key) return json({ error: "Missing provider key." }, 400);

  let body: ProxyBody;
  try {
    body = (await req.json()) as ProxyBody;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const { provider: providerId, model, system, user, baseUrl: customBaseUrl } = body;
  const provider = providerId ? PROVIDERS[providerId] : undefined;

  if (!provider || provider.kind !== "openai-compat") {
    // Anthropic and unknown providers must not come through here.
    return json({ error: "This provider is not proxied." }, 400);
  }
  if (!model || !system || !user) {
    return json({ error: "Missing model, system, or user content." }, 400);
  }

  const base = resolveBaseUrl(provider, customBaseUrl);
  if (!base) {
    return json(
      { error: "Missing or unsafe base URL (custom endpoints must be https)." },
      400
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream request failed";
    return json({ error: `Could not reach ${provider.label}: ${msg}` }, 502);
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    // Surface the provider's own error, but never echo the key. Different
    // providers put the message in different fields: OpenAI/Mistral use
    // error.message, Google uses message, NVIDIA uses detail. Read all of
    // them so a dead-model 410 (NVIDIA) reads as a clear, actionable message
    // instead of a bare status code.
    let message = `${provider.label} returned ${upstream.status}.`;
    try {
      const parsed = JSON.parse(raw);
      message =
        parsed?.error?.message ||
        parsed?.message ||
        parsed?.detail ||
        message;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    return json({ error: message }, upstream.status);
  }

  let text = "";
  try {
    const data = JSON.parse(raw);
    text = data?.choices?.[0]?.message?.content ?? "";
  } catch {
    return json({ error: `${provider.label} returned an unreadable response.` }, 502);
  }

  return json({ text });
}
