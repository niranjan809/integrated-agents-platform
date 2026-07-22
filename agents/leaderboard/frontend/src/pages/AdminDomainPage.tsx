import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, invalidateCache, DomainCategory, Leaderboard } from "@/lib/api";
import { timeAgo, statusDot, domainColor } from "@/lib/utils";

const PRESET_TYPES = ["Leaderboard", "Arena"];
const PRESET_SCOPE = ["Global", "Regional"];
const SUGGESTED_METRICS = [
  "WER", "WER%", "MOS", "CER", "RTF", "RTFx", "Latency", "DNSMOS",
  "PESQ", "Elo", "Speed", "Cost", "Price", "Speaker Similarity", "BLEU",
  "Pass@1", "% Resolved", "Elo Rating", "Arena Score", "Quality",
];

function FlexibleSelect({
  label, value, presets, onChange, required,
}: {
  label: string; value: string; presets: string[]; onChange: (v: string) => void; required?: boolean;
}) {
  const [showCustom, setShowCustom] = useState(() => value !== "" && !presets.includes(value));
  useEffect(() => { if (presets.includes(value)) setShowCustom(false); }, [value, presets]);
  const selectValue = showCustom ? "__other__" : value;
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}{required && " *"}</label>
      <select required={required && !showCustom} value={selectValue}
        onChange={(e) => {
          if (e.target.value === "__other__") { setShowCustom(true); onChange(""); }
          else { setShowCustom(false); onChange(e.target.value); }
        }}
        className="w-full bg-gray-800 border border-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
        {presets.map((p) => <option key={p}>{p}</option>)}
        <option value="__other__">Other…</option>
      </select>
      {showCustom && (
        <input autoFocus required={required} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={`Type custom ${label.toLowerCase()}…`}
          className="mt-1.5 w-full bg-gray-800 border border-indigo-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      )}
    </div>
  );
}

function matchesDomain(lb: Leaderboard, cat: DomainCategory): boolean {
  if (cat.include_domains.length > 0) return cat.include_domains.includes(lb.domain);
  return !cat.exclude_domains.includes(lb.domain);
}

