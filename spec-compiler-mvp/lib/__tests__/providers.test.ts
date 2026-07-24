import { describe, it, expect } from "vitest";
import {
  PROVIDERS,
  PROVIDER_LIST,
  isSafeBaseUrl,
  resolveBaseUrl,
} from "../providers";

describe("provider registry", () => {
  it("has Anthropic as the only browser-direct provider", () => {
    const direct = PROVIDER_LIST.filter((p) => p.kind === "anthropic");
    expect(direct.map((p) => p.id)).toEqual(["anthropic"]);
  });

  it("gives every openai-compat provider a base URL except custom", () => {
    for (const p of PROVIDER_LIST) {
      if (p.kind !== "openai-compat") continue;
      if (p.editableBaseUrl) expect(p.baseUrl).toBeUndefined();
      else expect(p.baseUrl).toMatch(/^https:\/\//);
    }
  });

  it("includes the providers the user named", () => {
    expect(PROVIDERS.nvidia?.baseUrl).toContain("nvidia.com");
    expect(PROVIDERS.openai).toBeTruthy();
    expect(PROVIDERS.groq).toBeTruthy();
  });
});

describe("isSafeBaseUrl (SSRF guard for custom endpoints)", () => {
  it("allows public https URLs", () => {
    expect(isSafeBaseUrl("https://api.example.com/v1")).toBe(true);
  });
  it("rejects http and non-URLs", () => {
    expect(isSafeBaseUrl("http://api.example.com/v1")).toBe(false);
    expect(isSafeBaseUrl("not a url")).toBe(false);
  });
  it("rejects loopback / private / link-local hosts", () => {
    for (const u of [
      "https://localhost/v1",
      "https://127.0.0.1/v1",
      "https://10.0.0.5/v1",
      "https://192.168.1.10/v1",
      "https://172.16.0.1/v1",
      "https://169.254.169.254/v1",
      "https://service.internal/v1",
    ]) {
      expect(isSafeBaseUrl(u)).toBe(false);
    }
  });
});

describe("resolveBaseUrl", () => {
  it("returns the fixed base for known providers", () => {
    expect(resolveBaseUrl(PROVIDERS.openai)).toBe("https://api.openai.com/v1");
  });
  it("validates and trims the custom base, rejecting unsafe ones", () => {
    expect(resolveBaseUrl(PROVIDERS.custom, "https://x.example.com/v1/")).toBe(
      "https://x.example.com/v1"
    );
    expect(resolveBaseUrl(PROVIDERS.custom, "http://x.example.com")).toBeNull();
    expect(resolveBaseUrl(PROVIDERS.custom, "")).toBeNull();
  });
});
