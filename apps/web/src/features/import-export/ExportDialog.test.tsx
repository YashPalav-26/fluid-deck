// @vitest-environment jsdom
/**
 * IMPORT-006 acceptance: the dialog exports real database rows through the service,
 * triggers a named download, and keeps the blob URL alive long enough to save.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FluidDeckDatabase } from "../../persistence/db.ts";
import { createCollection } from "../../repositories/collections.ts";
import { addResourceToCollection } from "../../repositories/relationships.ts";
import { createResource } from "../../repositories/resources.ts";
import { useTestDatabase } from "../../testing/database-fixture.ts";
import { ToastProvider } from "../../contexts/toast.tsx";
import { EXPORT_REVOKE_DELAY_MS } from "../../export/json.ts";
import { ExportDialog } from "./ExportDialog.tsx";

const fixture = useTestDatabase();

const blobs = new Map<string, Blob>();
let downloadName = "";

beforeEach(() => {
  blobs.clear();
  downloadName = "";
  let counter = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn((blob: Blob) => {
      const url = `blob:test-${++counter}`;
      blobs.set(url, blob);
      return url;
    }),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloadName = this.download;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDialog(database: FluidDeckDatabase) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ExportDialog open={true} onOpenChange={vi.fn()} database={database} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function lastExport() {
  await waitFor(() => expect(blobs.size).toBe(1));
  const blob = [...blobs.values()][0]!;
  return JSON.parse(await blob.text()) as {
    items: Array<{ link: string }>;
    resourceCount: number;
    truncated: boolean;
  };
}

describe("ExportDialog", () => {
  it("exports every live resource as a named download", async () => {
    const database = fixture.db;
    await createResource(database, { url: "https://dialog.example/one", title: "One" });
    await createResource(database, { url: "https://dialog.example/two", title: "Two" });
    const timeout = vi.spyOn(globalThis, "setTimeout");
    renderDialog(database);

    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));

    const data = await lastExport();
    expect(data.resourceCount).toBe(2);
    expect(data.truncated).toBe(false);
    expect(data.items).toHaveLength(2);
    expect(downloadName).toMatch(/^fluid-deck-export-\d{4}-\d{2}-\d{2}\.json$/);
    // Deferred revoke: the URL must outlive the click.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), EXPORT_REVOKE_DELAY_MS);
  });

  it("requires a collection before a collection-scoped export", async () => {
    const database = fixture.db;
    const folder = await createCollection(database, { name: "Dialog folder", parentId: null });
    const inside = await createResource(database, {
      url: "https://dialog.example/inside",
      title: "Inside",
    });
    await addResourceToCollection(database, inside.resource.id, folder.collection.id);
    renderDialog(database);

    fireEvent.click(screen.getByRole("radio", { name: "One collection" }));
    const button = screen.getByRole("button", { name: "Export JSON" });
    expect(button).toBeDisabled();

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Dialog folder" })).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("Collection"), {
      target: { value: folder.collection.id },
    });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    const data = await lastExport();
    expect(data.resourceCount).toBe(1);
    expect(data.truncated).toBe(true);
    expect(data.items[0]?.link).toBe("https://dialog.example/inside");
  });
});
