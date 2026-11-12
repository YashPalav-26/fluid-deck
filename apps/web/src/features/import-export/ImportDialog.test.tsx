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
    expect(screen.getByLabelText("Bookmark file")).toBeInTheDocument();
    expect(await database.resources.count()).toBe(0);
  });
});
