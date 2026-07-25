import db from '../db/database';
import { nowIso } from '../utils/dateUtils';

export type AuditRow = {
  id: number;
  ts: string;
  ip: string;
  action: string;
  target_id: string | null;
  before_json: string | null;
  after_json: string | null;
};

// Append-only audit log. Only INSERT is ever performed here; there is no
// delete/update path, so even a leaked admin token cannot scrub its own
// trail through this module. Pruning (if ever wanted) must be done by an
// operator with direct DB access, never via an endpoint.
export function insertAudit(
  ip: string,
  action: string,
  targetId: string | null,
  before: unknown,
  after: unknown,
): void {
  db.prepare(`
    INSERT INTO admin_audit (ts, ip, action, target_id, before_json, after_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    nowIso(),
    ip,
    action,
    targetId,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
  );
}

export function listAudit(limit: number, offset: number): AuditRow[] {
  return db.prepare(`
    SELECT id, ts, ip, action, target_id, before_json, after_json
    FROM admin_audit ORDER BY ts DESC LIMIT ? OFFSET ?
  `).all(limit, offset) as AuditRow[];
}

export function countAudit(): number {
  const r = db.prepare('SELECT COUNT(*) n FROM admin_audit').get() as { n: number };
  return r.n;
}
