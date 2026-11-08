/**
 * DB-005 — quarantine is a read-time exclusion, not a write.
 *
 * Rows that fail schema validation are never deleted or rewritten: they are
 * recorded here (session memory) and skipped by reads, so the user can still
 * export the database and decide what to do. Nothing in this module mutates data.
 */
export interface QuarantinedRecord {
  store: string;
  id: string;
  reason: string;
  quarantinedAt: number;
}

const quarantined = new Map<string, QuarantinedRecord>();

export function quarantineRecord(record: QuarantinedRecord): void {
  const key = `${record.store}:${record.id}`;
  if (!quarantined.has(key)) quarantined.set(key, record);
}

export function listQuarantined(): QuarantinedRecord[] {
  return [...quarantined.values()];
}

export function clearQuarantine(): void {
  quarantined.clear();
}
