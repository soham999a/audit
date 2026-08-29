import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileSearch,
  Fingerprint,
  Gauge as GaugeIcon,
  GitBranch,
  Globe2,
  Info,
  Layers3,
  Link2,
  Network,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";

// Paper Protocol: editorial labels, warm paper surfaces, signal red for active defects, and evidence-led density.

type AuditState = "idle" | "running" | "complete";

type Finding = {
  severity: "critical" | "high" | "medium";
  title: string;
  detail: string;
  evidence: string;
  page: string;
};

const pipeline = [
  "Website discovery",
  "Page crawling",
  "HTML / DOM analysis",
  "Accessibility analysis",
  "Content analysis",
  "Link analysis",
  "Layout / structure",
  "Performance analysis",
  "Semantic analysis",
  "Information architecture",
  "Intelligence coherence",
  "Claim → evidence mapping",
  "Score + recommendations",
];

const dimensions = [
  { label: "Intelligence coherence", score: 82, weight: "20%", accent: "red", icon: Fingerprint, note: "The site has a clear center of gravity, but evidence trails are thin." },
  { label: "Semantic correctness", score: 76, weight: "15%", accent: "blue", icon: Sparkles, note: "Vocabulary is mostly consistent; several claims remain underspecified." },
  { label: "Architecture consistency", score: 71, weight: "15%", accent: "blue", icon: Network, note: "Primary offerings map cleanly, while research is disconnected." },
  { label: "Information architecture", score: 78, weight: "10%", accent: "sage", icon: GitBranch, note: "Navigation is discoverable with a few deep or orphaned paths." },
  { label: "Content correctness", score: 69, weight: "10%", accent: "amber", icon: FileSearch, note: "Good fundamentals, but metadata and page completeness need work." },
  { label: "UX / interaction", score: 84, weight: "10%", accent: "sage", icon: GaugeIcon, note: "Clear paths and responsive interactions across key journeys." },
  { label: "Accessibility + technical", score: 73, weight: "10%", accent: "amber", icon: ShieldCheck, note: "Several image, heading, and form-label issues were detected." },
  { label: "Trust / conversion", score: 80, weight: "10%", accent: "sage", icon: Link2, note: "Value proposition is clear; proof and contact cues can be stronger." },
];

const findings: Finding[] = [
  { severity: "critical", title: "Evidence path breaks at the outcome layer", detail: "The site makes a capability claim but does not connect it to a measurable outcome, case study, or research source.", evidence: "“AI-powered systems for enterprise transformation” appears on /capabilities, with no linked proof artifact.", page: "/capabilities" },
  { severity: "high", title: "Two pages use competing vocabulary", detail: "The primary navigation calls the offer “Solutions”; page copy calls the same offer “Services”.", evidence: "4 occurrences of “Solutions” vs 7 occurrences of “Services” across 6 strategic pages.", page: "/solutions" },
  { severity: "high", title: "Heading hierarchy skips a level", detail: "The research landing page moves from H1 directly to H3, weakening the document outline for assistive technology.", evidence: "H1 → H3 at DOM path main > section:nth-child(2) > article:nth-child(1).", page: "/research" },
  { severity: "medium", title: "Three images lack alternative text", detail: "Decorative and informative images are not consistently distinguished in the rendered DOM.", evidence: "3 img elements without alt attributes across the homepage and about page.", page: "/" },
];

