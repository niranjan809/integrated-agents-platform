import { useState } from "react";
import { api } from "../../pages/creator-radar/api";
import { CategoryChip, GenuinenessChip } from "./chips";

const CATEGORIES = [
  "AI Educator", "AI Tool Reviewer", "AI News/Aggregator", "AI Business/B2B",
  "AI Trend/Viral", "AI Promoter", "Hybrid Creator+Promoter",
];
const GENUINENESS = ["Genuine", "Low-effort", "Uncertain"];

// The three visible pipeline steps and the backend stage that COMPLETES each.
// 'fetching' active → completes when 'gating' arrives, etc.
const STEPS = [
  { key: "fetch", label: "Fetching profile", startStage: "fetching" },
  { key: "gate", label: "Running AI-relevance gate", startStage: "gating" },
  { key: "classify", label: "Classifying", startStage: "classifying" },
];

function StepRow({ label, state }) {
  const icon = state === "done" ? "✓" : state === "active" ? "⋯" : "☐";
  const color = state === "done" ? "u-text-emerald-600" : state === "active" ? "u-text-slate-900" : "u-text-slate-300";
  return (
    <div className={`u-flex u-items-center u-gap-3 u-text-sm ${color}`}>
      <span className="u-w-4 u-text-center">{icon}</span>
      <span className={state === "active" ? "u-font-medium" : ""}>{label}</span>
    </div>
  );
}

