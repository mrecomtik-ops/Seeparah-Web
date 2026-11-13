import { describe, expect, it, vi } from "vitest";
import { fetchVerifiedGutendexCatalog } from "./gutenberg-fast-import.server";

const classic = {
  id: 43019,
  title: "Love After Marriage; and Other Stories of the Heart",
  copyright: false,
  media_type: "Text",
  authors: [{ name: "Hentz, Caroline Lee", death_year: 1856 }],
  editors: [],
  translators: [],
  languages: ["en"],
  formats: { "text/plain; charset=utf-8": "https://gutenberg.pglaf.org/cache/epub/43019/pg43019.txt" },
};

describe("Gutendex verified metadata recovery", () => {
  it("accepts exact Gutenberg ID with explicit US copyright metadata", async () => {
    const fetchFn = vi.fn(async () => Response.json(classic)) as unknown as typeof fetch;
    const catalog = await fetchVerifiedGutendexCatalog(43019, fetchFn);
    expect(catalog.id).toBe(43019);
    expect(catalog.copyright).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("uses the documented ids-filter route if the individual endpoint is unavailable", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/books/43019/")) throw new Error("network timeout");
      expect(url).toContain("/books/?ids=43019");
      return Response.json({ count: 1, results: [classic] });
    }) as unknown as typeof fetch;
    const catalog = await fetchVerifiedGutendexCatalog(43019, fetchFn);
    expect(catalog.copyright).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("rejects mismatched book IDs rather than substituting another book", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      Response.json(url.includes("?ids=")
        ? {count:1,results:[{...classic,id:43020}]}
        : {...classic,id:43020}),
    ) as unknown as typeof fetch;
    await expect(fetchVerifiedGutendexCatalog(43019, fetchFn)).rejects.toThrow(/unavailable/);
  });

  it("never treats an absent or unknown rights field as explicitly unrestricted", async () => {
    const {copyright: _unused, ...missingCopyright} = classic;
    const fetchFn = vi.fn(async (url: string) =>
      Response.json(url.includes("?ids=")
        ? {count:1,results:[missingCopyright]}
        : missingCopyright),
    ) as unknown as typeof fetch;
    await expect(fetchVerifiedGutendexCatalog(43019, fetchFn)).rejects.toThrow(/copyright field/);
  });

  it("returns documented restricted rights unchanged for the publication gate to reject", async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ ...classic, copyright: true }),
    ) as unknown as typeof fetch;
    const catalog = await fetchVerifiedGutendexCatalog(43019, fetchFn);
    expect(catalog.copyright).toBe(true);
  });

  it("rejects untrusted malformed IDs", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    await expect(fetchVerifiedGutendexCatalog(0, fetchFn)).rejects.toThrow("Invalid Gutenberg metadata ID");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
