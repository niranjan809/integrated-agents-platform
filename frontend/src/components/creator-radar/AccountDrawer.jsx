import { useEffect, useState } from "react";
import { api } from "../../pages/creator-radar/api";
import { CategoryChip, GenuinenessChip, MethodBadge } from "./chips";
import { formatCount, formatPct, formatNum, formatRatio, formatDate } from "../../lib/creator-radar/format";
import RemoveAccountConfirmModal from "./RemoveAccountConfirmModal";

function Section({ title, children }) {
  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 tabular-nums">{value}</div>
    </div>
  );
}

export default function AccountDrawer({ handle, onClose, onRemoved }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [showRemove, setShowRemove] = useState(false);

  useEffect(() => {
    setDetail(null);
    setError("");
    setShowRemove(false);
    if (!handle) return;
    api.get(`/api/accounts/${handle}`).then(setDetail).catch((e) => setError(e.message));
  }, [handle]);

  if (!handle) return null;

  const c = detail?.classification;
  // Gate-out: category was set to Uncategorized by the AI-relevance gate (not rules/LLM).
  const isGateOut = detail?.predicted_category === "Uncategorized" && c?.category_method === "gate";

  return (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={onClose} />
      {/* panel */}
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-900">@{handle}</div>
            {detail && <div className="truncate text-sm text-slate-500">{detail.display_name || "—"}</div>}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="ml-3 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        </div>

        {error && <div className="p-5 text-sm text-red-600">Failed to load: {error}</div>}
        {!detail && !error && <div className="p-5 text-sm text-slate-400">Loading…</div>}

        {detail && (
          <div className="pb-8">
            <Section title="Profile">
              <div className="space-y-2 text-sm text-slate-700">
                <p className="whitespace-pre-wrap text-slate-600">{detail.bio || "—"}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {detail.external_url && (
                    <a href={detail.external_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                      external link ↗
                    </a>
                  )}
                  <a href={`https://www.instagram.com/${handle}/`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                    Instagram profile ↗
                  </a>
                  {detail.is_verified ? <span className="text-sky-600">✓ verified</span> : null}
                  {detail.is_business_account ? <span className="text-slate-500">business</span> : null}
                </div>
              </div>
            </Section>

            <Section title="Classification">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryChip value={detail.predicted_category} />
                <GenuinenessChip value={detail.predicted_genuineness} />
                {c && <MethodBadge value={c.category_method} />}
              </div>
              {c && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="Confidence" value={c.category_confidence != null ? formatNum(c.category_confidence, 2) : "—"} />
                  <Field label="AI content" value={c.ai_content_fraction != null ? formatPct(c.ai_content_fraction) : "—"} />
                  <Field label="Category rule" value={c.category_rule_matched || "—"} />
                  <Field label="Genuineness rule" value={c.genuineness_rule_matched || "—"} />
                </div>
              )}
            </Section>

            {isGateOut && (
              <Section title="AI-relevance gate">
                <div className="border-l-4 border-amber-400 bg-amber-50 p-3 text-sm">
                  <div className="font-semibold text-amber-800">Not primarily AI content</div>
                  <div className="mt-0.5 text-xs text-amber-700">
                    Confidence: {c?.category_confidence != null ? Number(c.category_confidence).toFixed(2) : "—"}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-relaxed text-amber-900">{c?.reasoning || "—"}</p>
                </div>
              </Section>
            )}

            {/* Standard reasoning — suppressed for gate-outs (the amber box above already
                shows the same reasoning text). */}
            {!isGateOut && c?.reasoning && (
              <Section title="Reasoning">
                <p className="text-sm leading-relaxed text-slate-600">{c.reasoning}</p>
              </Section>
            )}

            <Section title="Signals">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Followers" value={formatCount(detail.follower_count)} />
                <Field label="Following" value={formatCount(detail.following_count)} />
                <Field label="Ratio" value={formatRatio(detail.follower_following_ratio)} />
                <Field label="Engagement" value={formatPct(detail.engagement_rate)} />
                <Field label="Avg likes" value={formatCount(Math.round(detail.avg_likes ?? 0))} />
                <Field label="Avg comments" value={formatCount(Math.round(detail.avg_comments ?? 0))} />
                <Field label="Posts / week" value={formatNum(detail.posts_per_week_last_8w, 1)} />
                <Field label="Days since post" value={detail.days_since_last_post ?? "—"} />
                <Field label="Dup captions" value={formatPct(detail.duplicate_caption_fraction)} />
              </div>
            </Section>

            <Section title="Discovered via">
              <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">
                {detail.discovered_via || "seed"}
              </span>
              {detail.posts_in_db != null && (
                <span className="ml-3 text-xs text-slate-400">{detail.posts_in_db} posts in DB</span>
              )}
              {detail.last_refreshed_at && (
                <span className="ml-3 text-xs text-slate-400">refreshed {formatDate(detail.last_refreshed_at)}</span>
              )}
            </Section>

            {/* Danger zone — review-first friction for a destructive action. */}
            <div className="mt-4 border-t border-red-100 px-5 py-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-400">Danger zone</div>
              <button
                onClick={() => setShowRemove(true)}
                className="mt-2 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Remove account from catalog
              </button>
            </div>
          </div>
        )}
      </aside>

      {showRemove && detail && (
        <RemoveAccountConfirmModal
          detail={detail}
          onCancel={() => setShowRemove(false)}
          onRemoved={() => { setShowRemove(false); onRemoved?.(); }}
        />
      )}
    </>
  );
}
