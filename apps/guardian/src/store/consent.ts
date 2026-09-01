/**
 * Consent ledger.
 *
 * Built before the first app ships rather than retrofitted into three live
 * ones. Guardian's own obligations are light — it detects people without
 * identifying them — but the ledger is shared infrastructure, and Vitals and
 * Derma will need it to be timestamped, local, and exportable.
 */
import { db } from './db.ts';

export const CONSENT_VERSION = '2026-09-01';

export interface ConsentState {
  acceptedAt: number | null;
  noticeShown: boolean;
  version: string;
  /** True when the accepted version matches the current one. */
  current: boolean;
}

export async function getConsent(): Promise<ConsentState> {
  const d = await db();
  const row = await d.getFirstAsync<{ accepted_at: number | null; notice_shown: number; version: string }>(
    'SELECT accepted_at, notice_shown, version FROM consent WHERE id = 1',
  );
  if (!row) {
    return { acceptedAt: null, noticeShown: false, version: CONSENT_VERSION, current: false };
  }
  return {
    acceptedAt: row.accepted_at,
    noticeShown: row.notice_shown === 1,
    version: row.version,
    current: row.accepted_at !== null && row.version === CONSENT_VERSION,
  };
}

export async function grantConsent(noticeShown: boolean): Promise<void> {
  const d = await db();
  await d.runAsync(
    `INSERT INTO consent (id, accepted_at, notice_shown, version) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET accepted_at = excluded.accepted_at,
       notice_shown = excluded.notice_shown, version = excluded.version`,
    Date.now(), noticeShown ? 1 : 0, CONSENT_VERSION,
  );
}

export async function revokeConsent(): Promise<void> {
  const d = await db();
  await d.runAsync('UPDATE consent SET accepted_at = NULL WHERE id = 1');
}
