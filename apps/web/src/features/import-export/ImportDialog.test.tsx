// @vitest-environment jsdom
/**
 * IMPORT-005 acceptance: the preview dialog reads real validated data, resolves a
 * conflict through the commit path, and writes nothing when dismissed.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FluidDeckDatabase } from "../../persistence/db.ts";
import { createResource } from "../../repositories/resources.ts";
import { useTestDatabase } from "../../testing/database-fixture.ts";
import { ToastProvider } from "../../contexts/toast.tsx";
import { ImportDialog } from "./ImportDialog.tsx";

const fixture = useTestDatabase();

afterEach(() => cleanup());

const IMPORT_JSON = JSON.stringify({
  result: true,
  collections: [{ _id: 1, title: "Dialog" }],
  items: [
    {
      _id: 1,
      link: "https://dialog.example/existing?utm_source=dialog",
      title: "Updated title",
      type: "link",
      collection: { $id: 1 },
    },
    {
      _id: 2,
      link: "https://dialog.example/new",
      title: "New item",
      type: "link",
      collection: { $id: 1 },
    },
  ],
});

function renderDialog(database: FluidDeckDatabase, onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ImportDialog open={true} onOpenChange={onOpenChange} database={database} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function upload(contents: string) {
  const file = new File([contents], "export.json", { type: "application/json" });
  // jsdom's Blob.text exists, but the override keeps the read synchronous in tests.
  Object.defineProperty(file, "text", { value: () => Promise.resolve(contents) });
  fireEvent.change(screen.getByLabelText("Bookmark file"), { target: { files: [file] } });
}

function count(label: string): string {
  const term = screen.getByText(label);
  return term.parentElement?.querySelector("dd")?.textContent ?? "";
}

describe("ImportDialog", () => {
  it("previews counts and commits the selected conflict resolution", async () => {
    const database = fixture.db;
    const existing = await createResource(database, {
      url: "https://dialog.example/existing",
      title: "Original",
    });
    renderDialog(database);

    upload(IMPORT_JSON);

    await waitFor(() => expect(count("New resources")).toBe("1"));
    expect(count("Conflicts")).toBe("1");
    expect(count("Collections")).toBe("1");
    expect(screen.getByText("Already saved: Original")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Update metadata" }));
    fireEvent.click(screen.getByRole("button", { name: "Import now" }));

    expect(await screen.findByText(/Imported 1 new resources/)).toBeInTheDocument();

    const updated = await database.resources.get(existing.resource.id);
    expect(updated?.title).toBe("Updated title");
    expect(await database.resources.count()).toBe(2);
    expect(
      await database.resources.where("canonicalUrl").equals("https://dialog.example/new").count(),
    ).toBe(1);
  });

  it("writes nothing when the preview is dismissed", async () => {
    const database = fixture.db;
    await createResource(database, { url: "https://dialog.example/existing", title: "Original" });
    const onOpenChange = vi.fn();
    renderDialog(database, onOpenChange);

    upload(IMPORT_JSON);

    await waitFor(() => expect(count("New resources")).toBe("1"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await database.resources.count()).toBe(1);
    expect(await database.collections.count()).toBe(0);
  });

  it("shows a validation error and stays on the picker for an invalid file", async () => {
    const database = fixture.db;
    renderDialog(database);

    upload("{ not json");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Re-run" }));
    expect(screen.getByLabelText("Bookmark file")).toBeInTheDocument();
    expect(await database.resources.count()).toBe(0);
  });

  it("reports per-batch progress while committing more than one batch", async () => {
    const database = fixture.db;
    const items = Array.from({ length: 600 }, (_, index) => ({
      _id: index,
      link: `https://batch.example/${index}`,
      title: `Batch ${index}`,
    }));
    renderDialog(database);

    upload(JSON.stringify({ result: true, collections: [], items }));

    await waitFor(() => expect(count("New resources")).toBe("600"));
    fireEvent.click(screen.getByRole("button", { name: "Import now" }));

    // 600 rows is two IMPORT_BATCH_SIZE=500 batches, so progress must be reported.
    // The batch line only appears once the first real transaction resolves; under a
    // loaded full-suite run that is slower than the 1s Testing Library default.
    expect(await screen.findByRole("progressbar", { name: "Import progress" })).toBeInTheDocument();
    expect(
      await screen.findByText(/Batch \d+: \d+ of 600 resources/, undefined, { timeout: 20_000 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Imported 600 new resources/, undefined, { timeout: 20_000 }),
    ).toBeInTheDocument();
    expect(await database.resources.count()).toBe(600);
  }, 30_000);

  it("shows an error summary that can be dismissed or re-run", async () => {
    const database = fixture.db;
    const onOpenChange = vi.fn();
    renderDialog(database, onOpenChange);

    upload("{ not json");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This file could not be imported");
    expect(alert).toHaveTextContent("not valid JSON");
    expect(alert).toHaveTextContent("File corrupted. Re-export from source.");
    expect(screen.queryByLabelText("Bookmark file")).not.toBeInTheDocument();

    // Re-run returns to the picker without closing the dialog or writing anything.
    fireEvent.click(screen.getByRole("button", { name: "Re-run" }));
    expect(screen.getByLabelText("Bookmark file")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(await database.resources.count()).toBe(0);

    upload("{ not json");
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await database.resources.count()).toBe(0);
  });

  it("lists validation warnings in the preview instead of dropping them silently", async () => {
    const database = fixture.db;
    renderDialog(database);

    upload(
      JSON.stringify({
        result: true,
        collections: [],
        items: [
          { _id: 1, link: "https://warn.example/kept", title: "Kept" },
          { _id: 2, link: null, title: "Broken" },
        ],
      }),
    );

    await waitFor(() => expect(count("New resources")).toBe("1"));
    expect(screen.getByText(/skipped or adjusted during validation/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/skipped or adjusted during validation/));
    expect(screen.getByText(/resource #2: /)).toBeInTheDocument();
  });

  it("returns to the picker from the summary without writing again", async () => {
    const database = fixture.db;
    renderDialog(database);

    upload(IMPORT_JSON);
    await waitFor(() => expect(count("New resources")).toBe("2"));
    fireEvent.click(screen.getByRole("button", { name: "Import now" }));
    expect(await screen.findByText(/Imported 2 new resources/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Import another file" }));
    expect(screen.getByLabelText("Bookmark file")).toBeInTheDocument();
    expect(await database.resources.count()).toBe(2);
  });
});
