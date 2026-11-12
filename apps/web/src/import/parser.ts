/**
 * IMPORT-001: HTML Bookmark Parser
 * Parses browser HTML bookmarks (Netscape format) into Fluid Deck Resource entities.
 *
 * Supported format: Netscape Communications Bookmark File Format (HTML)
 * Browsers: Chrome, Firefox, Edge, Safari (all export in this format)
 *
 * No dependencies: a small token scan over the well-defined Netscape structure.
 * Folder blocks are tracked as a stack so every bookmark carries the id of the
 * folder it was exported in, including nested folders (IMPORT-005 carry-forward:
 * IMPORT-004 created folders but filed nothing into them).
 *
 * Resource entity shape (matches Dexie `resources` store) plus `folderId`, which
 * is import-only and consumed by `validateHtmlImport`; it never reaches Dexie.
 */

// ---- Netscape token scan ----
// Order matters: <dl> and <dt> are matched before the generic text patterns.
// <DD> ends at the next structural tag (browsers auto-close it there).
const TOKEN_RE =
  /<dl\b[^>]*>|<\/dl\s*>|<dt\b[^>]*>|<h3\b[^>]*>([\s\S]*?)<\/h3\s*>|<a\b([^>]*)>([\s\S]*?)<\/a\s*>|<p\b[^>]*>([\s\S]*?)<\/p\s*>|<dd\b[^>]*>([\s\S]*?)(?=<\s*\/?\s*(?:dt|dl|dd)\b|$)/gi;

const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"'][^\s>]*))/i;
const REL_RE = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"'][^\s>]*))/i;
const TAGS_RE = /\btags\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"'][^\s>]*))/i;

/**
 * One pass, no recursion: `&amp;amp;` decodes to `&amp;`, never to `&`.
 * Mirrors what the browser already did to the document, so the parser sees the
 * text the exporter meant instead of DOMPurify's re-escaped serialization.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return entity;
      try {
        return String.fromCodePoint(code);
      } catch {
        return entity;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).trim();
}

export interface ParsedHtmlFolder {
  /** Source id, referenced by the bookmark's import-only metadata. */
  id: string;
  name: string;
  parentId: string | null;
  orderIndex: number;
}

export interface ParsedHtmlBookmark extends ResourceEntity {
  /** Source folder id; null only for a bookmark outside every folder. */
  folderId: string | null;
  /** `TAGS="a,b"` attribute, decoded and de-duplicated. */
  tags: string[];
}

