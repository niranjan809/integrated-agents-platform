import { useEffect, useState } from "react";
import { api } from "../../pages/creator-radar/api";
import { CategoryChip, GenuinenessChip, MethodBadge } from "./chips";
import { formatCount, formatPct, formatNum, formatRatio, formatDate } from "../../lib/creator-radar/format";
import RemoveAccountConfirmModal from "./RemoveAccountConfirmModal";

function Section({ title, children }) {
  return (
    <div className="u-border-t u-border-slate-100 u-px-5 u-py-4">
      <div className="u-text-xs u-font-semibold u-uppercase u-tracking-wide u-text-slate-400">{title}</div>
      <div className="u-mt-2">{children}</div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="u-text-xs u-text-slate-400">{label}</div>
      <div className="u-text-sm u-text-slate-800 u-tabular-nums">{value}</div>
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
      <div className="u-fixed u-inset-0 u-z-40 u-bg-slate-900-20" onClick={onClose} />
      {/* panel */}
      <aside className="u-fixed u-right-0 u-top-0 u-z-50 u-flex u-h-full u-w-full u-max-w-md u-flex-col u-overflow-y-auto u-bg-white u-shadow-xl">
        <div className="u-sticky u-top-0 u-flex u-items-center u-justify-between u-border-b u-border-slate-200 u-bg-white u-px-5 u-py-3">
          <div className="u-min-w-0">
            <div className="u-truncate u-font-semibold u-text-slate-900">@{handle}</div>
            {detail && <div className="u-truncate u-text-sm u-text-slate-500">{detail.display_name || "—"}</div>}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="u-ml-3 u-rounded-md u-p-1 u-text-slate-400 u-hover-bg-slate-100 u-hover-text-slate-700">
            ✕
          </button>
        </div>

        {error && <div className="u-p-5 u-text-sm u-text-red-600">Failed to load: {error}</div>}
        {!detail && !error && <div className="u-p-5 u-text-sm u-text-slate-400">Loading…</div>}

        {detail && (
          <div className="u-pb-8">
            <Section title="Profile">
              <div className="u-space-y-2 u-text-sm u-text-slate-700">
                <p className="u-whitespace-pre-wrap u-text-slate-600">{detail.bio || "—"}</p>
                <div className="u-flex u-flex-wrap u-gap-x-4 u-gap-y-1 u-text-sm">
                  {detail.external_url && (
                    <a href={detail.external_url} target="_blank" rel="noreferrer" className="u-text-indigo-600 u-hover-underline">
                      external link ↗
                    </a>
                  )}
                  <a href={`https://www.instagram.com/${handle}/`} target="_blank" rel="noreferrer" className="u-text-indigo-600 u-hover-underline">
                    Instagram profile ↗
                  </a>
                  {detail.is_verified ? <span className="u-text-sky-600">✓ verified</span> : null}
                  {detail.is_business_account ? <span className="u-text-slate-500">business</span> : null}
                </div>
              </div>
            </Section>

            <Section title="Classification">
              <div className="u-flex u-flex-wrap u-items-center u-gap-2">
                <CategoryChip value={detail.predicted_category} />
                <GenuinenessChip value={detail.predicted_genuineness} />
                {c && <MethodBadge value={c.category_method} />}
              </div>
              {c && (
                <div className="u-mt-3 u-grid u-grid-cols-2 u-gap-3">
                  <Field label="Confidence" value={c.category_confidence != null ? formatNum(c.category_confidence, 2) : "—"} />
                  <Field label="AI content" value={c.ai_content_fraction != null ? formatPct(c.ai_content_fraction) : "—"} />
                  <Field label="Category rule" value={c.category_rule_matched || "—"} />
                  <Field label="Genuineness rule" value={c.genuineness_rule_matched || "—"} />
                </div>
              )}
            </Section>

            {isGateOut && (
              <Section title="AI-relevance gate">
                <div className="u-border-l-4 u-border-amber-400 u-bg-amber-50 u-p-3 u-text-sm">
                  <div className="u-font-semibold u-text-amber-800">Not primarily AI content</div>
                  <div className="u-mt-0_5 u-text-xs u-text-amber-700">
                    Confidence: {c?.category_confidence != null ? Number(c.category_confidence).toFixed(2) : "—"}
                  </div>
                  <p className="u-mt-2 u-whitespace-pre-wrap u-leading-relaxed u-text-amber-900">{c?.reasoning || "—"}</p>
                </div>
              </Section>
            )}

            {/* Standard reasoning — suppressed for gate-outs (the amber box above already
                shows the same reasoning text). */}
            {!isGateOut && c?.reasoning && (
              <Section title="Reasoning">
                <p className="u-text-sm u-leading-relaxed u-text-slate-600">{c.reasoning}</p>
              </Section>
            )}

            <Section title="Signals">
              <div className="u-grid u-grid-cols-2 u-gap-3 u-sm-grid-cols-3">
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
              <span className="u-rounded-md u-bg-slate-100 u-px-2 u-py-1 u-font-mono u-text-xs u-text-slate-600">
                {detail.discovered_via || "seed"}
              </span>
              {detail.posts_in_db != null && (
                <span className="u-ml-3 u-text-xs u-text-slate-400">{detail.posts_in_db} posts in DB</span>
              )}
              {detail.last_refreshed_at && (
                <span className="u-ml-3 u-text-xs u-text-slate-400">refreshed {formatDate(detail.last_refreshed_at)}</span>
              )}
            </Section>

            {/* Danger zone — review-first friction for a destructive action. */}
            <div className="u-mt-4 u-border-t u-border-red-100 u-px-5 u-py-4">
              <div className="u-text-xs u-font-semibold u-uppercase u-tracking-wide u-text-red-400">Danger zone</div>
              <button
                onClick={() => setShowRemove(true)}
                className="u-mt-2 u-rounded-md u-border u-border-red-300 u-px-3 u-py-1_5 u-text-sm u-font-medium u-text-red-700 u-hover-bg-red-50"
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
