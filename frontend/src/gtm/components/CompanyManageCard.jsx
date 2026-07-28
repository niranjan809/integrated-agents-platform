import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { statusDotClass, statusTextClass, statusLabel, scopeStyle } from "../lib/status";

export default function CompanyManageCard({
  company,
  strategies,
  onChanged,
}) {
  const [panel, setPanel] = useState(null);
  const [name, setName] = useState(company.name);
  const [segment, setSegment] = useState(company.segment ?? "");
  const [website, setWebsite] = useState(company.website ?? "");
  const [hqCountry, setHqCountry] = useState(company.hqCountry ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const totalEvidence = strategies.reduce((sum, s) => sum + s.evidenceCount, 0);
  const scope = company.scope ? scopeStyle(company.scope) : null;

  async function handleSaveDetails(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateCompany(company.id, {
        name: name.trim() || undefined,
        segment: segment.trim() || null,
        website: website.trim() || null,
        hqCountry: hqCountry.trim() || null,
      });
      setPanel(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete ${company.name}? This removes all of its evidence and detection rules.`)) return;
    setDeleting(true);
    try {
      await api.deleteCompany(company.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete company");
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      {panel === "details" ? (
        <form onSubmit={handleSaveDetails} className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company name"
            className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          />
          <input
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
            placeholder="Segment"
            className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          />
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          />
          <input
            value={hqCountry}
            onChange={(e) => setHqCountry(e.target.value)}
            placeholder="Headquarters country (e.g. United Arab Emirates)"
            className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-line"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-bold text-ink">{company.name}</h3>
              {company.segment && <div className="text-xs text-ink">{company.segment}</div>}
              {company.hqCountry && <div className="mt-0.5 text-xs text-ink">📍 {company.hqCountry}</div>}
            </div>
            {scope && (
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${scope.bg} ${scope.text}`}
              >
                <scope.icon className="h-3 w-3" />
                {company.scope}
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-ink">{totalEvidence} evidence items</span>
            <span className={`flex items-center gap-1.5 font-medium ${statusTextClass(company.status)}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(company.status)}`} />
              {statusLabel(company.status)}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-4">
            <Link to={`/gtm/company/${company.id}`} className="text-sm font-medium text-ink hover:underline">
              View GTM →
            </Link>
            <button
              onClick={() => setPanel(panel === "menu" ? null : "menu")}
              className="text-sm font-medium text-ink hover:underline"
            >
              Edit {panel === "menu" ? "▲" : "▼"}
            </button>
          </div>

          {panel === "menu" && (
            <div className="mt-2 flex gap-2 border-t border-line/60 pt-2">
              <button
                onClick={() => setPanel("details")}
                className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-line"
              >
                Details
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-red-900/60 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-950/40 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
