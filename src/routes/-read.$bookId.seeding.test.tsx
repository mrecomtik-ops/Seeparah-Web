// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Book, Progress } from "@/lib/data";

const book: Book = {
  id: "book-1",
  title: "Resumable Book",
  author: "Test Author",
  author_id: "author-1",
  cover_url: null,
  available_languages: ["English"],
  total_chunks: 10,
  source_language: "English",
  description: "A test summary.",
  genre: null,
  status: "published",
  access_type: "free",
  subscription_price_usd: null,
} as unknown as Book;

let progressRows: Progress[] = [];
let authUserId = "demo-reader";

const getReaderBookContentMock = vi.fn(async () => ({
  locked: false,
  chunks: [
    { chunkIndex: 0, content: "CHAPTER ONE\n\nFirst chapter text." },
    { chunkIndex: 5, content: "CHAPTER TWO\n\nSecond chapter text." },
  ],
}));
const getReaderNavigationMock = vi.fn(async () => [
  { index: 0, title: "CHAPTER ONE", kind: "chapter" as const, depth: 0, readerStart: true },
  { index: 5, title: "CHAPTER TWO", kind: "chapter" as const, depth: 0 },
]);
const saveProgressMock = vi.fn(
  async (_userId: string, _bookId: string, _language: string, _chunkIndex: number) => ({}),
);

vi.mock("@/lib/library", () => ({
  getBook: () => Promise.resolve(book),
  getReaderBookContent: () => getReaderBookContentMock(),
  getReaderNavigation: () => getReaderNavigationMock(),
  listProgress: () => Promise.resolve(progressRows),
  listHighlights: () => Promise.resolve([]),
  saveProgress: (userId: string, bookId: string, language: string, chunkIndex: number) =>
    saveProgressMock(userId, bookId, language, chunkIndex),
  addHighlight: vi.fn(),
}));

vi.mock("@/lib/use-auth", () => ({
  useAuth: () => ({ userId: authUserId, isDemo: authUserId === "demo-reader" }),
}));

vi.mock("@/components/ShelfButtons", () => ({ ShelfButtons: () => null }));

vi.mock("@/lib/prefs", () => ({
  getPrefs: () => ({ language: "English", fontSize: 18, theme: "light" }),
  setPrefs: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: Record<string, unknown>) => ({
      ...config,
      useParams: () => ({ bookId: "book-1" }),
      useSearch: () => ({ lang: undefined }),
      useLoaderData: () => ({ book }),
    }),
    Link: (props: { to: string; children?: React.ReactNode; className?: string }) => (
      <a href={props.to} className={props.className}>
        {props.children}
      </a>
    ),
  };
});

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    disconnect() {}
  },
);

Object.defineProperty(document, "fonts", {
  configurable: true,
  value: { ready: Promise.resolve() },
});

const { Route } = await import("./read.$bookId");
const ReaderPage = (Route as unknown as { component: () => React.ReactElement }).component;

function renderReader() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReaderPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  progressRows = [];
  authUserId = "demo-reader";
  getReaderBookContentMock.mockClear();
  getReaderNavigationMock.mockClear();
  saveProgressMock.mockClear();
  localStorage.clear();
});

afterEach(() => cleanup());

describe("Reader V3 route seeding", () => {
  it("loads the whole book once instead of fetching database chunks as pages", async () => {
    renderReader();
    await waitFor(() => expect(getReaderBookContentMock).toHaveBeenCalledTimes(1));
    expect(getReaderNavigationMock).toHaveBeenCalledTimes(1);
  });

  it("restores saved chunk progress to the matching semantic chapter without saving chunk 0 first", async () => {
    progressRows = [
      {
        user_id: "demo-reader",
        book_id: "book-1",
        language: "English",
        last_chunk_index: 5,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    renderReader();

    await waitFor(() => expect(saveProgressMock).toHaveBeenCalled(), { timeout: 1800 });
    const saved = saveProgressMock.mock.calls.map((call) => call[3]);
    expect(saved[0]).toBe(5);
    expect(saved).not.toContain(0);
  });

  it("keeps a fresh reader on the title page and does not clobber progress before reading starts", async () => {
    const view = renderReader();
    await waitFor(() => expect(view.getByRole("heading", { name: "Resumable Book" })).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(saveProgressMock).not.toHaveBeenCalled();
  });

  it("uses a user-specific seed key so a signed-in account can restore its own progress", async () => {
    progressRows = [];
    const first = renderReader();
    await waitFor(() => expect(getReaderBookContentMock).toHaveBeenCalled());

    cleanup();
    authUserId = "real-user-1";
    progressRows = [
      {
        user_id: "real-user-1",
        book_id: "book-1",
        language: "English",
        last_chunk_index: 5,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ];

    first.unmount();
    renderReader();
    await waitFor(() => expect(saveProgressMock).toHaveBeenCalled(), { timeout: 1800 });
    expect(saveProgressMock.mock.calls.at(-1)?.[3]).toBe(5);
  });
});