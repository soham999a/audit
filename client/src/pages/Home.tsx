import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { runAudit as runAuditEngine, type AuditResult, type AuditFinding, type AuditDimension } from "@/lib/auditEngine";
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
  Lock,
  Loader2,
  Crown,
  Network,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  LogOut,
  X,
} from "lucide-react";
import {
  baseInrLabel,
  createRazorpayCheckout,
  creditPackLabel,
  detectLocalCurrency,
  priceLabelFor,
  verifyAndUnlockPremium,
} from "@/lib/premium";
import {
  decrementCreditsClient,
  getIdToken,
  signInWithEmail,
  signInWithGoogle,
  signOutCurrentUser,
  signUpWithEmail,
  type UserCredits,
  watchAuth,
  watchUserCredits,
} from "@/lib/firebase";

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

const dimensionGuidance: Record<string, { decision: string; priority: string; action: string; rationale: string }> = {
  intelligence: { decision: "Protect the central thesis before adding more pages.", priority: "Strategic priority", action: "Create a claim-to-proof route for every core capability and outcome.", rationale: "Visitors should be able to move from what the organization believes, to what it can do, to evidence that the outcome is real." },
  semantic: { decision: "Standardize the vocabulary that names your offer.", priority: "Clarity priority", action: "Create a controlled terminology list and use it across navigation, headings, metadata, and CTAs.", rationale: "Consistent language reduces interpretation cost and makes claims easier to compare, search, and trust." },
  architecture: { decision: "Resolve competing relationships before polishing visual detail.", priority: "Structure priority", action: "Re-map the top journeys so each primary page has one parent, one purpose, and one next step.", rationale: "A clear information model helps users understand how capabilities, research, products, and outcomes relate." },
  ia: { decision: "Improve findability at the moments of highest intent.", priority: "Navigation priority", action: "Shorten deep paths, repair orphan pages, and add contextual links between related decisions.", rationale: "Discoverability is a compounding advantage: every repaired path improves both task completion and the evidence trail." },
  content: { decision: "Invest in completeness where claims carry commercial or reputational risk.", priority: "Content priority", action: "Rewrite the weakest pages around a clear promise, proof point, audience, and next action.", rationale: "Better prose alone is not enough; the page must answer the visitor’s decision questions without filler or ambiguity." },
  ux: { decision: "Remove friction from the next action, not from every interaction.", priority: "Experience priority", action: "Test the highest-value journey on desktop, tablet, and mobile, then remove hesitation points around CTAs and forms.", rationale: "A focused journey test converts the score into a measurable improvement rather than a broad redesign exercise." },
  technical: { decision: "Fix foundational access barriers before optimizing edge cases.", priority: "Technical priority", action: "Repair missing alternatives, heading order, form labels, landmarks, and responsive metadata in one remediation pass.", rationale: "Foundational HTML and accessibility signals affect every audience and are often cheaper to fix than downstream symptoms." },
  trust: { decision: "Make proof visible at the point of commitment.", priority: "Conversion priority", action: "Pair each major promise with specific evidence, transparent constraints, and a low-friction contact or trial path.", rationale: "Trust improves when visitors can verify the claim without leaving the decision context or guessing what happens next." },
};

function detailForDimension(dimension: AuditDimension | (typeof dimensions)[number]) {
  const computed = "metrics" in dimension;
  const guidance = dimensionGuidance[computed ? dimension.key : "content"];
  const metrics = computed ? dimension.metrics : [];
  const weakest = metrics.slice().sort((a, b) => a.value - b.value)[0];
  const threshold = dimension.score >= 80 ? "This is currently a strength to preserve." : dimension.score >= 60 ? "This is a refinement zone with visible upside." : "This is an immediate remediation area.";
  return { computed, guidance, metrics, weakest, threshold };
}

