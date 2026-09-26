// @vitest-environment happy-dom
//
// Regression coverage for the bug found in the live preview: "Continue
// reading" opened page 1 instead of the reader's actually-saved page. Root
// cause was a language-key mismatch — the Library page's featured-book
// link always used the book's source_language, and BookCard's own
// language fallback never consulted saved progress at all, so when a
// reader's saved progress was under a different language, the reader
// route's saved-position lookup (keyed on (book_id, language)) found
// nothing and silently restarted at page 1. These tests assert the link
// actually built carries the language the saved progress row belongs to.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Book, Progress } from "@/lib/data";

const book: Book = {
  id: "book-1",
  title: "Two Languages",
  author: "Test Author",
  author_id: "author-1",
  cover_url: null,
  available_languages: ["English", "Hindi"],
  total_chunks: 10,
  source_language: "English",
  description: "",
  genre: null,
  status: "published",
  access_type: "free",
  subscription_price_usd: null,
} as unknown as Book;

let progressRows: Progress[] = [];

vi.mock("@/lib/library", () => ({
  listBooks: () => Promise.resolve([book]),
  listProgress: () => Promise.resolve(progressRows),
  matchesBookSearch: (b: { title: string; author: string }, query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q);
  },
}));

vi.mock("@/lib/use-auth", () => ({
  useAuth: () => ({ userId: "reader-1", displayName: "Reader", isDemo: false }),
}));

vi.mock("@/components/ShelfButtons", () => ({
  useShelves: () => ({ data: [] }),
  ShelfButtons: () => null,
}));

vi.mock("@/lib/admin/settings.functions", () => ({
  getPublicContentSettings: () => Promise.resolve({}),
}));

vi.mock("@/lib/covers", () => ({
  coverFor: () => null,
  FEATURED_BOOK_ID: "book-1",
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: Record<string, unknown>) => ({
      ...config,
      useSearch: () => ({}),
      useNavigate: () => vi.fn(),
    }),
    Link: (props: {
      to: string;
      params?: Record<string, string>;
      search?: Record<string, unknown>;
      children: React.ReactNode;
      className?: string;
    }) => (
      <a
        href={props.to}
        data-search={JSON.stringify(props.search ?? {})}
        className={props.className}
      >
        {props.children}
      </a>
    ),
  };
});

const { Route } = await import("./library");
const LibraryPage = (Route as unknown as { component: () => React.ReactElement }).component;

function renderLibrary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LibraryPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  progressRows = [];
});

// The tab bar also has a "Continue reading" label (as its own <button>, not
// a link), so we can't distinguish by text alone — find the one <a> the
// mocked Link component renders (identified by its data-search attribute,
// which only that mock sets) and assert on it directly.
function findHeroLink(): HTMLAnchorElement {
  const anchors = Array.from(document.querySelectorAll("a[data-search]"));
  const hero = anchors.find((a) => a.getAttribute("href") === "/read/$bookId");
  if (!hero) throw new Error("hero reading link not found");
  return hero as HTMLAnchorElement;
}

describe("Library featured-book 'Continue reading' link carries the saved-progress language", () => {
  it("uses the language the reader was actually reading in, not the book's source language", async () => {
    progressRows = [
      {
        user_id: "reader-1",
        book_id: "book-1",
        language: "Hindi",
        last_chunk_index: 2,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    renderLibrary();
    await screen.findAllByText(book.title);
    const search = JSON.parse(findHeroLink().getAttribute("data-search")!);
    expect(search.lang).toBe("Hindi");
  });

  it("falls back to the book's source language when there is no saved progress", async () => {
    progressRows = [];
    renderLibrary();
    await screen.findByText("Start reading");
    const search = JSON.parse(findHeroLink().getAttribute("data-search")!);
    expect(search.lang).toBe("English");
  });
});

// Regression coverage for the browser QA finding: the filter selects' blank
// "any value" option was generated as `All ${label.toLowerCase()}s`, which
// reads fine for "Language"/"Author"/"Genre / theme" but produced "All categorys"
// for "Category". Assert every filter's blank option reads naturally.
describe("Library filter selects — 'All ...' option text", () => {
  it("reads naturally for every filter, including the irregular 'Category' plural", async () => {
    renderLibrary();
    await screen.findAllByText(book.title);
    const firstOptionTexts = Array.from(document.querySelectorAll("select")).map(
      (select) => select.querySelector("option")?.textContent,
    );
    expect(firstOptionTexts).toEqual(
      expect.arrayContaining(["All languages", "All authors", "All genre / themes", "All categories"]),
    );
    expect(firstOptionTexts).not.toContain("All categorys");
  });
});
