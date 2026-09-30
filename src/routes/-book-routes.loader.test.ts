// Loader contract for /book/$bookId and /read/$bookId: garbage IDs and
// missing/unpublished books must throw TanStack notFound() (→ HTTP 404 on
// SSR) without ever calling getBook for non-UUIDs; a published book passes.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isNotFound } from "@tanstack/react-router";

const getBookMock = vi.fn();
vi.mock("@/lib/library", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getBook: (id: string) => getBookMock(id) };
});

const VALID = "3f1c2b1e-9a7d-4c1a-8d2e-5b6f7a8c9d0e";

async function loaders() {
  const book = (await import("./book.$bookId")).Route as unknown as {
    options: { loader: (a: { params: { bookId: string } }) => Promise<unknown> };
  };
  const read = (await import("./read.$bookId")).Route as unknown as {
    options: { loader: (a: { params: { bookId: string } }) => Promise<unknown> };
  };
  return [
    ["/book", book.options.loader],
    ["/read", read.options.loader],
  ] as const;
}

async function expectNotFound(p: Promise<unknown>) {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(isNotFound(err)).toBe(true);
}

describe("book/read route loaders", () => {
  let routeLoaders: Awaited<ReturnType<typeof loaders>>;

  beforeAll(async () => {
    routeLoaders = await loaders();
  }, 15_000);
  beforeEach(() => getBookMock.mockReset());

  it("throws notFound for non-UUID ids without querying", async () => {
    for (const [, loader] of routeLoaders) {
      for (const id of ["garbage", "123", "demo", "../etc", ""]) {
        await expectNotFound(loader({ params: { bookId: id } }));
      }
    }
    expect(getBookMock).not.toHaveBeenCalled();
  });

  it("throws notFound when the public book lookup returns null (missing/archived)", async () => {
    getBookMock.mockResolvedValue(null);
    for (const [, loader] of routeLoaders) {
      await expectNotFound(loader({ params: { bookId: VALID } }));
    }
    expect(getBookMock).toHaveBeenCalledTimes(2);
  });

  it("returns the book for a published UUID", async () => {
    const book = { id: VALID, title: "T", status: "published" };
    getBookMock.mockResolvedValue(book);
    for (const [, loader] of routeLoaders) {
      await expect(loader({ params: { bookId: VALID } })).resolves.toEqual({ book });
    }
  });
});
