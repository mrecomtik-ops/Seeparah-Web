// @vitest-environment happy-dom
//
// Regression coverage for the "Continue reading opens page 1" bug's other
// half: the reader route's own seeding effect. Confirms (1) it seeds the
// starting chunk from the saved progress row matching the CURRENT
// language, (2) it never fetches/persists chunk 0 first when real saved
// progress exists (the "initial page-1 render must never overwrite an
// existing position" requirement), and (3) a sign-in that surfaces newly
// available cross-device progress re-seeds instead of staying stuck at
// whatever a signed-out view had already opened to.
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
  description: "",
  genre: null,
  status: "published",
  access_type: "free",
  subscription_price_usd: null,
} as unknown as Book;

let progressRows: Progress[] = [];
let authUserId = "demo-reader";

const getReaderChunkMock = vi.fn(async (_bookId: string, _language: string, chunkIndex: number) => ({
  locked: false,
  content: `chunk ${chunkIndex}`,
  chunkIndex,
}));
const saveProgressMock = vi.fn(
  async (_userId: string, _bookId: string, _language: string, _chunkIndex: number) => ({}),
);

vi.mock("@/lib/library", () => ({
  DEMO_USER_ID: "demo-reader",
  getBook: () => Promise.resolve(book),
  getReaderChunk: (bookId: string, language: string, chunkIndex: number) =>
    getReaderChunkMock(bookId, language, chunkIndex),
  listProgress: () => Promise.resolve(progressRows),
  listSubscriptions: () => Promise.resolve([]),
  listHighlights: () => Promise.resolve([]),
  saveProgress: (userId: string, bookId: string, language: string, chunkIndex: number) =>
    saveProgressMock(userId, bookId, language, chunkIndex),
  addHighlight: vi.fn(),
  removeHighlight: vi.fn(),
  updateHighlightNote: vi.fn(),
}));

vi.mock("@/lib/translation.functions", () => ({
  reportTranslationIssue: vi.fn(),
}));

vi.mock("@/lib/admin/translation-access.functions", () => ({
  requestBookTranslationAccess: vi.fn(),
  listMyTranslationRequests: () => Promise.resolve([]),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } },
}));

vi.mock("@/lib/use-auth", () => ({
  useAuth: () => ({ userId: authUserId, isDemo: authUserId === "demo-reader" }),
}));

vi.mock("@/components/ShelfButtons", () => ({ ShelfButtons: () => null }));
vi.mock("@/lib/shelves", () => ({ recordReadingDay: vi.fn() }));
vi.mock("@/lib/admin/settings.functions", () => ({
  getPublicContentSettings: () => Promise.resolve({}),
}));
vi.mock("@/lib/prefs", () => ({
  FONT_SIZE_RANGE: [14, 24],
  LINE_HEIGHT_RANGE: [1.4, 2],
  getPrefs: () => ({ language: "English", fontSize: 18, lineHeight: 1.6, theme: "light" }),
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
    }),
    useNavigate: () => vi.fn(),
    useRouterState: () => "/read/book-1",
    Link: (props: { to: string; children?: React.ReactNode; className?: string }) => (
      <a href={props.to} className={props.className}>
        {props.children}
      </a>
    ),
  };
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
  getReaderChunkMock.mockClear();
  saveProgressMock.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("reader route seeding", () => {
  it("seeds the starting chunk from saved progress in the current language, never fetching chunk 0 first", async () => {
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

    await waitFor(() => expect(getReaderChunkMock).toHaveBeenCalled());
    const requestedIndexes = getReaderChunkMock.mock.calls.map((c) => c[2]);
    expect(requestedIndexes).not.toContain(0);
    expect(requestedIndexes[0]).toBe(5);
  });

  it("never autosaves chunk 0 before a real saved position has loaded (no clobber on initial render)", async () => {
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

    await waitFor(() => expect(saveProgressMock).toHaveBeenCalled());
    const savedIndexes = saveProgressMock.mock.calls.map((c) => c[3]);
    expect(savedIndexes).not.toContain(0);
    expect(savedIndexes[0]).toBe(5);
  });

  it("defaults to chunk 0 when there is no saved progress for the current language", async () => {
    progressRows = [];
    renderReader();

    await waitFor(() => expect(getReaderChunkMock).toHaveBeenCalled());
    expect(getReaderChunkMock.mock.calls[0]![2]).toBe(0);
  });

  it("re-seeds from real progress after a sign-in surfaces it, instead of staying at the demo-session position", async () => {
    progressRows = [];
    const { rerender } = renderReader();
    await waitFor(() => expect(getReaderChunkMock).toHaveBeenCalled());
    expect(getReaderChunkMock.mock.calls[0]![2]).toBe(0);

    getReaderChunkMock.mockClear();
    authUserId = "real-user-1";
    progressRows = [
      {
        user_id: "real-user-1",
        book_id: "book-1",
        language: "English",
        last_chunk_index: 7,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <ReaderPage />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getReaderChunkMock).toHaveBeenCalled());
    const requestedIndexes = getReaderChunkMock.mock.calls.map((c) => c[2]);
    expect(requestedIndexes).toContain(7);
  });
});
