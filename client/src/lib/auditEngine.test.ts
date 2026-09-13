import { describe, expect, it, vi } from "vitest";
import { runAudit } from "./auditEngine";

function stubProxyFetch(htmlFor: (url: string) => string) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    let url = "";
    if (typeof init?.body === "string") {
      try {
        url = (JSON.parse(init.body) as { url?: string }).url ?? "";
      } catch {
        /* ignore malformed body */
      }
    }
    return new Response(
      JSON.stringify({
        ok: true,
        status: 200,
        url,
        html: htmlFor(url),
        truncated: false,
      }),
      { status: 200 }
    );
  });
}

describe("Matrix audit engine", () => {
  it("creates distinct results for different URLs", async () => {
    vi.stubGlobal(
      "fetch",
      stubProxyFetch(
        url =>
          `<html lang="en"><head><title>${url}</title><meta name="description" content="A site" /><meta name="viewport" content="width=device-width" /></head><body><main><h1>Research</h1><h2>Capabilities</h2><img alt="Diagram" /><a href="/about">About</a></main></body></html>`
      )
    );
    const first = await runAudit("https://www.matrka.net/");
    const second = await runAudit("https://www.wikipedia.org/");
    expect(first.auditId).not.toBe(second.auditId);
    expect(first.url).not.toBe(second.url);
    expect(first.overallScore).not.toBe(second.overallScore);
    expect(first.organizationalThesis).not.toBe(second.organizationalThesis);
  });

  it("lowers accessibility score when alt text is removed", async () => {
    vi.stubGlobal(
      "fetch",
      stubProxyFetch(url =>
        url.includes("bad")
          ? "<html><body><h1>Site</h1><img src='x'><img src='y'></body></html>"
          : "<html><body><h1>Site</h1><img alt='x' src='x'><img alt='y' src='y'></body></html>"
      )
    );
    const good = await runAudit("https://example.com/good");
    const bad = await runAudit("https://example.com/bad");
    const goodScore =
      good.dimensionScores.find(d => d.key === "technical")?.score ?? 0;
    const badScore =
      bad.dimensionScores.find(d => d.key === "technical")?.score ?? 0;
    expect(badScore).toBeLessThan(goodScore);
  });

  it("derives relationship clarity from site-dependent relationship signals", async () => {
    vi.stubGlobal(
      "fetch",
      stubProxyFetch(url =>
        url.includes("dense")
          ? "<html lang='en'><head><meta name='description' content='Dense site'><meta name='viewport' content='width=device-width'></head><body><nav><a href='/a'>A</a><a href='/b'>B</a><a href='/c'>C</a><a href='/d'>D</a></nav><main><h1>Organization</h1><h2>Capabilities</h2><h2>Research</h2><h2>Products</h2><h2>Impact</h2><a href='/about'>About</a><a href='/work'>Work</a></main></body></html>"
          : "<html><body><h1>Site</h1></body></html>"
      )
    );
    const sparse = await runAudit("https://example.com/sparse");
    const dense = await runAudit("https://example.com/dense");
    expect(sparse.graph.relationshipClarity).not.toBe(0.57);
    expect(dense.graph.relationshipClarity).not.toBe(
      sparse.graph.relationshipClarity
    );
    expect(
      dense.trace.some(line => line.startsWith("GRAPH CLARITY INPUTS"))
    ).toBe(true);
  });
});
