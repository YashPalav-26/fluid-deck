// @vitest-environment jsdom
/**
 * EXT-003 — thumbnail states on the resource card: image, placeholder,
 * failure fallback. Deterministic DOM tests; no live image services.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import type { Resource } from "@fluid-deck/core";
import { ResourceCard } from "./ResourceCard.tsx";

afterEach(() => cleanup());

const THUMBNAIL = "https://cdn.example.com/cover.jpg";

function resource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "6f1f0a2e-1c5b-4a7e-9f0d-2b8c3d4e5f60",
    url: "https://example.com/article",
    canonicalUrl: "https://example.com/article",
    title: "Example article",
    description: "A description",
    thumbnailUrl: "",
    faviconUrl: "",
    domain: "example.com",
    type: "article",
    source: "extension",
    notes: "",
    extractionStatus: "complete",
    extractionNotes: [],
    createdAt: 0,
    updatedAt: 0,
    lastOpenedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("ResourceCard thumbnail", () => {
  it("renders a valid thumbnail lazily without leaking the referrer", () => {
    render(<ResourceCard resource={resource({ thumbnailUrl: THUMBNAIL })} />);

    const image = screen.getByTestId("resource-thumbnail-image");
    expect(image).toHaveAttribute("src", THUMBNAIL);
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.queryByTestId("thumbnail-placeholder")).not.toBeInTheDocument();
    expect(screen.getByTestId("resource-thumbnail")).toHaveClass("aspect-video");
  });

  it("uses the placeholder when there is no thumbnail URL", () => {
    render(<ResourceCard resource={resource({ thumbnailUrl: "" })} />);

    expect(screen.queryByTestId("resource-thumbnail-image")).not.toBeInTheDocument();
    expect(screen.getByTestId("thumbnail-placeholder")).toBeInTheDocument();
    expect(screen.getByTestId("resource-thumbnail")).toHaveClass("aspect-video");
  });

  it("rejects an unsafe thumbnail URL before rendering an image", () => {
    render(
      <ResourceCard resource={resource({ thumbnailUrl: "javascript:alert(1)" } as Resource)} />,
    );

    expect(screen.queryByTestId("resource-thumbnail-image")).not.toBeInTheDocument();
    expect(screen.getByTestId("thumbnail-placeholder")).toBeInTheDocument();
  });

  it("switches to the placeholder on a failed image request and keeps the card intact", () => {
    render(<ResourceCard resource={resource({ thumbnailUrl: THUMBNAIL })} />);

    fireEvent.error(screen.getByTestId("resource-thumbnail-image"));

    expect(screen.queryByTestId("resource-thumbnail-image")).not.toBeInTheDocument();
    expect(screen.getByTestId("thumbnail-placeholder")).toBeInTheDocument();
    expect(screen.getByTestId("resource-thumbnail")).toHaveClass("aspect-video");
    expect(screen.getByRole("link", { name: "Example article" })).toHaveAttribute(
      "href",
      "https://example.com/article",
    );
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("stays in the failed state across re-renders of the same resource", () => {
    const item = resource({ thumbnailUrl: THUMBNAIL });
    const { rerender } = render(<ResourceCard resource={item} />);

    fireEvent.error(screen.getByTestId("resource-thumbnail-image"));
    rerender(<ResourceCard resource={item} />);

    expect(screen.queryByTestId("resource-thumbnail-image")).not.toBeInTheDocument();
    expect(screen.getByTestId("thumbnail-placeholder")).toBeInTheDocument();
  });

  it("shows the image again when the resource gets a new thumbnail URL", () => {
    const { rerender } = render(<ResourceCard resource={resource({ thumbnailUrl: THUMBNAIL })} />);

    fireEvent.error(screen.getByTestId("resource-thumbnail-image"));
    rerender(
      <ResourceCard resource={resource({ thumbnailUrl: "https://cdn.example.com/new.jpg" })} />,
    );

    expect(screen.getByTestId("resource-thumbnail-image")).toHaveAttribute(
      "src",
      "https://cdn.example.com/new.jpg",
    );
  });
});
