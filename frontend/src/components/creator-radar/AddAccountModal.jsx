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
  const color = state === "done" ? "text-emerald-600" : state === "active" ? "text-slate-900" : "text-slate-300";
  return (
    <div className={`flex items-center gap-3 text-sm ${color}`}>
      <span className="w-4 text-center">{icon}</span>
      <span className={state === "active" ? "font-medium" : ""}>{label}</span>
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4">
      {/* Backdrop intentionally does NOT close (avoid accidental dismissal mid-add). */}
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-900">Add account</h3>
          {phase !== "progress" && (
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
          )}
        </div>

        {/* FORM */}
        {phase === "form" && (
          <div className="space-y-4 px-5 py-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Platform</label>
              <div className="flex gap-4 text-sm">
                {["instagram", "tiktok"].map((p) => (
                  <label key={p} className="flex items-center gap-1.5">
                    <input type="radio" checked={platform === p} onChange={() => setPlatform(p)} /> {p}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Handle</label>
              <input
                type="text" value={handle} onChange={(e) => setHandle(e.target.value)}
                placeholder="e.g. simonwilloughby"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Reason <span className="text-red-500">*</span></label>
              <textarea
                rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you adding this account? This will be logged in the audit trail."
                className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Expected category</label>
                <select value={expectedCategory} onChange={(e) => setExpectedCategory(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-slate-500">
                  <option value="">Skip</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Expected genuineness</label>
                <select value={expectedGenuineness} onChange={(e) => setExpectedGenuineness(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-slate-500">
                  <option value="">Skip</option>
                  {GENUINENESS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            {validationErr && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{validationErr}</div>}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={submit} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Add account</button>
            </div>
          </div>
        )}

        {/* PROGRESS */}
        {phase === "progress" && (
          <div className="space-y-4 px-5 py-6">
            <p className="text-sm text-slate-500">Adding @{cleanHandle}… please don&apos;t close this window.</p>
            <div className="space-y-3">
              {STEPS.map((s) => <StepRow key={s.key} label={s.label} state={stepState(s)} />)}
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {phase === "success" && result && (
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-center gap-2 text-emerald-600">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-sm">✓</span>
              <span className="font-medium">Account added successfully</span>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">@{result.account.handle}</span>
                <span className="tabular-nums text-slate-500">{Number(result.account.follower_count ?? 0).toLocaleString("en-US")} followers</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <CategoryChip value={result.classification?.category} />
                <GenuinenessChip value={result.classification?.genuineness} />
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${gatePass ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  Gate: {gatePass ? "✓ Pass" : "✗ Failed"}
                </span>
              </div>
            </div>

            {!gatePass && (
              <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-semibold text-amber-800">Gate rejected this account.</div>
                <p className="mt-1 text-xs">Category set to Uncategorized. Consider whether to keep it in the catalog.</p>
                {result.gate?.reasoning && <p className="mt-2 text-xs leading-relaxed">{result.gate.reasoning}</p>}
              </div>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <button onClick={() => { onAdded?.(); onClose(); }} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Done</button>
            </div>
          </div>
        )}

        {/* ERROR */}
        {phase === "error" && (
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-center gap-2 text-red-600">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-sm">✕</span>
              <span className="font-medium">Couldn&apos;t add account</span>
            </div>
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errMsg}</div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">Cancel</button>
              <button onClick={retry} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Try again</button>
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
