import { describe, expect, it, vi } from "vitest";
import { runAudit } from "./auditEngine";

describe("Matrix audit engine", () => {
  it("creates distinct results for different URLs", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(`<html lang="en"><head><title>${String(input)}</title><meta name="description" content="A site" /><meta name="viewport" content="width=device-width" /></head><body><main><h1>Research</h1><h2>Capabilities</h2><img alt="Diagram" /><a href="/about">About</a></main></body></html>`, { status: 200 })));
    const first = await runAudit("https://www.matrka.net/");
    const second = await runAudit("https://www.wikipedia.org/");
    expect(first.auditId).not.toBe(second.auditId);
    expect(first.url).not.toBe(second.url);
    expect(first.overallScore).not.toBe(second.overallScore);
    expect(first.organizationalThesis).not.toBe(second.organizationalThesis);
  });

  it("lowers accessibility score when alt text is removed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(String(input).includes("bad") ? "<html><body><h1>Site</h1><img src='x'><img src='y'></body></html>" : "<html><body><h1>Site</h1><img alt='x' src='x'><img alt='y' src='y'></body></html>", { status: 200 })));
    const good = await runAudit("https://example.com/good");
    const bad = await runAudit("https://example.com/bad");
    const goodScore = good.dimensionScores.find((d) => d.key === "technical")?.score ?? 0;
    const badScore = bad.dimensionScores.find((d) => d.key === "technical")?.score ?? 0;
    expect(badScore).toBeLessThan(goodScore);
  });
});
