import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, DomainCategory, Leaderboard, PromptConfig, getCached, invalidateCache } from "@/lib/api";
import { timeAgo, matchesDomain } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const COLOR_MAP: Record<string, { border: string; gradient: string; iconBg: string; accent: string }> = {
  purple:  { border: "border-purple-700/50 hover:border-purple-500/70",  gradient: "from-purple-900/40 to-purple-800/20",  iconBg: "bg-purple-900/60",  accent: "text-purple-400" },
  indigo:  { border: "border-indigo-700/50 hover:border-indigo-500/70",  gradient: "from-indigo-900/40 to-indigo-800/20",  iconBg: "bg-indigo-900/60",  accent: "text-indigo-400" },
  emerald: { border: "border-emerald-700/50 hover:border-emerald-500/70", gradient: "from-emerald-900/40 to-emerald-800/20", iconBg: "bg-emerald-900/60", accent: "text-emerald-400" },
  amber:   { border: "border-amber-700/50 hover:border-amber-500/70",   gradient: "from-amber-900/40 to-amber-800/20",   iconBg: "bg-amber-900/60",   accent: "text-amber-400" },
  rose:    { border: "border-rose-700/50 hover:border-rose-500/70",     gradient: "from-rose-900/40 to-rose-800/20",     iconBg: "bg-rose-900/60",    accent: "text-rose-400" },
  cyan:    { border: "border-cyan-700/50 hover:border-cyan-500/70",     gradient: "from-cyan-900/40 to-cyan-800/20",     iconBg: "bg-cyan-900/60",    accent: "text-cyan-400" },
  violet:  { border: "border-violet-700/50 hover:border-violet-500/70", gradient: "from-violet-900/40 to-violet-800/20", iconBg: "bg-violet-900/60",  accent: "text-violet-400" },
  orange:  { border: "border-orange-700/50 hover:border-orange-500/70", gradient: "from-orange-900/40 to-orange-800/20", iconBg: "bg-orange-900/60",  accent: "text-orange-400" },
  teal:    { border: "border-teal-700/50 hover:border-teal-500/70",     gradient: "from-teal-900/40 to-teal-800/20",     iconBg: "bg-teal-900/60",    accent: "text-teal-400" },
  sky:     { border: "border-sky-700/50 hover:border-sky-500/70",       gradient: "from-sky-900/40 to-sky-800/20",       iconBg: "bg-sky-900/60",     accent: "text-sky-400" },
  lime:    { border: "border-lime-700/50 hover:border-lime-500/70",     gradient: "from-lime-900/40 to-lime-800/20",     iconBg: "bg-lime-900/60",    accent: "text-lime-400" },
};
const COLORS = ["purple", "indigo", "emerald", "amber", "rose", "cyan", "violet", "orange", "teal", "sky", "lime"];

function colors(accent: string) { return COLOR_MAP[accent] ?? COLOR_MAP.indigo; }

const EMPTY_ADD = { name: "", icon: "📊", description: "", domain_tag: "", accent_color: "amber" };
const EMPTY_EDIT = { name: "", icon: "", description: "", include_domains: "", accent_color: "indigo" };

type Status = { total_leaderboards: number; active: number; pending_normalization: number; last_scan_errors: number };

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface ScanState {
  active: boolean;
  current_name: string | null;
  index: number;
  total: number;
  triggered_by: string | null;
}