export default function AddAccountModal({ onClose, onAdded }) {
  const [platform, setPlatform] = useState("instagram");
  const [handle, setHandle] = useState("");
  const [reason, setReason] = useState("");
  const [expectedCategory, setExpectedCategory] = useState("");
  const [expectedGenuineness, setExpectedGenuineness] = useState("");

  const [phase, setPhase] = useState("form"); // form | progress | success | error
  const [stage, setStage] = useState(null); // latest backend stage
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [validationErr, setValidationErr] = useState("");

  const cleanHandle = handle.replace(/^@/, "").trim();

  function stepState(step) {
    const order = ["fetching", "inserting", "gating", "classifying", "done"];
    const cur = order.indexOf(stage);
    const start = order.indexOf(step.startStage);
    if (stage === "done") return "done";
    if (cur > start) return "done";
    if (cur === start) return "active";
    // 'inserting' happens between fetch and gate — keep fetch shown as done during it.
    if (step.key === "fetch" && cur >= order.indexOf("inserting")) return "done";
    return "pending";
  }

  async function submit() {
    if (!cleanHandle) return setValidationErr("Handle is required.");
    if (reason.trim().length < 10) return setValidationErr("Reason must be at least 10 characters (it's logged to the audit trail).");
    setValidationErr("");
    setPhase("progress");
    setStage("fetching");
    try {
      await api.postStream(
        "/api/accounts",
        {
          handle: cleanHandle,
          platform,
          reason: reason.trim(),
          expected_category: expectedCategory || null,
          expected_genuineness: expectedGenuineness || null,
        },
        (msg) => {
          if (msg.stage === "error") {
            setErrMsg(errorText(msg));
            setPhase("error");
          } else if (msg.stage === "done") {
            setResult(msg);
            setStage("done");
            setPhase("success");
          } else {
            setStage(msg.stage);
          }
        }
      );
    } catch (e) {
      // Pre-stream error (validation / duplicate / budget / auth).
      setErrMsg(preStreamErrorText(e));
      setPhase("error");
    }
  }

  function retry() {
    setPhase("form");
    setStage(null);
    setResult(null);
    setErrMsg("");
  }

  const gatePass = result?.gate?.primarily_ai_content;

  return (
    <div className="u-fixed u-inset-0 u-z-60 u-flex u-items-center u-justify-center u-bg-slate-900-40 u-p-4">
      {/* Backdrop intentionally does NOT close (avoid accidental dismissal mid-add). */}
      <div className="u-w-full u-max-w-lg u-overflow-hidden u-rounded-xl u-bg-white u-shadow-2xl">
        <div className="u-flex u-items-center u-justify-between u-border-b u-border-slate-200 u-px-5 u-py-3">
          <h3 className="u-font-semibold u-text-slate-900">Add account</h3>
          {phase !== "progress" && (
            <button onClick={onClose} aria-label="Close" className="u-rounded-md u-p-1 u-text-slate-400 u-hover-bg-slate-100 u-hover-text-slate-700">✕</button>
          )}
        </div>

        {/* FORM */}
        {phase === "form" && (
          <div className="u-space-y-4 u-px-5 u-py-4">
            <div>
              <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Platform</label>
              <div className="u-flex u-gap-4 u-text-sm">
                {["instagram", "tiktok"].map((p) => (
                  <label key={p} className="u-flex u-items-center u-gap-1_5">
                    <input type="radio" checked={platform === p} onChange={() => setPlatform(p)} /> {p}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Handle</label>
              <input
                type="text" value={handle} onChange={(e) => setHandle(e.target.value)}
                placeholder="e.g. simonwilloughby"
                className="u-w-full u-rounded-md u-border u-border-slate-300 u-px-3 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500"
              />
            </div>

            <div>
              <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Reason <span className="u-text-red-500">*</span></label>
              <textarea
                rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you adding this account? This will be logged in the audit trail."
                className="u-w-full u-resize-none u-rounded-md u-border u-border-slate-300 u-px-3 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500"
              />
            </div>

            <div className="u-grid u-grid-cols-2 u-gap-3">
              <div>
                <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Expected category</label>
                <select value={expectedCategory} onChange={(e) => setExpectedCategory(e.target.value)}
                  className="u-w-full u-rounded-md u-border u-border-slate-300 u-px-2 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500">
                  <option value="">Skip</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Expected genuineness</label>
                <select value={expectedGenuineness} onChange={(e) => setExpectedGenuineness(e.target.value)}
                  className="u-w-full u-rounded-md u-border u-border-slate-300 u-px-2 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500">
                  <option value="">Skip</option>
                  {GENUINENESS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            {validationErr && <div className="u-rounded-md u-bg-red-50 u-px-3 u-py-2 u-text-sm u-text-red-700">{validationErr}</div>}

            <div className="u-flex u-justify-end u-gap-2 u-border-t u-border-slate-100 u-pt-4">
              <button onClick={onClose} className="u-rounded-md u-border u-border-slate-300 u-px-4 u-py-2 u-text-sm u-hover-bg-slate-50">Cancel</button>
              <button onClick={submit} className="u-rounded-md u-bg-slate-900 u-px-4 u-py-2 u-text-sm u-font-medium u-text-white u-hover-bg-slate-700">Add account</button>
            </div>
          </div>
        )}

        {/* PROGRESS */}
        {phase === "progress" && (
          <div className="u-space-y-4 u-px-5 u-py-6">
            <p className="u-text-sm u-text-slate-500">Adding @{cleanHandle}… please don&apos;t close this window.</p>
            <div className="u-space-y-3">
              {STEPS.map((s) => <StepRow key={s.key} label={s.label} state={stepState(s)} />)}
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {phase === "success" && result && (
          <div className="u-space-y-4 u-px-5 u-py-5">
            <div className="u-flex u-items-center u-gap-2 u-text-emerald-600">
              <span className="u-flex u-h-6 u-w-6 u-items-center u-justify-center u-rounded-full u-bg-emerald-100 u-text-sm">✓</span>
              <span className="u-font-medium">Account added successfully</span>
            </div>

            <div className="u-rounded-lg u-border u-border-slate-200 u-bg-slate-50 u-p-4 u-text-sm">
              <div className="u-flex u-items-center u-justify-between">
                <span className="u-font-medium u-text-slate-900">@{result.account.handle}</span>
                <span className="u-tabular-nums u-text-slate-500">{Number(result.account.follower_count ?? 0).toLocaleString("en-US")} followers</span>
              </div>
              <div className="u-mt-3 u-flex u-flex-wrap u-items-center u-gap-2">
                <CategoryChip value={result.classification?.category} />
                <GenuinenessChip value={result.classification?.genuineness} />
                <span className={`u-rounded-full u-px-2 u-py-0_5 u-text-xs u-font-medium ${gatePass ? "u-bg-emerald-50 u-text-emerald-700" : "u-bg-red-50 u-text-red-700"}`}>
                  Gate: {gatePass ? "✓ Pass" : "✗ Failed"}
                </span>
              </div>
            </div>

            {!gatePass && (
              <div className="u-rounded-md u-border-l-4 u-border-amber-400 u-bg-amber-50 u-p-3 u-text-sm u-text-amber-900">
                <div className="u-font-semibold u-text-amber-800">Gate rejected this account.</div>
                <p className="u-mt-1 u-text-xs">Category set to Uncategorized. Consider whether to keep it in the catalog.</p>
                {result.gate?.reasoning && <p className="u-mt-2 u-text-xs u-leading-relaxed">{result.gate.reasoning}</p>}
              </div>
            )}

            <div className="u-flex u-justify-end u-border-t u-border-slate-100 u-pt-4">
              <button onClick={() => { onAdded?.(); onClose(); }} className="u-rounded-md u-bg-slate-900 u-px-4 u-py-2 u-text-sm u-font-medium u-text-white u-hover-bg-slate-700">Done</button>
            </div>
          </div>
        )}

        {/* ERROR */}
        {phase === "error" && (
          <div className="u-space-y-4 u-px-5 u-py-5">
            <div className="u-flex u-items-center u-gap-2 u-text-red-600">
              <span className="u-flex u-h-6 u-w-6 u-items-center u-justify-center u-rounded-full u-bg-red-100 u-text-sm">✕</span>
              <span className="u-font-medium">Couldn&apos;t add account</span>
            </div>
            <div className="u-rounded-md u-bg-red-50 u-px-3 u-py-2 u-text-sm u-text-red-700">{errMsg}</div>
            <div className="u-flex u-justify-end u-gap-2 u-border-t u-border-slate-100 u-pt-4">
              <button onClick={onClose} className="u-rounded-md u-border u-border-slate-300 u-px-4 u-py-2 u-text-sm u-hover-bg-slate-50">Cancel</button>
              <button onClick={retry} className="u-rounded-md u-bg-slate-900 u-px-4 u-py-2 u-text-sm u-font-medium u-text-white u-hover-bg-slate-700">Try again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Maps a mid-stream {stage:'error'} message to friendly copy.
function errorText(msg) {
  if (msg.code === "fetch_failed") return "The provider couldn't find this handle (or it has no posts). Verify the spelling and try again.";
  return msg.message || "Something went wrong during the add.";
}

// Maps a pre-stream thrown error (err.body from api.postStream) to friendly copy.
function preStreamErrorText(e) {
  const code = e.body?.error;
  if (code === "duplicate") return "This account is already in the catalog.";
  if (code === "budget_exhausted") return "API budget exhausted — try again next cycle.";
  if (code === "invalid_handle") return "That handle isn't valid. Use letters, numbers, dots, and underscores only.";
  if (code === "missing_reason") return "A reason is required.";
  return e.message || "Request failed.";
}