function PremiumGate({ hasAccess, onUnlock, price, children }: { hasAccess: boolean; onUnlock: () => void; price: string; children: ReactNode }) {
  if (hasAccess) return <>{children}</>;
  return (
    <div className="premium-gate">
      <div className="premium-gate-content" aria-hidden="true">{children}</div>
      <div className="premium-gate-overlay">
        <div className="premium-lock-card">
          <span className="eyebrow">Credit required</span>
          <strong>Unlock this content</strong>
          <p>Use a free monthly audit or purchase a credit pack to access this content.</p>
          <button className="premium-gate-btn" onClick={onUnlock}><Crown size={14} /> Get credits · {price}</button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("https://example.com");
  const [auditState, setAuditState] = useState<AuditState>("idle");
  const [progress, setProgress] = useState(0);
  const [selectedFinding, setSelectedFinding] = useState<(Finding | AuditFinding) | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "findings" | "graph">("overview");
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);
  const normalized = useMemo(() => normalizeUrl(url), [url]);
  const overall = auditResult?.overallScore ?? 0;
  const viewDimensions = auditResult?.dimensionScores ?? dimensions;
  const viewFindings = auditResult?.findings ?? findings;
  const [authUser, setAuthUser] = useState<{ uid: string; email: string | null; displayName: string | null } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;
  const [userCredits, setUserCredits] = useState<UserCredits>({ freeUsed: 0, freeRemaining: 2, paidCredits: 0, totalAuditsRun: 0 });
  const [payOpen, setPayOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [payStatus, setPayStatus] = useState<"idle" | "creating" | "waiting" | "verifying" | "error">("idle");
  const [payError, setPayError] = useState("");
  const [paymentLinkId, setPaymentLinkId] = useState<string | null>(null);
  const currency = useMemo(detectLocalCurrency, []);
  const priceLabel = useMemo(() => priceLabelFor(currency), [currency]);
  const convertedLabel = useMemo(() => baseInrLabel(currency), [currency]);

  function openUnlock() {
    if (authUser) {
      setPayOpen(true);
    } else {
      setAuthOpen(true);
    }
  }

  useEffect(() => {
    return watchAuth((user) => {
      setAuthUser(user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!authUser) {
      setUserCredits({ freeUsed: 0, freeRemaining: 2, paidCredits: 0, totalAuditsRun: 0 });
      return;
    }
    return watchUserCredits(authUser.uid, (credits) => {
      setUserCredits(credits);
    });
  }, [authUser?.uid]);

  const hasCredits = userCredits.freeRemaining > 0 || userCredits.paidCredits > 0;

  const freeKeys = useMemo(() => {
    const keyOf = (d: (typeof dimensions)[number] | AuditDimension) => ("key" in d ? d.key : d.label);
    const allKeys = viewDimensions.map(keyOf);
    if (hasCredits) return new Set(allKeys);
    const weightOf = (d: (typeof dimensions)[number] | AuditDimension) => (typeof d.weight === "number" ? d.weight : Number(String(d.weight).replace("%", "")) / 100);
    const ranked = viewDimensions.slice().sort((a, b) => b.score * weightOf(b) - a.score * weightOf(a));
    return new Set(ranked.slice(0, 2).map(keyOf));
  }, [hasCredits, viewDimensions]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("mx_payment_link_id");
      if (stored && /^pl_[A-Za-z0-9]+$/.test(stored)) setPaymentLinkId(stored);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("premium_payment") !== "1") return;
    const status = params.get("razorpay_payment_link_status");
    if (status === "paid") {
      const linkId = params.get("razorpay_payment_link_id");
      const cleanId = typeof linkId === "string" && /^pl_[A-Za-z0-9]+$/.test(linkId) ? linkId : undefined;
      if (authReady && authUserRef.current) {
        window.history.replaceState({}, "", window.location.pathname);
        void confirmPayment(cleanId);
      }
      return;
    }
    window.history.replaceState({}, "", window.location.pathname);
    if (status && status !== "partially_paid") {
      setPayOpen(true);
      setPayStatus("waiting");
      setPayError("The payment didn't complete. You can retry or verify below.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authUser]);

  async function confirmPayment(linkId?: string) {
    if (!authUserRef.current) {
      setAuthOpen(true);
      return;
    }
    const idToken = await getIdToken();
    if (!idToken) {
      setAuthOpen(true);
      return;
    }
    const targetId = linkId ?? paymentLinkId;
    if (!targetId) {
      setPayStatus("error");
      setPayError("No active payment was found for this account. Start a new payment to continue.");
      return;
    }
    setPayStatus("verifying");
    setPayError("");
    try {
      const paid = await verifyAndUnlockPremium(idToken, targetId);
      if (paid) {
        setPayOpen(false);
      } else {
        setPayStatus("waiting");
        setPayError("We couldn't confirm the payment yet. If you just paid, wait a few seconds and try again.");
      }
    } catch (error) {
      setPayStatus("error");
      setPayError(error instanceof Error ? error.message : "Verification failed. Please try again.");
    }
  }

  async function runAudit() {
    if (!normalized) return;
    if (!authUser) {
      setAuthOpen(true);
      return;
    }
    if (!hasCredits) {
      setPayOpen(true);
      return;
    }
    const idToken = await getIdToken();
    if (!idToken) {
      setAuthOpen(true);
      return;
    }
    setAuditState("running");
    setProgress(0);
    setAuditResult(null);
    const decrement = await decrementCreditsClient(idToken).catch(() => ({ ok: false, remaining: 0, type: "none" }));
    if (!decrement.ok) {
      setAuditState("idle");
      setPayStatus("error");
      setPayError("No credit was available to run this audit. If you just paid, verify your payment and try again.");
      setPayOpen(true);
      return;
    }
    const resultPromise = runAuditEngine(normalized);
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      setProgress(Math.min(100, Math.round((step / pipeline.length) * 100)));
      if (step >= pipeline.length) {
        window.clearInterval(timer);
        window.setTimeout(async () => {
          setAuditResult(await resultPromise);
          setAuditState("complete");
        }, 240);
      }
    }, 115);
  }

  async function startPayment() {
    if (!authUserRef.current) {
      setPayOpen(false);
      setAuthOpen(true);
      return;
    }
    const idToken = await getIdToken();
    if (!idToken) {
      setAuthOpen(true);
      return;
    }
    setPayStatus("creating");
    setPayError("");
    try {
      const result = await createRazorpayCheckout(idToken, currency);
      if (!result.ok || !result.short_url || !result.id) {
        throw new Error(result.error || "Could not create the payment link.");
      }
      setPaymentLinkId(result.id);
      try {
        sessionStorage.setItem("mx_payment_link_id", result.id);
      } catch {
        /* ignore */
      }
      setPayStatus("waiting");
      window.open(result.short_url, "_blank", "noopener");
    } catch (error) {
      setPayStatus("error");
      setPayError(error instanceof Error ? error.message : "Could not start payment. Please try again.");
    }
  }

  async function submitAuth(e: FormEvent) {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthError("Enter your email and password.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      if (authMode === "signup") {
        await signUpWithEmail(authEmail, authPassword);
      } else {
        await signInWithEmail(authEmail, authPassword);
      }
      setAuthOpen(false);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Authentication failed";
      setAuthError(raw.replace(/^Firebase:\s*(Error\s*\(\w+\/\w+\)\s*:\s*)?/i, ""));
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitGoogle() {
    setAuthBusy(true);
    setAuthError("");
    try {
      await signInWithGoogle();
      setAuthOpen(false);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Google sign-in failed";
      setAuthError(raw.replace(/^Firebase:\s*(Error\s*\(\w+\/\w+\)\s*:\s*)?/i, ""));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    await signOutCurrentUser();
  }

  const isIdle = auditState === "idle";
  const isRunning = auditState === "running";

  return (
    <div className="app-shell">
      <aside className="method-rail">
        <button className="rail-brand" onClick={() => { setAuditState("idle"); setAuditResult(null); setProgress(0); setSelectedFinding(null); setActiveTab("overview"); }} title="Go to homepage">
          <div className="brand-mark"><span /> <span /> <span /></div>
          <div><div className="eyebrow">Matrix / 01</div><strong><span className="brand-primary">Website Intelligence</span> <span className="flash-word">Auditor</span></strong></div>
        </button>
        <div className="rail-rule" />
        <div className="rail-method-label"><span>Method</span><span>{isIdle ? "Ready" : isRunning ? `${progress}%` : "Complete"}</span></div>
        <ol className="pipeline-list">
          {pipeline.map((step, index) => {
            const active = isRunning && index === Math.min(pipeline.length - 1, Math.floor(progress / (100 / pipeline.length)));
            const done = !isIdle && (isRunning ? index < Math.floor(progress / (100 / pipeline.length)) : true);
            return <li key={step} className={active ? "active" : done ? "done" : ""}><span className="pipeline-index">{String(index + 1).padStart(2, "0")}</span><span>{step}</span>{done && <Check size={13} />}</li>;
          })}
        </ol>
        <div className="rail-footer"><div className="eyebrow">Public web only</div><p>Robots.txt and crawl restrictions are respected.</p><div className="rail-version">MATRIX ENGINE <span>v1.0.0</span></div></div>
      </aside>

      <main className="workspace">
        <header className="topbar"><div className="topbar-path"><span>Auditor</span><span>/</span><strong>{isIdle ? "New audit" : normalized?.replace(/^https?:\/\//, "")}</strong></div><div className="topbar-actions">{authReady && (authUser ? (
        <div className="account-pill"><span className="account-email" title={authUser.email ?? authUser.uid}>{authUser.email ?? "Account"}</span>{userCredits.paidCredits > 0 && <span className="premium-badge"><Crown size={12} /> {userCredits.paidCredits} credits</span>}<button className="icon-btn" onClick={() => void handleSignOut()} title="Sign out" aria-label="Sign out"><LogOut size={14} /></button></div>
      ) : (
        <button className="secondary-btn" onClick={() => setAuthOpen(true)}>Sign in</button>
      ))}<button className="icon-btn" title="Documentation"><Info size={16} /></button><button className="icon-btn" title="Refresh"><RefreshCw size={16} /></button><div className={`status-pill ${auditState === "complete" ? "complete-status" : ""}`}><StatusDot tone={auditState === "complete" ? "sage" : "red"} />{isIdle ? "Workspace ready" : isRunning ? "Analysis in progress" : "COMPLETE"}</div></div></header>

        {isIdle ? (
          <section className="landing-view">
            <div className="landing-copy"><div className="section-kicker"><span className="section-number">01</span><span>Website intelligence / audit console</span></div><h1>Measure the signal<br /><em>behind the surface.</em></h1><p className="landing-intro">Does your website merely work — or does it correctly express what your organization is?</p><p className="landing-sub">Analyze technical quality, accessibility, content correctness, information architecture, semantic coherence, and intelligence architecture in one audit.</p><div className="url-form"><label htmlFor="url">Public website URL</label><div className="input-row"><Globe2 size={18} /><input id="url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAudit()} placeholder="https://your-website.com" /><button className="primary-btn" onClick={runAudit} disabled={!normalized}><span>Analyze website</span><ArrowUpRight size={18} /></button></div>{url && !normalized && <div className="input-error"><X size={14} /> Enter a valid public URL to begin.</div>}<div className="form-meta"><span><Clock3 size={13} /> Typical analysis: 30–120 seconds</span><span><ShieldCheck size={13} /> Public websites only</span>{authUser && <span><Crown size={13} /> {userCredits.freeRemaining > 0 ? `${userCredits.freeRemaining} free audit${userCredits.freeRemaining !== 1 ? "s" : ""} remaining` : userCredits.paidCredits > 0 ? `${userCredits.paidCredits} credit${userCredits.paidCredits !== 1 ? "s" : ""} remaining` : <button className="link-btn" onClick={() => setPayOpen(true)}>Buy credits</button>}</span>}</div><div className="proof-cues"><span><span className="proof-number">01</span> Claims → evidence</span><span><span className="proof-number">02</span> DOM → meaning</span><span><span className="proof-number">03</span> Structure → outcome</span></div></div><div className="example-row"><span>Try an example</span><button onClick={() => setUrl("https://linear.app")}>linear.app</button><button onClick={() => setUrl("https://stripe.com")}>stripe.com</button><button onClick={() => setUrl("https://example.com")}>example.com</button></div></div>
            <div className="landing-visual"><div className="visual-label"><span>Intelligence graph / preview</span><span>01—04</span></div><div className="graph-card"><img src="/manus-storage/matrix-intelligence-graph_ffc5f9b4.png" alt="Abstract intelligence graph" /><div className="graph-overlay"><div className="graph-node node-a">MISSION<span>central thesis</span></div><div className="graph-node node-b">CAPABILITY<span>what it can do</span></div><div className="graph-node node-c">OUTCOME<span>proof / signal</span></div><div className="graph-line line-1" /><div className="graph-line line-2" /></div></div><div className="visual-caption"><span className="caption-mark">↳</span><p>The audit maps relationships among mission, capabilities, products, research, and outcomes — not just isolated page errors.</p></div></div>
          </section>
        ) : isRunning ? (
          <section className="running-view"><div className="section-kicker"><span className="section-number">02</span><span>Live analysis / {normalized?.replace(/^https?:\/\//, "")}</span></div><div className="running-center"><div className="scan-orbit"><div className="orbit-dot" /><Search size={30} /></div><div className="running-percent">{progress}<small>%</small></div><h2>Reading the website as a system.</h2><p>Collecting evidence across structure, meaning, and relationships. This console will resolve when the final score is defensible.</p><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="running-current"><span>Current signal</span><strong>{pipeline[Math.min(pipeline.length - 1, Math.floor(progress / (100 / pipeline.length)))]}</strong></div></div></section>
        ) : (
          <section className="results-view"><div className="results-header"><div><div className="section-kicker"><span className="section-number">03</span><span>Audit dossier / {normalized?.replace(/^https?:\/\//, "")}</span></div><h1>Website intelligence<br /><em>quality score.</em></h1></div><button className="secondary-btn" onClick={() => setAuditState("idle")}><RefreshCw size={15} /> New audit</button></div><div className="audit-meta-row"><div><span>Audited URL</span><strong>{normalized}</strong></div><div><span>Crawl scope</span><strong>{auditResult?.pagesAnalyzed ?? 0} analyzed / {auditResult?.pagesRequested ?? 20} requested</strong></div><div><span>Coverage</span><strong>{auditResult?.crawlCoverage ?? 0}% · {auditResult?.crawlErrors ?? 0} errors</strong></div><div><span>Engine</span><strong>Matrix v1.0.0</strong></div></div><div className="tabs"><button className={activeTab === "overview" ? "selected" : ""} onClick={() => setActiveTab("overview")}>Overview</button><button className={activeTab === "findings" ? "selected" : ""} onClick={() => setActiveTab("findings")}>Findings <b>{viewFindings.length}</b></button><button className={activeTab === "graph" ? "selected" : ""} onClick={() => setActiveTab("graph")}>Intelligence graph</button></div>{activeTab === "overview" && <><div className="score-band"><div className="score-intro"><span className="eyebrow">Overall website intelligence quality</span><h2>{scoreLabel(overall)}, with<br /><em>{auditResult?.organizationalThesis ?? "site-specific signals"} signals.</em></h2><p>{auditResult ? `${auditResult.semanticEntities.length} entities and ${auditResult.semanticRelationships.length} relationships were extracted from the submitted URL. The weakest measured signal is ${auditResult.dimensionScores.slice().sort((a, b) => a.score - b.score)[0]?.label.toLowerCase()}.` : "The score will be calculated from collected website metrics after the audit completes."}</p><div className="score-legend"><span><StatusDot tone="sage" /> Strong: 80–89</span><span><StatusDot tone="amber" /> Refinement zone: 60–79</span></div></div><Gauge score={overall} /><div className="band-aside"><span className="eyebrow">Confidence</span><strong>{auditResult?.confidence ?? "Pending"}</strong><p>Derived from crawl coverage, render success, metric availability, and semantic coverage.</p><div className="mini-rule" /><span className="eyebrow">Primary diagnosis</span><strong>{auditResult?.findings[0]?.metric ?? "Awaiting metrics"}</strong><p>{auditResult?.findings[0]?.detail ?? "Run an audit to see the strongest measured signal."}</p></div></div><div className="grading-scale"><div><span className="eyebrow">Grading scale</span><strong>Interpret the signal</strong></div><div className="grading-items"><span><b>90–100</b> Intelligence-grade</span><span><b>80–89</b> Strong</span><span><b>70–79</b> Good but inconsistent</span><span><b>60–69</b> Communication debt</span><span><b>&lt;60</b> Architecture not successfully communicated</span></div></div>{auditResult && <div className="premium-strip"><Crown size={16} /><div><strong>{hasCredits ? `${userCredits.freeRemaining + userCredits.paidCredits} audit credit${userCredits.freeRemaining + userCredits.paidCredits !== 1 ? "s" : ""} remaining` : "This audit used your last credit"}</strong><p>Every audit costs one credit · 2 free per month · {userCredits.totalAuditsRun} audits run in total.</p></div>{!hasCredits && <button onClick={() => setPayOpen(true)}><Crown size={13} /> Buy {creditPackLabel()}</button>}</div>}<div className="dimensions-heading"><span className="eyebrow">Score dimensions</span><span>Weighted model / 100 points</span></div><div className="dimension-list">{viewDimensions.map((dimension, index) => { const Icon = "icon" in dimension ? dimension.icon : Fingerprint; const details = detailForDimension(dimension); const computedDimension = "metrics" in dimension ? dimension : null; const dimensionKey = computedDimension?.key ?? dimension.label; const note = "note" in dimension ? dimension.note : `${details.metrics.map((metric) => `${metric.label}: ${metric.value}`).join(" · ")} · ${computedDimension?.formula ?? "computed signal model"}`; const weight = typeof dimension.weight === "number" ? `${Math.round(dimension.weight * 100)}%` : dimension.weight; const totalMetricWeight = details.metrics.reduce((sum, metric) => sum + metric.weight, 0); const isExpanded = expandedDimension === dimensionKey;
    const isLocked = !hasCredits && !freeKeys.has(dimensionKey);
    const rowNote = isLocked ? "Locked — credits required. Use a free audit or buy credits." : note;
    return <div className={`dimension-block ${isExpanded ? "expanded" : ""}`} key={dimension.label}><button className="dimension-row" onClick={() => (isLocked ? openUnlock() : setExpandedDimension(isExpanded ? null : dimensionKey))} aria-expanded={isLocked ? false : isExpanded} aria-label={isLocked ? `Unlock ${dimension.label} — credits required` : undefined}><div className="dimension-index">0{index + 1}</div><Icon size={18} className={`dimension-icon ${dimension.accent}`} /><div className="dimension-name"><strong>{dimension.label}</strong><span>{rowNote}</span></div><div className="dimension-weight">{weight}</div><div className="dimension-bar"><span className={dimension.accent} style={{ width: `${dimension.score}%` }} /></div><div className={isLocked ? "dimension-score dimension-locked" : "dimension-score"}>{isLocked ? <Lock size={14} className="dimension-lock-icon" aria-hidden="true" /> : dimension.score}</div><ChevronDown className={isExpanded ? "rotated" : ""} size={16} /></button>{isExpanded && <div className="dimension-detail"><div className="detail-intent"><div><span className="eyebrow">Decision signal</span><strong>{details.guidance.decision}</strong><p>{details.guidance.rationale}</p></div><span className={`detail-priority ${dimension.score < 70 ? "urgent" : ""}`}>{details.guidance.priority}</span></div>{details.computed ? <><div className="detail-metrics">{details.metrics.map((metric) => { const contribution = dimension.score * (metric.weight / totalMetricWeight); return <div className="detail-metric" key={metric.label}><div><strong>{metric.label}</strong><span>{metric.passed} passed · {metric.failed} flagged</span></div><b>{metric.value.toFixed(1)}</b><div className="metric-track"><span style={{ width: `${metric.value}%` }} /></div><small>{metric.weight}% signal weight · {contribution.toFixed(1)} pts within dimension</small></div>})}</div><div className="detail-formula"><span className="eyebrow">How the score is built</span><code>{computedDimension!.formula}</code><span className="formula-contribution">{dimension.score.toFixed(1)} × {Math.round(computedDimension!.weight * 100)}% = <b>{computedDimension!.contribution.toFixed(1)} weighted points</b></span></div><div className="detail-action"><div><span className="eyebrow">Strategic recommendation</span><strong>{details.guidance.action}</strong><p>{details.threshold} Re-run after remediation to confirm the score moved because the underlying evidence improved.</p></div><ArrowUpRight size={18} /></div></> : <div className="detail-action"><div><span className="eyebrow">Strategic recommendation</span><strong>{details.guidance.action}</strong></div><ArrowUpRight size={18} /></div>}</div>}</div>})}</div><PremiumGate hasAccess={true} onUnlock={openUnlock} price={priceLabel}><div className="trace-grid"><div className="why-score"><span className="eyebrow">Why this score?</span><strong>Largest measured contributors</strong>{(auditResult?.whyScore ?? []).map((item) => <div className="why-row" key={item.label}><span className={item.sign === "+" ? "positive" : "negative"}>{item.sign}</span><span>{item.label}</span><b>{item.value}</b></div>)}</div><div className="audit-trace"><div className="trace-head"><span className="eyebrow">Developer-visible audit trace</span><span>{auditResult?.auditId}</span></div>{(auditResult?.trace ?? []).map((line) => <code key={line}>{line}</code>)}</div></div></PremiumGate></>}{activeTab === "findings" && <PremiumGate hasAccess={true} onUnlock={openUnlock} price={priceLabel}><div className="findings-layout"><div className="findings-list"><div className="findings-summary"><span className="eyebrow">Priority findings</span><strong>{viewFindings.length} findings require attention</strong><p>Evidence is attached to every finding. Unsupported claims are reported as “evidence not found,” never as false.</p></div>{viewFindings.map((finding) => <button className={`finding-row ${finding.severity}`} key={finding.title} onClick={() => setSelectedFinding(finding)}><div className="finding-severity"><StatusDot tone={finding.severity === "critical" ? "red" : finding.severity === "high" ? "amber" : "blue"} /><span>{finding.severity}</span></div><div><strong>{finding.title}</strong><p>{finding.detail}</p></div><ArrowUpRight size={16} /></button>)}</div><div className="recommendations"><span className="eyebrow">Recommended next moves</span>{(auditResult?.recommendations ?? []).map((recommendation, index) => <div className="recommendation-card" key={recommendation.title}><span>0{index + 1}</span><div><strong>{recommendation.title}</strong><p>{recommendation.detail} Expected impact: {recommendation.impact}.</p></div><ArrowUpRight size={16} /></div>)}</div></div></PremiumGate>}{activeTab === "graph" && <PremiumGate hasAccess={true} onUnlock={openUnlock} price={priceLabel}><div className="graph-results"><div className="graph-results-copy"><span className="eyebrow">Inferred information model</span><h2>{auditResult?.organizationalThesis ?? "Website"}.<br /><em>System graph.</em></h2><p>The graph engine inferred this information model from the submitted URL. Every node and relationship is derived from the completed audit result.</p><div className="graph-stat"><strong>{auditResult ? auditResult.graph.relationshipClarity.toFixed(2) : "—"}</strong><span>relationship clarity index</span><small>{auditResult ? "Weighted from architecture, linking, navigation, and discoverability signals." : "Calculated after the audit completes."}</small></div>{auditResult && <div className="graph-inputs"><span className="eyebrow">Index inputs</span>{auditResult.graph.relationshipInputs.map((input) => <div key={input.label}><span>{input.label}</span><b>{input.value.toFixed(1)} <small>{input.weight}%</small></b></div>)}</div>}</div><div className="graph-map"><div className="map-node center">{auditResult?.organizationalThesis?.toUpperCase()}<span>detected thesis</span></div>{(auditResult?.graph.nodes ?? []).map((node, index) => <div className={`map-node graph-node-${index} ${node.tone}`} key={node.label}>{node.label.toUpperCase()}<span>{node.sub}</span></div>)}{(auditResult?.semanticRelationships ?? []).slice(0, 5).map((_, index) => <div className={`map-connector c-${index}`} key={index} />)}</div></div></PremiumGate>}</section>
        )}
      </main>
      {selectedFinding && <div className="drawer-backdrop" onClick={() => setSelectedFinding(null)}><aside className="finding-drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">Finding / evidence trace</span><h2>{selectedFinding.title}</h2></div><button className="icon-btn" onClick={() => setSelectedFinding(null)}><X size={18} /></button></div><div className={`drawer-severity ${selectedFinding.severity}`}><TriangleAlert size={16} /> {selectedFinding.severity} priority</div><p className="drawer-detail">{selectedFinding.detail}</p><div className="evidence-box"><span className="eyebrow">Observed evidence</span><p>{selectedFinding.evidence}</p><a href={`https://${normalized?.replace(/^https?:\/\//, "")}${selectedFinding.page}`} target="_blank" rel="noreferrer">Open {selectedFinding.page}<ExternalLink size={14} /></a></div><div className="drawer-section"><span className="eyebrow">Why it matters</span><p>Quality is not only a pass/fail property. This signal affects the coherence of the website’s conceptual model and reduces the visitor’s ability to follow a clear path from promise to proof.</p></div><div className="drawer-section"><span className="eyebrow">Recommended action</span><p>Give this claim a visible evidence path. Link to the most specific supporting page and name the outcome, not only the capability.</p></div></aside></div>}
      {payOpen && (
        <div className="premium-backdrop" onClick={() => setPayOpen(false)} role="presentation">
          <aside className="premium-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="premium-title">
            <div className="premium-modal-head">
              <div className="premium-modal-title">
                <div className="premium-mark"><Crown size={19} /></div>
                <div>
                  <span className="eyebrow">{creditPackLabel()} / one-time purchase</span>
                  <h2 id="premium-title">Buy audit credits</h2>
                  <p>Razorpay-secured checkout · credits added to your account instantly.</p>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setPayOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="premium-price-row"><b>{priceLabel}</b><span>base {convertedLabel}</span></div>
            <ul className="premium-features">
              <li><Check size={14} /> <span>Get <b>{10} audit credits</b> for {priceLabel}</span></li>
              <li><Check size={14} /> <span>Each credit = <b>one full website audit</b></span></li>
              <li><Check size={14} /> <span>All 8 dimensions, findings, <b>intelligence graph</b></span></li>
              <li><Check size={14} /> <span>Credits <b>never expire</b> on your account</span></li>
            </ul>
            <button className="premium-primary-btn" onClick={startPayment} disabled={payStatus === "creating" || payStatus === "verifying"}>
              {payStatus === "creating" ? (<><Loader2 size={15} className="spin" /> Preparing checkout…</>) : (<><Crown size={15} /> Pay {priceLabel} for {creditPackLabel()}</>)}
            </button>
            <div className="premium-or">already paid?</div>
            <button className="premium-confirm-btn" onClick={() => void confirmPayment()} disabled={payStatus === "verifying" || payStatus === "creating"}>
              {payStatus === "verifying" ? (<><Loader2 size={13} className="spin" /> Verifying payment…</>) : (<>I've paid — verify my payment</>)}
            </button>
            {payError && (<div className="premium-error"><CircleAlert size={14} /> {payError}</div>)}
            <p className="premium-note">Credits are added to your account only after Razorpay confirms the payment. Returning from checkout verifies automatically; you can also press the button above.</p>
            <p className="premium-note">Payments are processed by Razorpay. Your {priceLabel} is converted from the ₹{49} base price for your region. You get 2 free audits per month.</p>
          </aside>
        </div>
      )}
      {authOpen && (
        <div className="premium-backdrop" onClick={() => setAuthOpen(false)} role="presentation">
          <aside className="premium-modal auth-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <div className="premium-modal-head">
              <div className="premium-modal-title">
                <div className="premium-mark"><ShieldCheck size={19} /></div>
                <div>
                  <span className="eyebrow">Matrix Account</span>
                  <h2 id="auth-title">{authMode === "signup" ? "Create your account" : "Welcome back"}</h2>
                  <p>Sign in to unlock premium audits on your account.</p>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setAuthOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <form className="auth-form" onSubmit={(e) => void submitAuth(e)}>
              <label className="auth-field"><span>Email</span><input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" required /></label>
              <label className="auth-field"><span>Password</span><input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required /></label>
              <button className="primary-btn auth-submit" type="submit" disabled={authBusy}>
                {authBusy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
                {authMode === "signup" ? "Create account" : "Sign in"}
              </button>
            </form>
            <div className="premium-or">or</div>
            <button className="premium-secondary-btn" onClick={() => void submitGoogle()} disabled={authBusy}>
              Continue with Google
            </button>
            <button className="auth-switch" onClick={() => { setAuthError(""); setAuthMode(authMode === "signin" ? "signup" : "signin"); }}>
              {authMode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
            {authError && <div className="premium-error"><CircleAlert size={14} /> {authError}</div>}
          </aside>
        </div>
      )}
    </div>
  );
}