function scoreLabel(score: number) {
  if (score >= 90) return "Intelligence-grade";
  if (score >= 80) return "Strong";
  if (score >= 70) return "Good / needs refinement";
  if (score >= 60) return "Communication debt";
  if (score >= 50) return "Significant quality debt";
  return "Critical";
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function Gauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 76;
  const dash = circumference * (score / 100);
  return (
    <div className="gauge-wrap" aria-label={`Overall score ${score.toFixed(1)} out of 100`}>
      <svg viewBox="0 0 180 180" className="gauge-svg" role="img">
        <circle cx="90" cy="90" r="76" fill="none" stroke="#e5ded2" strokeWidth="9" />
        <circle cx="90" cy="90" r="76" fill="none" stroke="#e24b3b" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`} transform="rotate(-90 90 90)" />
      </svg>
      <div className="gauge-value"><strong>{score.toFixed(1)}</strong><span>{scoreLabel(score)}</span></div>
    </div>
  );
}

function StatusDot({ tone = "sage" }: { tone?: "sage" | "red" | "amber" | "blue" }) {
  return <span className={`status-dot ${tone}`} aria-hidden="true" />;
}

export default function Home() {
  const [url, setUrl] = useState("https://example.com");
  const [auditState, setAuditState] = useState<AuditState>("idle");
  const [progress, setProgress] = useState(0);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "findings" | "graph">("overview");
  const normalized = useMemo(() => normalizeUrl(url), [url]);
  const overall = 76.8;

  function runAudit() {
    if (!normalized) return;
    setAuditState("running");
    setProgress(0);
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      setProgress(Math.min(100, Math.round((step / pipeline.length) * 100)));
      if (step >= pipeline.length) {
        window.clearInterval(timer);
        window.setTimeout(() => setAuditState("complete"), 240);
      }
    }, 115);
  }

  const isIdle = auditState === "idle";
  const isRunning = auditState === "running";

  return (
    <div className="app-shell">
      <aside className="method-rail">
        <div className="rail-brand">
          <div className="brand-mark"><span /> <span /> <span /></div>
          <div><div className="eyebrow">Matrix / 01</div><strong>Website<br />Intelligence<br />Auditor</strong></div>
        </div>
        <div className="rail-rule" />
        <div className="rail-method-label"><span>Method</span><span>{isIdle ? "Ready" : isRunning ? `${progress}%` : "Complete"}</span></div>
        <ol className="pipeline-list">
          {pipeline.map((step, index) => {
            const active = isRunning && index === Math.min(pipeline.length - 1, Math.floor(progress / (100 / pipeline.length)));
            const done = !isIdle && (isRunning ? index < Math.floor(progress / (100 / pipeline.length)) : true);
            return <li key={step} className={active ? "active" : done ? "done" : ""}><span className="pipeline-index">{String(index + 1).padStart(2, "0")}</span><span>{step}</span>{done && <Check size={13} />}</li>;
          })}
        </ol>
        <div className="rail-footer"><div className="eyebrow">Public web only</div><p>Robots.txt and crawl restrictions are respected.</p><div className="rail-version">MATRIX ENGINE <span>v0.9.4</span></div></div>
      </aside>

      <main className="workspace">
        <header className="topbar"><div className="topbar-path"><span>Auditor</span><span>/</span><strong>{isIdle ? "New audit" : normalized?.replace(/^https?:\/\//, "")}</strong></div><div className="topbar-actions"><button className="icon-btn" title="Documentation"><Info size={16} /></button><button className="icon-btn" title="Refresh"><RefreshCw size={16} /></button><div className="status-pill"><StatusDot tone={auditState === "complete" ? "sage" : "red"} />{isIdle ? "Workspace ready" : isRunning ? "Analysis in progress" : "Audit complete"}</div></div></header>

        {isIdle ? (
          <section className="landing-view">
            <div className="landing-copy"><div className="section-kicker"><span className="section-number">01</span><span>Website intelligence / audit console</span></div><h1>Measure the signal<br /><em>behind the surface.</em></h1><p className="landing-intro">Does your website merely work — or does it correctly express what your organization is?</p><p className="landing-sub">Analyze technical quality, accessibility, content correctness, information architecture, semantic coherence, and intelligence architecture in one audit.</p><div className="url-form"><label htmlFor="url">Public website URL</label><div className="input-row"><Globe2 size={18} /><input id="url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAudit()} placeholder="https://your-website.com" /><button className="primary-btn" onClick={runAudit} disabled={!normalized}><span>Analyze website</span><ArrowUpRight size={18} /></button></div>{url && !normalized && <div className="input-error"><X size={14} /> Enter a valid public URL to begin.</div>}<div className="form-meta"><span><Clock3 size={13} /> Typical analysis: 30–120 seconds</span><span><ShieldCheck size={13} /> Public websites only</span></div><div className="proof-cues"><span><span className="proof-number">01</span> Claims → evidence</span><span><span className="proof-number">02</span> DOM → meaning</span><span><span className="proof-number">03</span> Structure → outcome</span></div></div><div className="example-row"><span>Try an example</span><button onClick={() => setUrl("https://linear.app")}>linear.app</button><button onClick={() => setUrl("https://stripe.com")}>stripe.com</button><button onClick={() => setUrl("https://example.com")}>example.com</button></div></div>
            <div className="landing-visual"><div className="visual-label"><span>Intelligence graph / preview</span><span>01—04</span></div><div className="graph-card"><img src="/manus-storage/matrix-intelligence-graph_ffc5f9b4.png" alt="Abstract intelligence graph" /><div className="graph-overlay"><div className="graph-node node-a">MISSION<span>central thesis</span></div><div className="graph-node node-b">CAPABILITY<span>what it can do</span></div><div className="graph-node node-c">OUTCOME<span>proof / signal</span></div><div className="graph-line line-1" /><div className="graph-line line-2" /></div></div><div className="visual-caption"><span className="caption-mark">↳</span><p>The audit maps relationships among mission, capabilities, products, research, and outcomes — not just isolated page errors.</p></div></div>
          </section>
        ) : isRunning ? (
          <section className="running-view"><div className="section-kicker"><span className="section-number">02</span><span>Live analysis / {normalized?.replace(/^https?:\/\//, "")}</span></div><div className="running-center"><div className="scan-orbit"><div className="orbit-dot" /><Search size={30} /></div><div className="running-percent">{progress}<small>%</small></div><h2>Reading the website as a system.</h2><p>Collecting evidence across structure, meaning, and relationships. This console will resolve when the final score is defensible.</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="running-current"><span>Current signal</span><strong>{pipeline[Math.min(pipeline.length - 1, Math.floor(progress / (100 / pipeline.length)))]}</strong></div></div></section>
        ) : (
          <section className="results-view"><div className="results-header"><div><div className="section-kicker"><span className="section-number">03</span><span>Audit dossier / {normalized?.replace(/^https?:\/\//, "")}</span></div><h1>Website intelligence<br /><em>quality score.</em></h1></div><button className="secondary-btn" onClick={() => setAuditState("idle")}><RefreshCw size={15} /> New audit</button></div><div className="audit-meta-row"><div><span>Audited URL</span><strong>{normalized}</strong></div><div><span>Crawl scope</span><strong>20 pages / same domain</strong></div><div><span>Completed</span><strong>Just now · 1m 08s</strong></div><div><span>Engine</span><strong>Matrix v0.9.4</strong></div></div><div className="tabs"><button className={activeTab === "overview" ? "selected" : ""} onClick={() => setActiveTab("overview")}>Overview</button><button className={activeTab === "findings" ? "selected" : ""} onClick={() => setActiveTab("findings")}>Findings <b>12</b></button><button className={activeTab === "graph" ? "selected" : ""} onClick={() => setActiveTab("graph")}>Intelligence graph</button></div>{activeTab === "overview" && <><div className="score-band"><div className="score-intro"><span className="eyebrow">Overall website intelligence quality</span><h2>Strong, with<br /><em>evidence debt.</em></h2><p>The website works and communicates a credible point of view. Its weakest signal is not technical correctness — it is the missing connective tissue between claims, capabilities, and outcomes.</p><div className="score-legend"><span><StatusDot tone="sage" /> Strong: 80–89</span><span><StatusDot tone="amber" /> Refinement zone: 60–79</span></div></div><Gauge score={overall} /><div className="band-aside"><span className="eyebrow">Confidence</span><strong>High</strong><p>Based on 14 of 20 pages rendered successfully.</p><div className="mini-rule" /><span className="eyebrow">Primary diagnosis</span><strong>Communication debt</strong><p>Make the evidence path visible.</p></div></div><div className="dimensions-heading"><span className="eyebrow">Score dimensions</span><span>Weighted model / 100 points</span></div><div className="dimension-list">{dimensions.map((dimension, index) => { const Icon = dimension.icon; return <div className="dimension-row" key={dimension.label}><div className="dimension-index">0{index + 1}</div><Icon size={18} className={`dimension-icon ${dimension.accent}`} /><div className="dimension-name"><strong>{dimension.label}</strong><span>{dimension.note}</span></div><div className="dimension-weight">{dimension.weight}</div><div className="dimension-bar"><span className={dimension.accent} style={{ width: `${dimension.score}%` }} /></div><div className="dimension-score">{dimension.score}</div><ChevronDown size={16} /></div>})}</div></>}{activeTab === "findings" && <div className="findings-layout"><div className="findings-list"><div className="findings-summary"><span className="eyebrow">Priority findings</span><strong>4 findings require attention</strong><p>Evidence is attached to every finding. Unsupported claims are reported as “evidence not found,” never as false.</p></div>{findings.map((finding) => <button className={`finding-row ${finding.severity}`} key={finding.title} onClick={() => setSelectedFinding(finding)}><div className="finding-severity"><StatusDot tone={finding.severity === "critical" ? "red" : finding.severity === "high" ? "amber" : "blue"} /><span>{finding.severity}</span></div><div><strong>{finding.title}</strong><p>{finding.detail}</p></div><ArrowUpRight size={16} /></button>)}</div><div className="recommendations"><span className="eyebrow">Recommended next moves</span><div className="recommendation-card"><span>01</span><div><strong>Build the claim → evidence trail</strong><p>Connect capability pages to research, case studies, or measured outcomes.</p></div><ArrowUpRight size={16} /></div><div className="recommendation-card"><span>02</span><div><strong>Normalize the offer vocabulary</strong><p>Choose either “Solutions” or “Services” and use it consistently in navigation and copy.</p></div><ArrowUpRight size={16} /></div><div className="recommendation-card"><span>03</span><div><strong>Repair the document outline</strong><p>Restore a sequential heading hierarchy on the research landing page.</p></div><ArrowUpRight size={16} /></div></div></div>}{activeTab === "graph" && <div className="graph-results"><div className="graph-results-copy"><span className="eyebrow">Inferred information model</span><h2>A coherent center.<br /><em>Loose edges.</em></h2><p>The graph engine found a strong relationship between the organization, its capabilities, and its primary offer. Research and outcomes are present, but they do not yet form a traceable path.</p><div className="graph-stat"><strong>0.72</strong><span>relationship clarity index</span></div></div><div className="graph-map"><div className="map-node center">ORGANIZATION<span>dominant thesis</span></div><div className="map-node top">MISSION<span>why it exists</span></div><div className="map-node left">CAPABILITIES<span>what it can do</span></div><div className="map-node right">PRODUCTS<span>what it offers</span></div><div className="map-node bottom muted">OUTCOMES<span>evidence not found</span></div><div className="map-connector c-top" /><div className="map-connector c-left" /><div className="map-connector c-right" /><div className="map-connector c-bottom broken" /></div></div>}</section>
        )}
      </main>
      {selectedFinding && <div className="drawer-backdrop" onClick={() => setSelectedFinding(null)}><aside className="finding-drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">Finding / evidence trace</span><h2>{selectedFinding.title}</h2></div><button className="icon-btn" onClick={() => setSelectedFinding(null)}><X size={18} /></button></div><div className={`drawer-severity ${selectedFinding.severity}`}><TriangleAlert size={16} /> {selectedFinding.severity} priority</div><p className="drawer-detail">{selectedFinding.detail}</p><div className="evidence-box"><span className="eyebrow">Observed evidence</span><p>{selectedFinding.evidence}</p><a href={`https://${normalized?.replace(/^https?:\/\//, "")}${selectedFinding.page}`} target="_blank" rel="noreferrer">Open {selectedFinding.page}<ExternalLink size={14} /></a></div><div className="drawer-section"><span className="eyebrow">Why it matters</span><p>Quality is not only a pass/fail property. This signal affects the coherence of the website’s conceptual model and reduces the visitor’s ability to follow a clear path from promise to proof.</p></div><div className="drawer-section"><span className="eyebrow">Recommended action</span><p>Give this claim a visible evidence path. Link to the most specific supporting page and name the outcome, not only the capability.</p></div></aside></div>}
    </div>
  );
}
