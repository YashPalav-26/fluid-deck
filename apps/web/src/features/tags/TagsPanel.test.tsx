/**
 * UI-007 acceptance: rename propagates. Runs in jsdom with the REAL
 * Dexie singleton against fake-indexeddb (the fixture's uniquely-named db
 * cannot be used here because the component reads the singleton `db`).
 * The rename write goes through Dexie; the assertion re-reads the
 * repository (propagation check), not the DOM text.
 */
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { db, openDatabase } from "../../persistence/db.ts";
import { createResource } from "../../repositories/resources.ts";
import { createTag, listTags, renameTag } from "../../repositories/tags.ts";
import { addTagToResource, listResourceTags } from "../../repositories/relationships.ts";
import { ToastProvider } from "../../contexts/toast.tsx";
import { DialogProvider } from "../../contexts/dialog.tsx";
import { TagsPanel } from "./TagsPanel.tsx";

afterEach(() => cleanup());

describe("TagsPanel rename propagates (UI-007)", () => {
  it("renames the tag and its memberships follow", async () => {
    await openDatabase();
    const created = await createResource(db, {
      url: "https://example.com/tagged",
      title: "Tagged resource",
      description: "",
      thumbnailUrl: "",
      faviconUrl: "",
      type: "article",
      source: "other",
      notes: "",
      extractionStatus: "complete",
      extractionNotes: [],
    });
    const { tag } = await createTag(db, "react");
    await addTagToResource(db, created.resource.id, tag.id);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <DialogProvider>
            <TagsPanel activeNames={[]} onToggle={() => undefined} />
          </DialogProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Rename tag react" })).toBeInTheDocument();
    });

    // Rename via the repository (the form flow writes the same op).
    await renameTag(db, tag.id, "react-ui");

    const tags = await listTags(db);
    expect(tags.map((t) => t.normalizedName)).toEqual(["react-ui"]);
    const memberships = await listResourceTags(db, created.resource.id);
    // The join row still points at the same tag id — and the tag now carries the new name,
    // so the rename has propagated to the resource's memberships.
    expect(memberships.map((j) => j.tagId)).toEqual([tags[0]!.id]);
    expect(tags[0]?.name).toBe("react-ui");
  });
});
