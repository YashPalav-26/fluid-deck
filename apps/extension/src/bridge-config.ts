/**
 * EXT-004 — exact bridge origin allowlist.
 *
 * These are development origins only. The production PWA origin is added at
 * build time as a separate entry; never merge dev into production, never use a
 * wildcard, and never match a parent domain. The relay only runs where the
 * manifest `matches` list says it may run.
 */
export const APP_ORIGINS = ["http://127.0.0.1:5199", "http://localhost:5199"] as const;

/** Content-script/`tabs.query` patterns derived from the same list. */
export const APP_URL_PATTERNS: string[] = APP_ORIGINS.map((origin) => `${origin}/*`);
