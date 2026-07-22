// v0.12 curator audit helper. Every curator CLI mutation logs one curator_actions row via
// logAction(). before_state/after_state accept plain objects (JSON-stringified here) or null.
// performed_at is written explicitly as ISO-8601 (nowIso) for consistency with the rest of
// the schema's *_at columns; the table's datetime('now') DEFAULT is only a fallback.
import { get, nowIso } from "./db.js";

const asJson = (v) => (v == null ? null : typeof v === "string" ? v : JSON.stringify(v));

// Returns the inserted row id.
export async function logAction({
  action,
  target_type,
  target_id,
  platform = null,
  before_state = null,
  after_state = null,
  reason = null,
  actor = "anooj",
}) {
  if (!action || !target_type || target_id == null) {
    throw new Error("logAction requires action, target_type, target_id");
  }
  const row = await get(
    `INSERT INTO curator_actions
       (action, target_type, target_id, platform, before_state, after_state, reason, actor, performed_at)
     VALUES (@action, @target_type, @target_id, @platform, @before_state, @after_state, @reason, @actor, @performed_at)
     RETURNING id`,
    {
      action,
      target_type,
      target_id: String(target_id),
      platform,
      before_state: asJson(before_state),
      after_state: asJson(after_state),
      reason,
      actor,
      performed_at: nowIso(),
    }
  );
  return row?.id ?? null;
}