export default function AdminDomainPage() {
  const { slug } = useParams<{ slug: string }>();

  const [cat, setCat] = useState<DomainCategory | null>(null);
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);
  const [loading, setLoading] = useState(true);

  const defaultDomain = cat?.include_domains[0] ?? "";
  const EMPTY_FORM = {
    name: "", publisher: "", type: "Leaderboard",
    domain: defaultDomain,
    primary_metrics: "", official_url: "", scope: "Global", notes: "",
  };

  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [targetEditId, setTargetEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [renormalizing, setRenormalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const domainPresets = useMemo(() => {
    const fromCat = cat?.include_domains ?? [];
    const fromData = leaderboards.map((lb) => lb.domain).filter(Boolean);
    return Array.from(new Set([...fromCat, ...fromData])).sort();
  }, [cat, leaderboards]);

  const publisherSuggestions = useMemo(
    () => [...new Set(leaderboards.map((lb) => lb.publisher).filter(Boolean))].sort(),
    [leaderboards]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editParam = params.get("edit");
    if (editParam) setTargetEditId(parseInt(editParam, 10));
    if (slug) loadAll();
  }, [slug]);

  useEffect(() => {
    if (targetEditId && leaderboards.length > 0) {
      const lb = leaderboards.find((l) => l.id === targetEditId);
      if (lb) { startEdit(lb); setTargetEditId(null); }
    }
  }, [leaderboards, targetEditId]);

  useEffect(() => {
    if (!editId && cat?.include_domains[0]) {
      setForm((f) => ({ ...f, domain: f.domain || cat.include_domains[0] }));
    }
  }, [cat, editId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [catData, lbs] = await Promise.all([
        api.getDomainCategory(slug!),
        api.adminList(),
      ]);
      setCat(catData);
      setLeaderboards(lbs.filter((lb: Leaderboard) => matchesDomain(lb, catData)));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function softRefresh() {
    try {
      const [catData, lbs] = await Promise.all([
        api.getDomainCategory(slug!),
        api.adminList(),
      ]);
      setCat(catData);
      setLeaderboards(lbs.filter((lb: Leaderboard) => matchesDomain(lb, catData)));
    } catch {}
  }

  function startEdit(lb: Leaderboard) {
    setEditId(lb.id);
    setForm({
      name: lb.name ?? "",
      publisher: lb.publisher ?? "",
      type: lb.type ?? "Leaderboard",
      domain: lb.domain ?? defaultDomain,
      primary_metrics: (lb.primary_metrics || []).join(", "),
      official_url: lb.official_url ?? "",
      scope: lb.scope ?? "Global",
      notes: lb.notes ?? "",
    });
    setError(null);
    setSuccess(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, domain: cat?.include_domains[0] ?? "" });
    setError(null);
    setSuccess(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("edit");
    window.history.replaceState({}, "", url.toString());
  }

  function addMetric(metric: string) {
    setForm((f) => {
      const existing = f.primary_metrics.split(",").map((s) => s.trim()).filter(Boolean);
      if (existing.includes(metric)) return f;
      return { ...f, primary_metrics: existing.length ? `${f.primary_metrics}, ${metric}` : metric };
    });
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const payload = {
      ...form,
      primary_metrics: form.primary_metrics.split(",").map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editId) {
        await api.adminUpdate(editId, payload);
        if (cat && cat.include_domains.length > 0 && payload.domain && !cat.include_domains.includes(payload.domain)) {
          const newInclude = [...cat.include_domains, payload.domain];
          await api.adminUpdateDomainCategory(cat.id, { include_domains: newInclude });
          invalidateCache(`/domain-categories/${slug}`);
          setCat((prev) => prev ? { ...prev, include_domains: newInclude } : prev);
        }
        setLeaderboards((prev) => prev.map((lb) => lb.id === editId ? { ...lb, ...payload } : lb));
        setSuccess("Leaderboard updated.");
        cancelEdit();
      } else {
        const result = await api.adminAdd(payload);
        if (cat && cat.include_domains.length > 0 && payload.domain && !cat.include_domains.includes(payload.domain)) {
          const newInclude = [...cat.include_domains, payload.domain];
          await api.adminUpdateDomainCategory(cat.id, { include_domains: newInclude });
          invalidateCache(`/domain-categories/${slug}`);
          setCat((prev) => prev ? { ...prev, include_domains: newInclude } : prev);
        }
        setLeaderboards((prev) => [...prev, {
          id: result.id,
          name: payload.name,
          publisher: payload.publisher,
          official_url: payload.official_url,
          type: payload.type,
          domain: payload.domain,
          primary_metrics: payload.primary_metrics,
          availability: "Public",
          scope: payload.scope ?? null,
          notes: payload.notes ?? null,
          status: (result.status as string) || "pending",
          source: "custom" as const,
          description: null, benchmark_datasets: [], methodology: null,
          update_frequency: null, last_updated: null, companies_count: null,
          models_count: null, metrics_count: null, column_order: [],
          scraper_note: null, added_at: null, last_scanned_at: null, last_scan_status: null,
        }]);
        setSuccess(`Added "${result.name}". Normalization running in background.`);
        setForm({ ...EMPTY_FORM, domain: cat?.include_domains[0] ?? "" });
      }
      softRefresh();
    } catch (e: unknown) {
      setError((e as Error).message || "Operation failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This will remove all rankings and scan history.`)) return;
    setDeleting(id);
    setError(null);
    try {
      await api.adminDelete(id);
      setSuccess(`Deleted "${name}".`);
      if (editId === id) cancelEdit();
      setLeaderboards((prev) => prev.filter((lb) => lb.id !== id));
    } catch (e: unknown) {
      setError((e as Error).message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  async function handleRenormalize() {
    if (!editId) return;
    setRenormalizing(true);
    setError(null);
    try {
      await api.adminRenormalize(editId);
      setSuccess("Note generated. Re-scan to refresh row count.");
      softRefresh();
    } catch (e: unknown) {
      setError((e as Error).message || "Renormalization failed");
    } finally {
      setRenormalizing(false);
    }
  }

  function isActive(lb: Leaderboard) { return (lb.models_count ?? 0) > 1; }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link to="/admin" className="text-sm text-gray-500 hover:text-indigo-400 transition-colors">
          ← Admin Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-100 mt-2">
          {cat?.icon} {cat?.name ?? slug}
        </h1>
        <p className="text-gray-500 mt-1">
          {leaderboards.length} leaderboard{leaderboards.length !== 1 ? "s" : ""} in this domain.
        </p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <h2 className="font-semibold text-gray-100 mb-4">
          {editId ? "Edit Leaderboard" : "Add New Leaderboard"}
        </h2>
        {success && <p className="text-green-400 text-sm mb-3 bg-green-900/30 px-3 py-2 rounded-lg">{success}</p>}
        {error && <p className="text-red-400 text-sm mb-3 bg-red-900/30 px-3 py-2 rounded-lg">{error}</p>}

        <datalist id="publishers-list">
          {publisherSuggestions.map((p) => <option key={p} value={p} />)}
        </datalist>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Open ASR Leaderboard" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Publisher *</label>
            <input required list="publishers-list" value={form.publisher} onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Hugging Face" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Official URL *</label>
            <input required type="url" value={form.official_url} onChange={(e) => setForm((f) => ({ ...f, official_url: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Primary Metrics</label>
            <input value={form.primary_metrics} onChange={(e) => setForm((f) => ({ ...f, primary_metrics: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="WER, RTFx (comma-separated)" />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {SUGGESTED_METRICS.map((m) => {
                const active = form.primary_metrics.split(",").map((s) => s.trim()).includes(m);
                return (
                  <button key={m} type="button" onClick={() => addMetric(m)}
                    className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${active ? "bg-indigo-950 border-indigo-700 text-indigo-400 font-medium" : "bg-gray-800 border-gray-700 text-gray-500 hover:border-indigo-700 hover:text-indigo-400"}`}>
                    {active ? "✓ " : "+ "}{m}
                  </button>
                );
              })}
            </div>
          </div>

          <FlexibleSelect label="Type" value={form.type} presets={PRESET_TYPES} onChange={(v) => setForm((f) => ({ ...f, type: v }))} />

          <FlexibleSelect label="Domain" value={form.domain}
            presets={domainPresets.length > 0 ? domainPresets : ["STT", "TTS", "Voice Assistants", "Realtime Voice Agents", "LLM", "Coding AI", "Vision & Multimodal", "Image Generation", "Video AI", "Document AI", "AI Agents", "Robotics", "AI Safety & Security"]}
            onChange={(v) => setForm((f) => ({ ...f, domain: v }))} />

          <FlexibleSelect label="Scope" value={form.scope} presets={PRESET_SCOPE} onChange={(v) => setForm((f) => ({ ...f, scope: v }))} />

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Any additional notes" />
          </div>

          <div className="sm:col-span-2 flex gap-3 flex-wrap">
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors">
              {saving ? "Saving..." : editId ? "Update Leaderboard" : "Add Leaderboard"}
            </button>
            {editId && (
              <>
                <button type="button" onClick={cancelEdit}
                  className="px-5 py-2 border border-gray-700 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
                <button type="button" onClick={handleRenormalize} disabled={renormalizing}
                  title="Re-run Gemini normalization to update the ranking page note"
                  className="px-5 py-2 border border-gray-700 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 disabled:opacity-50 transition-colors">
                  {renormalizing ? "Generating..." : "Generate Note"}
                </button>
                <button type="button" onClick={() => handleDelete(editId, form.name)} disabled={deleting === editId}
                  className="px-5 py-2 bg-red-900/40 border border-red-800 text-red-400 rounded-lg text-sm font-medium hover:bg-red-900/70 disabled:opacity-50 transition-colors ml-auto">
                  {deleting === editId ? "Deleting..." : "Delete Leaderboard"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="font-semibold text-gray-100">Leaderboards ({leaderboards.length})</h2>
        </div>
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading...</div>
        ) : leaderboards.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-sm">No leaderboards in this domain yet. Add one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 border-b border-gray-700">
                <tr>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium">Name</th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium">Publisher</th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium">Domain</th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium">Source</th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium">Status</th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium">Models</th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium">Last Scanned</th>
                  <th className="px-3 py-3 text-right text-gray-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {leaderboards.map((lb) => (
                  <tr key={lb.id} className={`hover:bg-gray-800 ${editId === lb.id ? "bg-indigo-950/30" : ""}`}>
                    <td className="px-3 py-3">
                      <span className="font-medium text-gray-100">{lb.name}</span>
                    </td>
                    <td className="px-3 py-3 text-gray-400">{lb.publisher}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${domainColor(lb.domain)}`}>{lb.domain}</span>
                    </td>
                    <td className="px-3 py-3">
                      {lb.source === "custom"
                        ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-950 text-purple-400">Custom</span>
                        : <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-800 text-gray-500">Built-in</span>
                      }
                    </td>
                    <td className="px-3 py-3">
                      {lb.status === "pending" ? (
                        <span className="text-xs font-medium text-amber-400">Pending</span>
                      ) : isActive(lb) ? (
                        <span className="text-xs font-medium text-green-400">Active</span>
                      ) : (
                        <span className="text-xs font-medium text-gray-500">No data</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-center">{lb.models_count ?? "—"}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">
                      <span className="mr-1">{statusDot(lb.last_scan_status)}</span>
                      {timeAgo(lb.last_scanned_at)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => startEdit(lb)} className="text-indigo-400 hover:underline text-xs font-medium mr-3">Edit</button>
                      <button onClick={() => handleDelete(lb.id, lb.name)} disabled={deleting === lb.id}
                        className="text-red-400 hover:underline text-xs font-medium disabled:opacity-50">
                        {deleting === lb.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
