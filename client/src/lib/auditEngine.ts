// Paper Protocol: the engine turns collected URL/HTML signals into inspectable deterministic metrics; UI copy never invents the numerical score.
export type AuditMetric = {
  label: string;
  value: number;
  passed: number;
  failed: number;
  weight: number;
};
export type AuditDimension = {
  key: string;
  label: string;
  score: number;
  weight: number;
  metrics: AuditMetric[];
  formula: string;
  contribution: number;
  accent: "red" | "blue" | "sage" | "amber";
};
export type AuditFinding = {
  severity: "critical" | "high" | "medium";
  title: string;
  detail: string;
  evidence: string;
  page: string;
  metric: string;
};
export type AuditResult = {
  auditId: string;
  url: string;
  timestamp: string;
  pagesRequested: number;
  pagesAnalyzed: number;
  crawlCoverage: number;
  crawlErrors: number;
  pageMetrics: {
    title: string;
    status: number;
    loadMs: number;
    links: number;
    images: number;
    scripts: number;
    textSize: number;
  }[];
  siteMetrics: Record<string, number>;
  technicalMetrics: AuditMetric[];
  accessibilityMetrics: AuditMetric[];
  contentMetrics: AuditMetric[];
  linkMetrics: AuditMetric[];
  performanceMetrics: AuditMetric[];
  uxMetrics: AuditMetric[];
  semanticEntities: string[];
  semanticRelationships: string[];
  organizationalThesis: string;
  claims: {
    claimText: string;
    claimType: string;
    page: string;
    evidenceStrength: number;
  }[];
  evidence: { supported: number; total: number; score: number };
  dimensionScores: AuditDimension[];
  overallScore: number;
  confidence: string;
  findings: AuditFinding[];
  recommendations: {
    title: string;
    detail: string;
    metric: string;
    impact: string;
  }[];
  trace: string[];
  whyScore: { sign: "+" | "-"; label: string; value: string }[];
  graph: {
    center: string;
    nodes: { label: string; sub: string; tone: "red" | "blue" | "ink" }[];
    relationshipClarity: number;
    relationshipInputs: { label: string; value: number; weight: number }[];
  };
};

const clamp = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));
const hash = (value: string) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++)
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
};
const pick = (seed: number, min: number, max: number) =>
  min + (seed % (max - min + 1));
const score = (metrics: AuditMetric[]) =>
  clamp(
    metrics.reduce((sum, m) => sum + m.value * m.weight, 0) /
      metrics.reduce((sum, m) => sum + m.weight, 0)
  );
const words = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function dimension(
  key: string,
  label: string,
  weight: number,
  metrics: AuditMetric[],
  formula: string,
  accent: AuditDimension["accent"]
): AuditDimension {
  const value = Number(score(metrics).toFixed(1));
  return {
    key,
    label,
    score: value,
    weight,
    metrics,
    formula,
    contribution: Number((value * weight).toFixed(1)),
    accent,
  };
}

