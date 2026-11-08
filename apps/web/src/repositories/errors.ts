import type { z } from "zod";
import { quarantineRecord } from "../persistence/quarantine.ts";

export type RepositoryErrorCode =
  "VALIDATION" | "NOT_FOUND" | "INVALID_REFERENCE" | "CONSTRAINT" | "CYCLE";

/** Named failures so callers branch on `code`, not on message text. */
export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RepositoryError";
    this.code = code;
  }
}

/** Validates untrusted input. Throws on the first failure with every issue listed. */
export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new RepositoryError("VALIDATION", `Invalid ${label}: ${issues}`);
  }
  return result.data;
}

/**
 * Validates a row already stored in IndexedDB. A failure means corruption or a
 * downgrade, so the row is quarantined (excluded, never deleted) and `null` returned.
 */
export function parsePersisted<T>(
  schema: z.ZodType<T>,
  value: unknown,
  store: string,
  id: string,
): T | null {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  quarantineRecord({
    store,
    id,
    reason: result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; "),
    quarantinedAt: Date.now(),
  });
  return null;
}
