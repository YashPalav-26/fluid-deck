/**
 * EXT-001 correction — durable MV3 alarm driver.
 *
 * Alarms are wake-up signals only: one-shot, cleared + recreated on
 * reconcile, matching the single alarm name. The outbox machine stays
 * the source of truth; this driver never reads or mutates queue state.
 * Conversion: this module speaks epoch milliseconds (outbox clock);
 * `browser.alarms` speaks epoch seconds.
 *
 * Timing contract (B): the persisted logical deadline is exact, but the
 * browser wake is NOT. Chrome production alarms have a 30 s minimum
 * firing interval and may be delayed — a 1 s retry or 10 s ACK deadline
 * may wake the worker later than the deadline. Prompt execution while
 * the worker is alive comes from the machine's in-worker `setTimeout`
 * race (`#deliverWithTimeout`); the alarm is only the suspension /
 * restart fallback. The machine compares `now()` against the persisted
 * deadline on every wake and never delivers early, so a late alarm is
 * late-but-correct, never early.
 *
 * Firefox: alarms do not survive a browser restart (same as Chrome);
 * startup reconciliation (`reconcile()` on boot + `onStartup`) recreates
 * the alarm from durable state, so a missing alarm is never assumed.
 */

export const ALARM_NAME = "fluid-deck:outbox-retry";

export interface AlarmApi {
  create(name: string, whenSec: number): void;
  clear(name: string): void;
  getAll(): Promise<Array<{ name: string; scheduledTime: number }>>;
}

export interface AlarmScheduler {
  scheduleAt(deadlineMs: number | null): void;
  clear(): void;
  reconcile(deadlineMs: number | null): void;
  hasAlarm(): Promise<boolean>;
}

export type AlarmHead = {
  status: "pending" | "waiting";
  nextAttemptAt: number;
  ackDeadlineAt?: number;
};

/**
 * Earliest future wake deadline for a queue head, or null when no alarm
 * is needed (empty queue, pending without an armed attempt, or all
 * deadlines already past — the machine's due-transition handles those).
 * Reconcile MUST use this, not `nextAttemptAt` alone: an in-flight head
 * is woken by its ACK deadline, not by `nextAttemptAt` (0).
 */
export function effectiveDeadlineMs(head: AlarmHead | undefined, nowMs: number): number | null {
  if (!head) return null;
  const candidates: number[] = [];
  if (head.status === "waiting" && head.nextAttemptAt > nowMs) candidates.push(head.nextAttemptAt);
  if (head.ackDeadlineAt != null && head.ackDeadlineAt > nowMs) candidates.push(head.ackDeadlineAt);
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

export function createAlarmAdapter(api: AlarmApi): AlarmScheduler {
  const toSeconds = (ms: number) => ms / 1000;
  return {
    scheduleAt(deadlineMs) {
      // 0/negative = "no deadline" (e.g. empty queue head): clear, never arm epoch-0.
      if (deadlineMs == null || !Number.isFinite(deadlineMs) || deadlineMs <= 0) {
        api.clear(ALARM_NAME);
        return;
      }
      api.create(ALARM_NAME, toSeconds(deadlineMs));
    },
    clear() {
      api.clear(ALARM_NAME);
    },
    reconcile(deadlineMs) {
      api.clear(ALARM_NAME);
      if (deadlineMs != null && Number.isFinite(deadlineMs)) {
        api.create(ALARM_NAME, toSeconds(deadlineMs));
      }
    },
    async hasAlarm() {
      const all = await api.getAll();
      return all.some((a) => a.name === ALARM_NAME);
    },
  };
}