// ---- Parse all bookmarks from an HTML string ----
export function parseHtmlBookmarks(html: string): {
  resources: ParsedHtmlBookmark[];
  /** Flattened folder names in creation order (kept for IMPORT-001 callers). */
  collections: string[];
  folders: ParsedHtmlFolder[];
  tags: string[];
} {
  const resources: ParsedHtmlBookmark[] = [];
  const folders: ParsedHtmlFolder[] = [];
  const byParentAndName = new Map<string, ParsedHtmlFolder>();
  const stack: ParsedHtmlFolder[] = [];
  // One entry per open <DL>: true when that <DL> introduced a folder.
  const dlOpenedFolder: boolean[] = [];
  const tagSet = new Set<string>();

  let pendingFolderName: string | null = null;
  let awaitingFolderName = false;
  let unorganized: ParsedHtmlFolder | null = null;

  const createFolder = (name: string, parentId: string | null): ParsedHtmlFolder | null => {
    const clean = name.trim();
    if (!clean) return null;
    const key = `${parentId ?? ""}\u0000${clean.normalize("NFC").toLowerCase()}`;
    const existing = byParentAndName.get(key);
    if (existing) return existing;
    const folder: ParsedHtmlFolder = {
      id: `html-folder-${folders.length}`,
      name: clean,
      parentId,
      orderIndex: folders.length,
    };
    folders.push(folder);
    byParentAndName.set(key, folder);
    return folder;
  };

  // Root-level bookmarks land in a real collection, never silently unorganized.
  const rootFolder = (): ParsedHtmlFolder => {
    unorganized ??= createFolder("Unorganized", null) ?? {
      id: "html-folder-unorganized",
      name: "Unorganized",
      parentId: null,
      orderIndex: folders.length,
    };
    return unorganized;
  };

  const currentFolder = (): ParsedHtmlFolder | null => stack[stack.length - 1] ?? null;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(html)) !== null) {
    const token = match[0];
    const head = token.slice(0, 4).toLowerCase();
    const lower = token.toLowerCase();

    if (lower.startsWith("<dl")) {
      if (pendingFolderName !== null) {
        const folder = createFolder(pendingFolderName, currentFolder()?.id ?? null);
        pendingFolderName = null;
        awaitingFolderName = false;
        if (folder) {
          stack.push(folder);
          dlOpenedFolder.push(true);
        } else {
          dlOpenedFolder.push(false);
        }
      } else {
        // Fixture format: <DL><p>Folder name</p> - the name comes next.
        dlOpenedFolder.push(false);
        awaitingFolderName = true;
      }
      continue;
    }

    if (token.toLowerCase().startsWith("</dl")) {
      if (dlOpenedFolder.pop()) stack.pop();
      awaitingFolderName = false;
      continue;
    }

    if (head.startsWith("<h3")) {
      const name = textOf(match[1] ?? "");
      if (name) pendingFolderName = name;
      continue;
    }

    if (head.startsWith("<p")) {
      const name = textOf(match[4] ?? "");
      if (awaitingFolderName && name) {
        const folder = createFolder(name, currentFolder()?.id ?? null);
        if (folder) {
          stack.push(folder);
          dlOpenedFolder[dlOpenedFolder.length - 1] = true;
        }
        awaitingFolderName = false;
      }
      continue;
    }

    if (head.startsWith("<a")) {
      const attrs = match[2] ?? "";
      const href = HREF_RE.exec(attrs);
      const rawUrl = href?.[1] ?? href?.[2] ?? href?.[3] ?? "";
      if (!rawUrl) continue;
      const url = decodeEntities(rawUrl);

      const rel = REL_RE.exec(attrs);
      const relValue = (rel?.[1] ?? rel?.[2] ?? rel?.[3] ?? "").toLowerCase().trim();
      if (relValue) {
        for (const tag of relValue.split(/\s+/)) {
          if (tag && tag !== "tag") tagSet.add(tag);
          if (tag === "tag") {
            // rel="tag" carries no tag name; folder names are the useful signal.
          }
        }
      }

      const tags: string[] = [];
      const tagsAttribute = TAGS_RE.exec(attrs);
      const rawTags = tagsAttribute?.[1] ?? tagsAttribute?.[2] ?? tagsAttribute?.[3] ?? "";
      for (const raw of rawTags.split(",")) {
        const tag = decodeEntities(raw).trim();
        if (tag && !tags.includes(tag)) {
          tags.push(tag);
          tagSet.add(tag);
        }
      }

      const title = textOf(match[3] ?? "");
      const folderId = currentFolder()?.id ?? rootFolder().id;
      addBookmark(resources, url, title, folderId, tags);
      continue;
    }

    if (head.startsWith("<dd")) {
      const description = textOf(match[5] ?? "");
      const last = resources[resources.length - 1];
      // Netscape puts one <DD> directly after its bookmark; first one wins.
      if (description && last && !last.description) last.description = description;
    }
  }

  // Empty export or a file with no folders: preserve the IMPORT-001 contract.
  if (folders.length === 0) rootFolder();

  return {
    resources,
    collections: folders.map((folder) => folder.name),
    folders,
    tags: Array.from(tagSet),
  };
}

function addBookmark(
  resources: ParsedHtmlBookmark[],
  url: string,
  title: string,
  folderId: string,
  tags: string[],
): void {
  const normalized = normalizeUrl(url);
  let domain = "";
  try {
    domain = new URL(normalized).hostname.toLowerCase();
    if (domain.startsWith("www.")) domain = domain.slice(4);
  } catch {
    // Not an absolute URL: keep domain empty; the validator rejects it.
  }
  resources.push({
    id: `imp-${normalized.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-")}-${Date.now()}`,
    url: normalized,
    canonicalUrl: normalized,
    title: title || "Untitled",
    description: "",
    type: "other",
    source: "import",
    notes: "",
    domain,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastOpenedAt: null,
    deletedAt: null,
    extractionStatus: "complete",
    extractionNotes: [],
    folderId,
    tags,
  });
}

// ---- Normalize URL (strip tracking params, fragment, default ports) ---
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    if (u.hostname.startsWith("www.")) {
      u.hostname = u.hostname.slice(4);
    }
    u.hash = "";
    if (u.port === "80" || u.port === "443") {
      u.port = "";
    }
    const trackingPrefixes = ["utm_", "fbclid", "gclid", "msclkid", "mc_", "igshid", "yclid"];
    const searchParams = u.searchParams;
    for (const key of searchParams.keys()) {
      if (trackingPrefixes.some((p) => key.startsWith(p))) {
        searchParams.delete(key);
      }
    }
    const sortedParams = [...searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    u.search = sortedParams.map(([key, value]) => `${key}=${value}`).join("&");
    return u.toString();
  } catch {
    return url;
  }
}

// ---- Resource entity type (matches Dexie `resources` store schema) ---
interface ResourceEntity {
  id: string;
  url: string;
  canonicalUrl: string;
  title: string;
  description: string;
  type: string;
  source: string;
  notes: string;
  domain: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number | null;
  deletedAt: number | null;
  extractionStatus: string;
  extractionNotes: string[];
}
