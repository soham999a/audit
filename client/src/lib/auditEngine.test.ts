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

  it("derives relationship clarity from site-dependent relationship signals", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(String(input).includes("dense") ? "<html lang='en'><head><meta name='description' content='Dense site'><meta name='viewport' content='width=device-width'></head><body><nav><a href='/a'>A</a><a href='/b'>B</a><a href='/c'>C</a><a href='/d'>D</a></nav><main><h1>Organization</h1><h2>Capabilities</h2><h2>Research</h2><h2>Products</h2><h2>Impact</h2><a href='/about'>About</a><a href='/work'>Work</a></main></body></html>" : "<html><body><h1>Site</h1></body></html>", { status: 200 })));
    const sparse = await runAudit("https://example.com/sparse");
    const dense = await runAudit("https://example.com/dense");
    expect(sparse.graph.relationshipClarity).not.toBe(0.57);
    expect(dense.graph.relationshipClarity).not.toBe(sparse.graph.relationshipClarity);
    expect(dense.trace.some((line) => line.startsWith("GRAPH CLARITY INPUTS"))).toBe(true);
  });
});