function ScanStatusWidget() {
  const [scan, setScan] = useState<ScanState | null>(null);
  const lastActive = useRef<ScanState | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    async function poll() {
      try {
        const res = await fetch(`${BASE}/scan-status`);
        if (res.ok) {
          const data: ScanState = await res.json();
          if (data.active) lastActive.current = data;
          setScan(data);
        }
      } catch {}
    }
    poll();
    timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, []);

  if (!scan) return null;

  if (scan.active && scan.current_name) {
    const pct = scan.total > 1 ? Math.round((scan.index / scan.total) * 100) : 100;
    return (
      <div className="bg-indigo-950 border border-indigo-700 rounded-xl p-4 flex items-center gap-4">
        <svg className="animate-spin h-5 w-5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-indigo-300 text-sm font-semibold">
              {scan.triggered_by === "scheduler" ? "Auto-update running" : "Rescan running"}
            </span>
            {scan.total > 1 && (
              <span className="text-indigo-500 text-xs">{scan.index} / {scan.total}</span>
            )}
          </div>
          <p className="text-white font-medium text-sm truncate">{scan.current_name}</p>
          {scan.total > 1 && (
            <div className="mt-2 h-1.5 bg-indigo-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-400 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Idle — show last completed scan info if available
  if (lastActive.current) {
    const last = lastActive.current;
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-gray-500">
        <span className="text-green-500">✓</span>
        <span>
          Last scheduled update finished —{" "}
          <span className="text-gray-400">{last.total} leaderboard{last.total !== 1 ? "s" : ""} updated</span>
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-gray-500">
      <span className="text-gray-600">↻</span>
      <span>No active scan — auto-update runs every 14 days</span>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const { isAdmin, login } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [categories, setCategories] = useState<DomainCategory[]>(
    () => getCached<DomainCategory[]>("/domain-categories") ?? []
  );
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAddDomain, setShowAddDomain] = useState(false);
  const [catForm, setCatForm] = useState(EMPTY_ADD);
  const [savingCat, setSavingCat] = useState(false);

  const [editingCat, setEditingCat] = useState<DomainCategory | null>(null);
  const [editCatForm, setEditCatForm] = useState(EMPTY_EDIT);
  const [updatingCat, setUpdatingCat] = useState(false);

  const [deletingCat, setDeletingCat] = useState<number | null>(null);
  const [catError, setCatError] = useState<string | null>(null);
  const [catSuccess, setCatSuccess] = useState<string | null>(null);

  const [showErrorPanel, setShowErrorPanel] = useState(false);
  const [errorLbs, setErrorLbs] = useState<Leaderboard[]>([]);
  const [loadingErrors, setLoadingErrors] = useState(false);

  const [showPendingPanel, setShowPendingPanel] = useState(false);
  const [pendingLbs, setPendingLbs] = useState<Leaderboard[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const [uncategorized, setUncategorized] = useState<Leaderboard[]>([]);
  const [showUncategorized, setShowUncategorized] = useState(false);
  const [assigningLb, setAssigningLb] = useState<number | null>(null);

  const [showWorkflow, setShowWorkflow] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});
  const [savingPrompt, setSavingPrompt] = useState<string | null>(null);
  const [promptMsg, setPromptMsg] = useState<{ key: string; ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (isAdmin) { loadAll(); return; }
    const u = import.meta.env.VITE_ADMIN_USERNAME;
    const p = import.meta.env.VITE_ADMIN_PASSWORD;
    if (!u || !p) { setAuthError("Admin credentials not configured (VITE_ADMIN_USERNAME/VITE_ADMIN_PASSWORD)."); return; }
    login(u, p).catch((e: unknown) => setAuthError((e as Error).message || "Auto sign-in failed"));
  }, [isAdmin]);

  useEffect(() => {
    if (!showPrompts || prompts.length > 0) return;
    api.listPrompts().then((list) => {
      setPrompts(list);
      const init: Record<string, string> = {};
      list.forEach((p) => { init[p.key] = p.prompt_text; });
      setEditedPrompts(init);
    }).catch(() => {});
  }, [showPrompts]);

  async function loadAll() {
    setLoading(true);
    try {
      const [cats, s, lbs] = await Promise.all([api.listDomainCategories(), api.adminStatus(), api.listLeaderboards()]);
      setCategories(cats);
      setStatus(s);
      setUncategorized(lbs.filter((lb) => lb.domain && !cats.some((c) => matchesDomain(lb, c))));
    } catch {}
    finally { setLoading(false); }
  }

  async function softRefreshCats() {
    try {
      const [cats, s, lbs] = await Promise.all([api.listDomainCategories(), api.adminStatus(), api.listLeaderboards()]);
      setCategories(cats);
      setStatus(s);
      setUncategorized(lbs.filter((lb) => lb.domain && !cats.some((c) => matchesDomain(lb, c))));
    } catch {}
  }

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function handleAssignToCategory(lb: Leaderboard, catId: number) {
    const targetCat = categories.find((c) => c.id === catId);
    if (!targetCat) return;
    setAssigningLb(lb.id);
    setCatError(null);
    try {
      const newInclude = Array.from(new Set([...(targetCat.include_domains ?? []), lb.domain]));
      await api.adminUpdateDomainCategory(catId, { include_domains: newInclude });
      setCategories((prev) =>
        prev.map((c) => c.id === catId ? { ...c, include_domains: newInclude } : c)
      );
      invalidateCache(`/domain-categories/${targetCat.slug}`);
      setUncategorized((prev) => prev.filter((u) => u.id !== lb.id));
      setCatSuccess(`"${lb.name}" added to ${targetCat.icon} ${targetCat.name}.`);
    } catch (e: unknown) {
      setCatError((e as Error).message || "Assignment failed");
    } finally {
      setAssigningLb(null);
    }
  }

  async function handleSavePrompt(key: string) {
    setSavingPrompt(key);
    setPromptMsg(null);
    try {
      await api.updatePrompt(key, editedPrompts[key] ?? "");
      setPrompts((prev) => prev.map((p) => p.key === key ? { ...p, prompt_text: editedPrompts[key] } : p));
      setPromptMsg({ key, ok: true, text: "Saved." });
    } catch (e: unknown) {
      setPromptMsg({ key, ok: false, text: (e as Error).message || "Save failed" });
    } finally { setSavingPrompt(null); }
  }

  async function handleResetPrompt(key: string) {
    if (!confirm("Reset this prompt to the built-in default?")) return;
    setSavingPrompt(key);
    setPromptMsg(null);
    try {
      await api.resetPrompt(key);
      const fresh = await api.listPrompts();
      setPrompts(fresh);
      const updated: Record<string, string> = {};
      fresh.forEach((p) => { updated[p.key] = p.prompt_text; });
      setEditedPrompts(updated);
      setPromptMsg({ key, ok: true, text: "Reset to default." });
    } catch (e: unknown) {
      setPromptMsg({ key, ok: false, text: (e as Error).message || "Reset failed" });
    } finally { setSavingPrompt(null); }
  }

  async function toggleErrorPanel() {
    if (showErrorPanel) { setShowErrorPanel(false); return; }
    setShowErrorPanel(true);
    setLoadingErrors(true);
    try {
      const lbs = await api.listLeaderboards();
      setErrorLbs(lbs.filter((lb) => lb.last_scan_status === "error"));
    } catch {} finally { setLoadingErrors(false); }
  }

  async function togglePendingPanel() {
    if (showPendingPanel) { setShowPendingPanel(false); return; }
    setShowPendingPanel(true);
    setLoadingPending(true);
    try {
      const lbs = await api.listLeaderboards();
      setPendingLbs(lbs.filter((lb) => lb.status === "pending"));
    } catch {} finally { setLoadingPending(false); }
  }

  async function handleAddDomain(e: { preventDefault(): void }) {
    e.preventDefault();
    setSavingCat(true);
    setCatError(null);
    setCatSuccess(null);
    const slug = slugify(catForm.name);
    try {
      const newCat = await api.adminAddDomainCategory({
        slug,
        name: catForm.name,
        icon: catForm.icon || "📊",
        description: catForm.description,
        include_domains: catForm.domain_tag ? [catForm.domain_tag] : [],
        exclude_domains: [],
        accent_color: catForm.accent_color,
      });
      setCategories((prev) => [...prev, newCat]);
      setCatSuccess(`Domain "${catForm.name}" added.`);
      setCatForm(EMPTY_ADD);
      setShowAddDomain(false);
      softRefreshCats();
    } catch (e: unknown) {
      setCatError((e as Error).message || "Failed to add domain");
    } finally { setSavingCat(false); }
  }

  function startEditCat(cat: DomainCategory) {
    setEditingCat(cat);
    setEditCatForm({
      name: cat.name,
      icon: cat.icon,
      description: cat.description ?? "",
      include_domains: (cat.include_domains ?? []).join(", "),
      accent_color: cat.accent_color,
    });
    setShowAddDomain(false);
    setCatError(null);
    setCatSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleUpdateDomain(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!editingCat) return;
    setUpdatingCat(true);
    setCatError(null);
    const newInclude = Array.from(new Set(editCatForm.include_domains.split(",").map((s) => s.trim()).filter(Boolean)));
    try {
      await api.adminUpdateDomainCategory(editingCat.id, {
        name: editCatForm.name,
        icon: editCatForm.icon || "📊",
        description: editCatForm.description,
        include_domains: newInclude,
        accent_color: editCatForm.accent_color,
      });
      setCategories((prev) =>
        prev.map((c) => c.id === editingCat.id ? {
          ...c,
          name: editCatForm.name, icon: editCatForm.icon || "📊",
          description: editCatForm.description, include_domains: newInclude,
          accent_color: editCatForm.accent_color,
        } : c)
      );
      setCatSuccess(`Domain "${editCatForm.name}" updated.`);
      setEditingCat(null);
      softRefreshCats();
    } catch (e: unknown) {
      setCatError((e as Error).message || "Update failed");
    } finally { setUpdatingCat(false); }
  }

  async function handleDeleteDomain(cat: DomainCategory) {
    const msg = cat.is_builtin
      ? `"${cat.name}" is a built-in domain. Delete it anyway?\n\nLeaderboards inside it won't be deleted but will become uncategorized.`
      : `Delete domain "${cat.name}"?\n\nLeaderboards inside it won't be deleted, but they'll become uncategorized.`;
    if (!confirm(msg)) return;
    setDeletingCat(cat.id);
    if (editingCat?.id === cat.id) setEditingCat(null);
    setCatError(null);
    try {
      await api.adminDeleteDomainCategory(cat.id);
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setCatSuccess(`Deleted "${cat.name}".`);
      softRefreshCats();
    } catch (e: unknown) {
      setCatError((e as Error).message || "Delete failed");
    } finally { setDeletingCat(null); }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-sm mx-auto mt-20 text-center text-sm text-gray-500">
        {authError ? <p className="text-red-400">{authError}</p> : <p>Signing in…</p>}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <ScanStatusWidget />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">Manage domains and leaderboards.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowWorkflow((v) => !v); setShowPrompts(false); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${showWorkflow ? "bg-indigo-950 border-indigo-700 text-indigo-300" : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"}`}
          >
            ⚙ Pipeline
          </button>
          <button
            onClick={() => { setShowPrompts((v) => !v); setShowWorkflow(false); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${showPrompts ? "bg-violet-950 border-violet-700 text-violet-300" : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"}`}
          >
            📝 Prompts
          </button>
        </div>
      </div>

      {showWorkflow && (
        <div className="bg-gray-900 rounded-xl border border-indigo-900/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-indigo-900/30 flex items-center justify-between">
            <h2 className="font-semibold text-indigo-300 text-sm">⚙ System Pipeline</h2>
            <button onClick={() => setShowWorkflow(false)} className="text-gray-600 hover:text-gray-400 text-sm">✕</button>
          </div>
          <div className="px-5 py-4 space-y-4">
            {[
              { step: "1", color: "bg-indigo-900/40 border-indigo-800/60", title: "Add Leaderboard", desc: "Admin fills in name, URL, domain, and primary metrics. Backend inserts a row with status=pending and triggers normalisation.", detail: "POST /admin/leaderboards → Leaderboard row created" },
              { step: "2", color: "bg-violet-900/40 border-violet-800/60", title: "Normalizer (Gemini)", desc: "Fetches the official URL, extracts visible text, sends it to Gemini 2.5 Flash via OpenRouter. Gemini maps the text to structured fields: description, methodology, benchmark datasets, metrics, scope, domain, type, and a scraper note.", detail: "agent/normalizer.py → _call_gemini() → response_format: json_object" },
              { step: "3", color: "bg-emerald-900/40 border-emerald-800/60", title: "Scraper (on demand)", desc: "On user visit, data older than 14 days triggers a live scrape; otherwise the cached DB rows are returned instantly. Re-scan always forces a fresh fetch. Parsers used: Open ASR → HuggingFace dataset JSON API; SpeechColab → GitHub Pages HTML; GitHub-hosted leaderboards → README markdown table (regex); HuggingFace Spaces → Playwright render; all others → Playwright + BeautifulSoup generic table extractor.", detail: "agent/scraper.py → PARSER_MAP / _parse_github_readme / _parse_hf_space / _parse_generic" },
              { step: "4", color: "bg-amber-900/40 border-amber-800/60", title: "Post-Scan Enrichment (background)", desc: "After every successful scrape the HTTP response is sent immediately, then background tasks run: (a) Scraper note generated by Gemini if not yet set. (b) Scope classified by Gemini if not yet set — uses stored description text, no re-fetch. The detail page re-fetches metadata ~25 s after rescan to pick up enrichment results.", detail: "FastAPI BackgroundTasks → _enrich_leaderboard() → scraper_note + classify_scope()" },
              { step: "5", color: "bg-rose-900/40 border-rose-800/60", title: "Browser Cache", desc: "Frontend caches API responses in memory + localStorage (30-min TTL for leaderboard metadata, 60-min for rankings). Rescan invalidates the relevant keys so the next fetch is always fresh. Domain grid also refreshes after any rescan.", detail: "api.ts → req() with ttlMs → invalidateCache() on rescan/edit" },
            ].map(({ step, color, title, desc, detail }) => (
              <div key={step} className={`rounded-lg border ${color} p-4`}>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">{step}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-100 text-sm mb-1">{title}</p>
                    <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
                    <p className="mt-2 text-[11px] font-mono text-gray-600 bg-black/20 rounded px-2 py-1">{detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showPrompts && (
        <div className="bg-gray-900 rounded-xl border border-violet-900/50 overflow-hidden">
          <div className="px-5 py-3 border-b border-violet-900/30 flex items-center justify-between">
            <h2 className="font-semibold text-violet-300 text-sm">📝 Gemini Prompt Templates</h2>
            <button onClick={() => setShowPrompts(false)} className="text-gray-600 hover:text-gray-400 text-sm">✕</button>
          </div>
          {prompts.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">Loading prompts…</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {prompts.map((p) => (
                <div key={p.key} className="px-5 py-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-gray-100 text-sm">{p.label}</p>
                      {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                      {p.updated_at && <p className="text-[11px] text-gray-700 mt-0.5">Last saved: {new Date(p.updated_at + "Z").toLocaleString()}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleResetPrompt(p.key)} disabled={savingPrompt === p.key}
                        className="px-3 py-1.5 text-xs border border-gray-700 text-gray-500 rounded-lg hover:border-gray-500 hover:text-gray-300 disabled:opacity-40 transition-colors">
                        Reset
                      </button>
                      <button onClick={() => handleSavePrompt(p.key)} disabled={savingPrompt === p.key || editedPrompts[p.key] === p.prompt_text}
                        className="px-3 py-1.5 text-xs bg-violet-700 text-white rounded-lg hover:bg-violet-600 disabled:opacity-40 transition-colors">
                        {savingPrompt === p.key ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                  <textarea value={editedPrompts[p.key] ?? p.prompt_text}
                    onChange={(e) => setEditedPrompts((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    rows={6}
                    className="w-full bg-gray-950 border border-gray-800 text-gray-300 text-xs font-mono rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-violet-600 resize-y leading-relaxed"
                    spellCheck={false}
                  />
                  {promptMsg?.key === p.key && (
                    <p className={`text-xs ${promptMsg.ok ? "text-green-400" : "text-red-400"}`}>{promptMsg.text}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total",         value: status.total_leaderboards,   color: "text-indigo-400", activeBorder: "",                                  onClick: undefined },
            { label: "Active",        value: status.active,               color: "text-green-400",  activeBorder: "",                                  onClick: undefined },
            { label: "Pending Norm.", value: status.pending_normalization, color: "text-yellow-400", activeBorder: "border-yellow-700 bg-yellow-950/20", onClick: togglePendingPanel },
            { label: "Scan Errors",   value: status.last_scan_errors,     color: "text-red-400",    activeBorder: "border-red-700 bg-red-950/20",       onClick: toggleErrorPanel },
          ].map((s) => {
            const isActive = s.label === "Pending Norm." ? showPendingPanel : s.label === "Scan Errors" ? showErrorPanel : false;
            return s.onClick ? (
              <button key={s.label} onClick={s.onClick}
                className={`bg-gray-900 rounded-xl border p-3 text-center w-full transition-colors ${isActive ? s.activeBorder : "border-gray-800 hover:border-gray-600"}`}>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                {s.value > 0 && <p className={`text-[10px] mt-0.5 ${s.color} opacity-70`}>{isActive ? "▲ hide" : "▼ view"}</p>}
              </button>
            ) : (
              <div key={s.label} className="bg-gray-900 rounded-xl border border-gray-800 p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            );
          })}
        </div>
      )}

      {showErrorPanel && (
        <div className="bg-gray-900 rounded-xl border border-red-900/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-900/30 flex items-center justify-between">
            <h3 className="font-semibold text-red-400 text-sm">Leaderboards with Scan Errors {!loadingErrors && <span className="ml-2 text-gray-500">({errorLbs.length})</span>}</h3>
            <button onClick={() => setShowErrorPanel(false)} className="text-gray-600 hover:text-gray-400 text-sm">✕</button>
          </div>
          {loadingErrors ? (
            <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>
          ) : errorLbs.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No scan errors found.</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {errorLbs.map((lb) => (
                <div key={lb.id} onClick={() => navigate(`/leaderboard/${lb.id}`)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-800 transition-colors cursor-pointer group">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-100 group-hover:text-indigo-400 truncate">{lb.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{lb.publisher} · {lb.domain}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-xs text-red-400">scan failed</p>
                    <p className="text-xs text-gray-600 mt-0.5">{timeAgo(lb.last_scanned_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showPendingPanel && (
        <div className="bg-gray-900 rounded-xl border border-yellow-900/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-yellow-900/30 flex items-center justify-between">
            <h3 className="font-semibold text-yellow-400 text-sm">Pending Normalization {!loadingPending && <span className="ml-2 text-gray-500">({pendingLbs.length})</span>}</h3>
            <button onClick={() => setShowPendingPanel(false)} className="text-gray-600 hover:text-gray-400 text-sm">✕</button>
          </div>
          <p className="px-4 py-2 text-xs text-gray-500 border-b border-gray-800">
            These leaderboards have not yet been normalised by Gemini (description, methodology, scope). They become Active after a successful scrape or normalisation run at startup.
          </p>
          {loadingPending ? (
            <div className="p-6 text-center text-gray-500 text-sm">Loading...</div>
          ) : pendingLbs.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">No pending leaderboards — all normalised.</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {pendingLbs.map((lb) => (
                <div key={lb.id} onClick={() => navigate(`/leaderboard/${lb.id}`)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-800 transition-colors cursor-pointer group">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-100 group-hover:text-indigo-400 truncate">{lb.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{lb.publisher} · {lb.domain}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-950 text-yellow-400">pending</span>
                    {lb.last_scanned_at
                      ? <p className="text-xs text-gray-600 mt-0.5">scanned {timeAgo(lb.last_scanned_at)}</p>
                      : <p className="text-xs text-gray-600 mt-0.5">never scanned</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {uncategorized.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-amber-900/40 overflow-hidden">
          <button onClick={() => setShowUncategorized((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800 transition-colors">
            <h3 className="font-semibold text-amber-400 text-sm flex items-center gap-2">
              ⚠ Uncategorized Leaderboards <span className="text-gray-500 font-normal">({uncategorized.length})</span>
            </h3>
            <span className="text-gray-600 text-xs">{showUncategorized ? "▲ hide" : "▼ view"} — domain not matched by any grid</span>
          </button>
          {showUncategorized && (
            <div className="border-t border-amber-900/20 divide-y divide-gray-800">
              {uncategorized.map((lb) => (
                <div key={lb.id} className="flex items-center justify-between px-4 py-3 gap-4">
                  <div className="min-w-0 flex-1">
                    <Link to={`/leaderboard/${lb.id}`} className="font-medium text-gray-100 hover:text-indigo-400 transition-colors truncate block">{lb.name}</Link>
                    <p className="text-xs text-gray-500 mt-0.5">{lb.publisher} · <span className="text-amber-400">{lb.domain}</span></p>
                  </div>
                  <div className="shrink-0">
                    {assigningLb === lb.id ? (
                      <span className="text-xs text-gray-500 px-3 py-1.5">Assigning…</span>
                    ) : (
                      <select defaultValue="" onChange={(e) => { if (e.target.value) handleAssignToCategory(lb, parseInt(e.target.value)); }}
                        className="text-xs bg-gray-800 border border-amber-800/60 text-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-600 cursor-pointer">
                        <option value="" disabled>Assign to grid…</option>
                        {categories.map((c) => (<option key={c.id} value={c.id}>{c.icon} {c.name}</option>))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {catSuccess && <div className="px-4 py-2.5 bg-green-900/30 border border-green-800 rounded-lg text-green-400 text-sm">{catSuccess}</div>}
      {catError && <div className="px-4 py-2.5 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">{catError}</div>}

      {editingCat && (
        <div className="bg-gray-900 rounded-xl border border-indigo-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-100">Edit Domain — {editingCat.icon} {editingCat.name}</h2>
            <button onClick={() => setEditingCat(null)} className="text-gray-500 hover:text-gray-300 text-lg">✕</button>
          </div>
          <form onSubmit={handleUpdateDomain} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Domain Name *</label>
              <input required value={editCatForm.name} onChange={(e) => setEditCatForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Icon (emoji)</label>
              <input value={editCatForm.icon} onChange={(e) => setEditCatForm((f) => ({ ...f, icon: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Domain Tags (comma-separated)</label>
              <input value={editCatForm.include_domains} onChange={(e) => setEditCatForm((f) => ({ ...f, include_domains: e.target.value }))}
                placeholder="e.g. STT, TTS, Voice Assistants"
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <p className="text-[11px] text-gray-500 mt-1">Leaderboards with these domain values appear in this grid.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <input value={editCatForm.description} onChange={(e) => setEditCatForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((col) => {
                  const c = colors(col);
                  return <button key={col} type="button" onClick={() => setEditCatForm((f) => ({ ...f, accent_color: col }))}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${c.iconBg} ${editCatForm.accent_color === col ? "border-white scale-110" : "border-transparent"}`} title={col} />;
                })}
              </div>
            </div>
            <div className="sm:col-span-2 flex gap-3 flex-wrap">
              <button type="submit" disabled={updatingCat}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                {updatingCat ? "Saving..." : "Update Domain"}
              </button>
              <button type="button" onClick={() => setEditingCat(null)}
                className="px-5 py-2 border border-gray-700 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
              <button type="button" onClick={() => handleDeleteDomain(editingCat)} disabled={deletingCat === editingCat.id}
                className="px-5 py-2 bg-red-900/40 border border-red-800 text-red-400 rounded-lg text-sm font-medium hover:bg-red-900/70 disabled:opacity-50 transition-colors ml-auto">
                {deletingCat === editingCat.id ? "Deleting..." : "Delete Domain"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && categories.length === 0 ? (
        <div className="p-12 text-center text-gray-500">Loading...</div>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold text-gray-100 mb-4">Domains</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {categories.map((cat) => {
                const c = colors(cat.accent_color);
                return (
                  <div key={cat.slug} className={`group relative rounded-2xl border bg-linear-to-br ${c.gradient} ${c.border} p-5 transition-all ${editingCat?.id === cat.id ? "ring-2 ring-indigo-500/50" : ""}`}>
                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => startEditCat(cat)} className="text-gray-500 hover:text-indigo-400 text-sm transition-colors" title="Edit domain">✎</button>
                      <button onClick={() => handleDeleteDomain(cat)} disabled={deletingCat === cat.id}
                        className="text-gray-500 hover:text-red-400 text-xs transition-colors" title="Delete domain">
                        {deletingCat === cat.id ? "..." : "✕"}
                      </button>
                    </div>
                    <div className={`${c.iconBg} w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3`}>{cat.icon}</div>
                    <h3 className="font-bold text-gray-100 mb-1">{cat.name}</h3>
                    <p className="text-xs text-gray-500 mb-4">
                      {cat.leaderboard_count} leaderboard{cat.leaderboard_count !== 1 ? "s" : ""}
                      {cat.is_builtin && <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-800 text-gray-600 text-[10px]">built-in</span>}
                    </p>
                    <button onClick={() => navigate(`/admin/domain/${cat.slug}`)}
                      className={`w-full py-2 rounded-lg text-sm font-medium ${c.accent} bg-black/20 hover:bg-black/40 transition-colors border border-white/10`}>
                      Manage Leaderboards →
                    </button>
                  </div>
                );
              })}
              <button onClick={() => { setShowAddDomain(true); setEditingCat(null); setCatError(null); setCatSuccess(null); }}
                className="rounded-2xl border border-dashed border-gray-700 hover:border-gray-500 p-5 flex flex-col items-center justify-center gap-2 text-gray-600 hover:text-gray-400 transition-all min-h-45">
                <span className="text-3xl">＋</span>
                <span className="text-sm font-medium">Add Custom Domain</span>
              </button>
            </div>
          </div>

          {showAddDomain && (
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-100">Add New Domain Grid</h2>
                <button onClick={() => setShowAddDomain(false)} className="text-gray-500 hover:text-gray-300 text-lg">✕</button>
              </div>
              <form onSubmit={handleAddDomain} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Domain Name *</label>
                  <input required value={catForm.name} onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Computer Vision"
                    className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  {catForm.name && <p className="text-[11px] text-gray-500 mt-1">Slug: {slugify(catForm.name)}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Icon (emoji)</label>
                  <input value={catForm.icon} onChange={(e) => setCatForm((f) => ({ ...f, icon: e.target.value }))} placeholder="e.g. 👁"
                    className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Domain Tag *</label>
                  <input required value={catForm.domain_tag} onChange={(e) => setCatForm((f) => ({ ...f, domain_tag: e.target.value }))} placeholder="e.g. Computer Vision"
                    className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <p className="text-[11px] text-gray-500 mt-1">Leaderboards with this domain value will appear in this grid.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <input value={catForm.description} onChange={(e) => setCatForm((f) => ({ ...f, description: e.target.value }))} placeholder="Short description"
                    className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLORS.map((col) => {
                      const c = colors(col);
                      return <button key={col} type="button" onClick={() => setCatForm((f) => ({ ...f, accent_color: col }))}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${c.iconBg} ${catForm.accent_color === col ? "border-white scale-110" : "border-transparent"}`} title={col} />;
                    })}
                  </div>
                </div>
                <div className="sm:col-span-2 flex gap-3">
                  <button type="submit" disabled={savingCat}
                    className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors">
                    {savingCat ? "Adding..." : "Add Domain"}
                  </button>
                  <button type="button" onClick={() => setShowAddDomain(false)}
                    className="px-5 py-2 border border-gray-700 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