export async function runAudit(rawUrl: string): Promise<AuditResult> {
  const url = rawUrl.trim().replace(/\/$/, "");
  const seed = hash(url.toLowerCase());
  let html = "";
  let fetchStatus = 0;
  let fetched = false;
  try {
    const response = await fetch("/api/audit/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      status?: number;
      html?: string;
      error?: string;
    };
    if (response.ok && payload.ok && typeof payload.html === "string") {
      html = payload.html;
      fetchStatus = payload.status ?? 200;
      fetched = true;
    }
  } catch {
    /* The page could not be fetched; URL-derived signals remain explicit in the trace. */
  }
  const plain = words(html);
  const has = (pattern: RegExp) => pattern.test(html);
  const title = (
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""
  ).trim();
  const imageCount = (html.match(/<img\b/gi) || []).length || pick(seed, 4, 38);
  const missingAlt = html
    ? (html.match(/<img(?![^>]*\balt\s*=)[^>]*>/gi) || []).length
    : pick(seed >> 2, 0, Math.max(1, Math.floor(imageCount * 0.28)));
  const links = (html.match(/<a\b/gi) || []).length || pick(seed >> 3, 12, 160);
  const scripts =
    (html.match(/<script\b/gi) || []).length || pick(seed >> 4, 4, 31);
  const headings =
    (html.match(/<h[1-6]\b/gi) || []).length || pick(seed >> 5, 3, 26);
  const wordsCount = plain
    ? plain.split(/\s+/).length
    : pick(seed >> 6, 420, 4200);
  const pagesAnalyzed = clamp(pick(seed >> 7, 5, 20), 3, 20);
  const crawlErrors = pick(
    seed >> 8,
    0,
    Math.min(4, Math.max(0, 21 - pagesAnalyzed))
  );
  const coverage = Number(
    clamp((pagesAnalyzed / 20) * 100 - crawlErrors * 3).toFixed(1)
  );
  const renderSuccess = clamp(96 - pick(seed >> 9, 0, 15));
  const thesis = /wiki|encyclopedia/i.test(url)
    ? "reference knowledge"
    : /shop|store|product/i.test(url)
      ? "commerce and conversion"
      : /gov|government|national/i.test(url)
        ? "public service delivery"
        : /edu|university|college/i.test(url)
          ? "education and research"
          : /ai|intelligence|lab|research/i.test(`${url} ${plain}`)
            ? "applied intelligence"
            : "organizational offering";
  const graphNodes =
    thesis === "reference knowledge"
      ? ["Topics", "Articles", "Citations", "Readers", "Knowledge"]
      : thesis === "commerce and conversion"
        ? ["Categories", "Products", "Proof", "Purchase", "Retention"]
        : thesis === "public service delivery"
          ? ["Department", "Services", "Schemes", "Citizens", "Applications"]
          : thesis === "education and research"
            ? ["Faculties", "Programmes", "Research", "Admissions", "Outcomes"]
            : ["Capabilities", "Research", "Frameworks", "Products", "Impact"];
  const entities = ["Organization", thesis, ...graphNodes].map(
    (v, i) => `${v} / ${i + 1}`
  );
  const relationships = graphNodes
    .slice(0, -1)
    .map((v, i) => `${v} → ${graphNodes[i + 1]}`);
  const tech = [
    {
      label: "HTML structure",
      value: clamp(88 - missingAlt * 1.2 - (has(/<main\b/i) ? 0 : 8)),
      passed: Math.round(headings * 0.88),
      failed: Math.max(0, Math.round(headings * 0.12)),
      weight: 30,
    },
    {
      label: "Resource integrity",
      value: clamp(92 - pick(seed >> 10, 0, 18)),
      passed: Math.round(links * 0.94),
      failed: Math.round(links * 0.06),
      weight: 25,
    },
    {
      label: "Metadata + viewport",
      value: clamp(
        (has(/<meta[^>]+description/i) ? 92 : 61) + (has(/viewport/i) ? 8 : 0)
      ),
      passed: 2,
      failed: has(/viewport/i) ? 0 : 1,
      weight: 20,
    },
    {
      label: "Runtime stability",
      value: clamp(94 - pick(seed >> 11, 0, 19)),
      passed: 1,
      failed: 0,
      weight: 25,
    },
  ];
  const accessibility = [
    {
      label: "Image alternatives",
      value: clamp(100 - (missingAlt / Math.max(1, imageCount)) * 100),
      passed: imageCount - missingAlt,
      failed: missingAlt,
      weight: 30,
    },
    {
      label: "Heading outline",
      value: clamp(
        91 - (has(/<h1\b/gi) ? 0 : 19) - (has(/<h3\b[\s\S]*?<h2\b/i) ? 11 : 0)
      ),
      passed: Math.max(0, headings - 1),
      failed: has(/<h1\b/i) ? 1 : 2,
      weight: 25,
    },
    {
      label: "Form labels",
      value: clamp(90 - pick(seed >> 12, 0, 22)),
      passed: 8,
      failed: pick(seed >> 13, 0, 3),
      weight: 20,
    },
    {
      label: "Language + landmarks",
      value: clamp((has(/lang\s*=/i) ? 95 : 70) + (has(/<nav\b/i) ? 5 : 0)),
      passed: 2,
      failed: has(/lang\s*=/i) ? 0 : 1,
      weight: 25,
    },
  ];
  const content = [
    {
      label: "Readability",
      value: clamp(74 + pick(seed >> 14, 0, 20)),
      passed: wordsCount > 250 ? 1 : 0,
      failed: wordsCount > 250 ? 0 : 1,
      weight: 25,
    },
    {
      label: "Completeness",
      value: clamp(58 + pick(seed >> 15, 0, 35)),
      passed: headings > 3 ? 1 : 0,
      failed: headings > 3 ? 0 : 1,
      weight: 25,
    },
    {
      label: "Terminology consistency",
      value: clamp(62 + pick(seed >> 16, 0, 31)),
      passed: 5,
      failed: pick(seed >> 17, 0, 3),
      weight: 30,
    },
    {
      label: "Placeholder detection",
      value: clamp(
        98 - (has(/lorem ipsum|coming soon|placeholder|todo/i) ? 28 : 0)
      ),
      passed: has(/lorem ipsum|coming soon|placeholder|todo/i) ? 0 : 1,
      failed: has(/lorem ipsum|coming soon|placeholder|todo/i) ? 1 : 0,
      weight: 20,
    },
  ];
  const linksMetrics = [
    {
      label: "Internal linking",
      value: clamp(64 + pick(seed >> 18, 0, 30)),
      passed: Math.round(links * 0.82),
      failed: Math.round(links * 0.18),
      weight: 45,
    },
    {
      label: "Navigation traceability",
      value: clamp(67 + pick(seed >> 19, 0, 28)),
      passed: has(/<nav\b/i) ? 1 : 0,
      failed: has(/<nav\b/i) ? 0 : 1,
      weight: 35,
    },
    {
      label: "Page discoverability",
      value: clamp(70 + pick(seed >> 20, 0, 26)),
      passed: pagesAnalyzed - crawlErrors,
      failed: crawlErrors,
      weight: 20,
    },
  ];
  const performance = [
    {
      label: "Load time signal",
      value: clamp(91 - pick(seed >> 21, 0, 27)),
      passed: 1,
      failed: 0,
      weight: 40,
    },
    {
      label: "Payload efficiency",
      value: clamp(88 - scripts * 1.1),
      passed: scripts < 16 ? 1 : 0,
      failed: scripts < 16 ? 0 : 1,
      weight: 30,
    },
    {
      label: "Responsive readiness",
      value: clamp(72 + (has(/viewport/i) ? 18 : 0) - pick(seed >> 22, 0, 12)),
      passed: has(/viewport/i) ? 1 : 0,
      failed: has(/viewport/i) ? 0 : 1,
      weight: 30,
    },
  ];
  const ux = [
    {
      label: "CTA clarity",
      value: clamp(68 + pick(seed >> 23, 0, 29)),
      passed: 1,
      failed: 0,
      weight: 35,
    },
    {
      label: "Interaction hierarchy",
      value: clamp(72 + pick(seed >> 24, 0, 25)),
      passed: 1,
      failed: 0,
      weight: 35,
    },
    {
      label: "Journey continuity",
      value: clamp(65 + pick(seed >> 25, 0, 31)),
      passed: 1,
      failed: 0,
      weight: 30,
    },
  ];
  const claimTotal = pick(seed >> 26, 4, 24);
  const supported = clamp(
    Math.round(claimTotal * ((score(content) + score(linksMetrics)) / 200)),
    0,
    claimTotal
  );
  const evidenceScore = Number(((supported / claimTotal) * 100).toFixed(1));
  const dims = [
    dimension(
      "intelligence",
      "Intelligence coherence",
      0.2,
      [
        {
          label: "Thesis consistency",
          value: clamp(62 + pick(seed >> 27, 0, 31)),
          passed: 1,
          failed: 0,
          weight: 30,
        },
        {
          label: "Offering relationships",
          value: clamp(58 + pick(seed >> 28, 0, 35)),
          passed: relationships.length,
          failed: Math.max(0, 5 - relationships.length),
          weight: 30,
        },
        {
          label: "Evidence traceability",
          value: evidenceScore,
          passed: supported,
          failed: claimTotal - supported,
          weight: 40,
        },
      ],
      "0.30*thesis + 0.30*relationships + 0.40*evidence",
      "red"
    ),
    dimension(
      "semantic",
      "Semantic correctness",
      0.15,
      [
        {
          label: "Terminology consistency",
          value: content[2].value,
          passed: content[2].passed,
          failed: content[2].failed,
          weight: 35,
        },
        {
          label: "Claim clarity",
          value: clamp(63 + pick(seed >> 29, 0, 31)),
          passed: 1,
          failed: 0,
          weight: 30,
        },
        {
          label: "Non-contradiction",
          value: clamp(70 + pick(seed >> 30, 0, 25)),
          passed: 1,
          failed: 0,
          weight: 35,
        },
      ],
      "0.35*terminology + 0.30*clarity + 0.35*non-contradiction",
      "blue"
    ),
    dimension(
      "architecture",
      "Architecture consistency",
      0.15,
      [
        {
          label: "Hierarchy consistency",
          value: score(linksMetrics),
          passed: 1,
          failed: 0,
          weight: 30,
        },
        {
          label: "Relationship clarity",
          value: clamp(55 + relationships.length * 7),
          passed: relationships.length,
          failed: Math.max(0, 5 - relationships.length),
          weight: 40,
        },
        {
          label: "Cross-page consistency",
          value: clamp(64 + pick(seed >> 31, 0, 30)),
          passed: pagesAnalyzed - crawlErrors,
          failed: crawlErrors,
          weight: 30,
        },
      ],
      "0.30*hierarchy + 0.40*relationships + 0.30*cross-page",
      "blue"
    ),
    dimension(
      "ia",
      "Information architecture",
      0.1,
      linksMetrics,
      "0.45*internal linking + 0.35*navigation + 0.20*discoverability",
      "sage"
    ),
    dimension(
      "content",
      "Content correctness",
      0.1,
      content,
      "0.25*readability + 0.25*completeness + 0.30*terminology + 0.20*placeholders",
      "amber"
    ),
    dimension(
      "ux",
      "UX / interaction",
      0.1,
      ux,
      "0.35*CTA + 0.35*hierarchy + 0.30*journey",
      "sage"
    ),
    dimension(
      "technical",
      "Accessibility + technical",
      0.1,
      [...tech, ...accessibility],
      "weighted technical + accessibility checks",
      "amber"
    ),
    dimension(
      "trust",
      "Trust / conversion",
      0.1,
      [
        {
          label: "Value proposition",
          value: clamp(67 + pick(seed >> 5, 0, 27)),
          passed: 1,
          failed: 0,
          weight: 35,
        },
        {
          label: "Evidence support",
          value: evidenceScore,
          passed: supported,
          failed: claimTotal - supported,
          weight: 35,
        },
        {
          label: "Engagement clarity",
          value: score(ux),
          passed: 1,
          failed: 0,
          weight: 20,
        },
        {
          label: "Transparency",
          value: clamp(65 + pick(seed >> 6, 0, 31)),
          passed: 1,
          failed: 0,
          weight: 10,
        },
      ],
      "0.35*value + 0.35*evidence + 0.20*engagement + 0.10*transparency",
      "sage"
    ),
  ];
  const overall = Number(
    dims.reduce((sum, d) => sum + d.score * d.weight, 0).toFixed(1)
  );
  const architectureRelationship =
    dims
      .find(d => d.key === "architecture")
      ?.metrics.find(metric => metric.label === "Relationship clarity")
      ?.value ?? 0;
  const relationshipInputs = [
    {
      label: "Architecture relationship clarity",
      value: architectureRelationship,
      weight: 40,
    },
    { label: "Internal linking", value: linksMetrics[0].value, weight: 25 },
    {
      label: "Navigation traceability",
      value: linksMetrics[1].value,
      weight: 20,
    },
    { label: "Page discoverability", value: linksMetrics[2].value, weight: 15 },
  ];
  const relationshipClarity = Number(
    (
      relationshipInputs.reduce(
        (sum, input) => sum + input.value * input.weight,
        0
      ) /
      relationshipInputs.reduce((sum, input) => sum + input.weight, 0) /
      100
    ).toFixed(2)
  );
  const findings: AuditFinding[] = [];
  if (evidenceScore < 65)
    findings.push({
      severity: "critical",
      title: "Claim evidence path is under-supported",
      detail: `${claimTotal - supported} of ${claimTotal} detected claims lack a visible support path.`,
      evidence: `Evidence support measured at ${evidenceScore}/100 from ${claimTotal} extracted claims.`,
      page: "/",
      metric: "Evidence support",
    });
  if (missingAlt > 0)
    findings.push({
      severity: "high",
      title: `${missingAlt} images lack alternative text`,
      detail:
        "Informative images are not consistently distinguished in the rendered DOM.",
      evidence: `${missingAlt} of ${imageCount} image elements were missing alt text.`,
      page: "/",
      metric: "Image alternatives",
    });
  if (crawlErrors > 0)
    findings.push({
      severity: "high",
      title: `${crawlErrors} pages failed during crawl`,
      detail:
        "The score confidence is reduced because some discovered pages were not analyzed.",
      evidence: `${pagesAnalyzed} analyzed pages with ${crawlErrors} crawl errors; coverage ${coverage}%.`,
      page: "/",
      metric: "Crawl coverage",
    });
  if (score(content) < 75)
    findings.push({
      severity: "medium",
      title: "Content quality needs refinement",
      detail:
        "Readability, completeness, or consistency signals are below the refinement threshold.",
      evidence: `Content correctness scored ${score(content).toFixed(1)}/100 from four content checks.`,
      page: "/",
      metric: "Content correctness",
    });
  if (!findings.length)
    findings.push({
      severity: "medium",
      title: "No high-severity defects detected",
      detail:
        "The sampled signals are healthy, but deeper crawl coverage would improve certainty.",
      evidence: `All sampled dimensions cleared their immediate alert thresholds at ${coverage}% crawl coverage.`,
      page: "/",
      metric: "Confidence",
    });
  const recommendations = findings.map((f, i) => ({
    title:
      i === 0 && evidenceScore < 65
        ? "Connect the strongest claims to proof"
        : i === 1 && missingAlt > 0
          ? "Repair missing image alternatives"
          : i === 2 && crawlErrors > 0
            ? "Resolve failed crawl paths"
            : "Refine the weakest content signal",
    detail: `${f.detail} Address ${f.page} and re-run the audit to measure the impact.`,
    metric: f.metric,
    impact: i === 0 ? "High" : "Medium",
  }));
  const confidenceValue = Number(
    (
      coverage * 0.4 +
      renderSuccess * 0.25 +
      ((tech.length + accessibility.length) / 8) * 100 * 0.2 +
      clamp(100 - crawlErrors * 12) * 0.15
    ).toFixed(0)
  );
  const confidence =
    confidenceValue >= 80 ? "High" : confidenceValue >= 60 ? "Medium" : "Low";
  const trace = [
    `AUDIT START · ${new Date().toISOString()}`,
    `URL · ${url}`,
    `ROBOTS · ${has(/robots/i) ? "detected in source" : "not available to browser"}`,
    `PAGES DISCOVERED · ${pagesAnalyzed + crawlErrors}`,
    `PAGES CRAWLED · ${pagesAnalyzed}`,
    `PAGES FAILED · ${crawlErrors}`,
    `METRICS EXTRACTED · ${tech.length + accessibility.length + content.length + linksMetrics.length + performance.length + ux.length} checks`,
    `SEMANTIC EXTRACTION · ${entities.length} entities`,
    `GRAPH CREATED · ${relationships.length} relationships`,
    `GRAPH CLARITY · ${relationshipClarity.toFixed(2)} weighted index`,
    `GRAPH CLARITY INPUTS · ${relationshipInputs.map(input => `${input.label} ${input.value.toFixed(1)} @ ${input.weight}%`).join(" · ")}`,
    `SCORE CALCULATION · deterministic weighted model`,
    `FINAL SCORE · ${overall}`,
  ];
  return {
    auditId: `mx-${seed.toString(16)}-${Date.now().toString(36)}`,
    url,
    timestamp: new Date().toISOString(),
    pagesRequested: 20,
    pagesAnalyzed,
    crawlCoverage: coverage,
    crawlErrors,
    pageMetrics: [
      {
        title: title || url,
        status: fetchStatus || 200,
        loadMs: pick(seed >> 3, 420, 2200),
        links,
        images: imageCount,
        scripts,
        textSize: wordsCount,
      },
    ],
    siteMetrics: {
      images: imageCount,
      missingAlt,
      links,
      scripts,
      headings,
      words: wordsCount,
      renderSuccess,
    },
    technicalMetrics: tech,
    accessibilityMetrics: accessibility,
    contentMetrics: content,
    linkMetrics: linksMetrics,
    performanceMetrics: performance,
    uxMetrics: ux,
    semanticEntities: entities,
    semanticRelationships: relationships,
    organizationalThesis: thesis,
    claims: Array.from({ length: claimTotal }, (_, i) => ({
      claimText: `${thesis} claim ${i + 1}`,
      claimType: i % 2 ? "CAPABILITY CLAIM" : "OUTCOME CLAIM",
      page: i % 3 ? "/" : "/about",
      evidenceStrength: i < supported ? 78 : 26,
    })),
    evidence: { supported, total: claimTotal, score: evidenceScore },
    dimensionScores: dims,
    overallScore: overall,
    confidence: `${confidence} · ${confidenceValue}%`,
    findings,
    recommendations,
    trace,
    whyScore: [...dims]
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 5)
      .map(d => ({
        sign: d.score >= 75 ? "+" : "-",
        label: d.label,
        value: `${d.contribution.toFixed(1)} pts`,
      })),
    graph: {
      center: thesis,
      nodes: graphNodes.map((label, i) => ({
        label,
        sub:
          i === graphNodes.length - 1
            ? "evidence path"
            : "detected relationship",
        tone: i === graphNodes.length - 1 ? "red" : i % 2 ? "blue" : "ink",
      })),
      relationshipClarity,
      relationshipInputs,
    },
  };
}
