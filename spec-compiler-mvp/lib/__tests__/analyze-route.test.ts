import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "@/app/api/analyze/route";

interface UpstreamCall {
  url: string;
  init: RequestInit;
}

function stubUpstream(
  status: number,
  body: unknown
): { calls: UpstreamCall[] } {
  const calls: UpstreamCall[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return { calls };
}

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("/api/analyze proxy", () => {
  it("forwards an openai-compat request to the provider with the user's key", async () => {
    const { calls } = stubUpstream(200, {
      choices: [{ message: { content: '{"format":"square"}' } }],
    });

    const res = await POST(
      req(
        { provider: "openai", model: "gpt-4o-mini", system: "S", user: "U" },
        { "x-provider-key": "sk-user-123" }
      )
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: '{"format":"square"}' });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    const h = new Headers(calls[0].init.headers as HeadersInit);
    expect(h.get("authorization")).toBe("Bearer sk-user-123");
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.model).toBe("gpt-4o-mini");
    expect(sent.messages[0]).toEqual({ role: "system", content: "S" });
    expect(sent.messages[1]).toEqual({ role: "user", content: "U" });
  });

  it("routes NVIDIA to its own base URL", async () => {
    const { calls } = stubUpstream(200, {
      choices: [{ message: { content: "{}" } }],
    });
    await POST(
      req(
        { provider: "nvidia", model: "nvidia/llama-3.1-nemotron-70b-instruct", system: "S", user: "U" },
        { "x-provider-key": "nvapi-x" }
      )
    );
    expect(calls[0].url).toBe(
      "https://integrate.api.nvidia.com/v1/chat/completions"
    );
  });

  it("forwards a bounded maxTokens override for advanced questions", async () => {
    const { calls } = stubUpstream(200, {
      choices: [{ message: { content: "{}" } }],
    });
    await POST(
      req(
        { provider: "openai", model: "m", system: "s", user: "u", maxTokens: 2500 },
        { "x-provider-key": "k" }
      )
    );
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.max_tokens).toBe(2500);
  });

  it("clamps excessive maxTokens requests", async () => {
    const { calls } = stubUpstream(200, {
      choices: [{ message: { content: "{}" } }],
    });
    await POST(
      req(
        { provider: "openai", model: "m", system: "s", user: "u", maxTokens: 99999 },
        { "x-provider-key": "k" }
      )
    );
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.max_tokens).toBe(4096);
  });

  it("rejects a missing key", async () => {
    const res = await POST(req({ provider: "openai", model: "m", system: "s", user: "u" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/key/i);
  });

  it("refuses to proxy Anthropic (that path is browser-direct)", async () => {
    const res = await POST(
      req({ provider: "anthropic", model: "claude-opus-4-8", system: "s", user: "u" }, { "x-provider-key": "k" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not proxied/i);
  });

  it("rejects a custom endpoint that isn't safe https", async () => {
    const res = await POST(
      req(
        { provider: "custom", model: "m", system: "s", user: "u", baseUrl: "http://169.254.169.254" },
        { "x-provider-key": "k" }
      )
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/base url/i);
  });

  it("forwards a safe custom https endpoint", async () => {
    const { calls } = stubUpstream(200, {
      choices: [{ message: { content: "{}" } }],
    });
    await POST(
      req(
        { provider: "custom", model: "m", system: "s", user: "u", baseUrl: "https://my.host/v1" },
        { "x-provider-key": "k" }
      )
    );
    expect(calls[0].url).toBe("https://my.host/v1/chat/completions");
  });

  it("passes the provider's own error message through, without the key", async () => {
    stubUpstream(401, { error: { message: "Incorrect API key provided." } });
    const res = await POST(
      req({ provider: "openai", model: "m", system: "s", user: "u" }, { "x-provider-key": "sk-bad" })
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Incorrect API key provided.");
    expect(JSON.stringify(body)).not.toContain("sk-bad");
  });
});
