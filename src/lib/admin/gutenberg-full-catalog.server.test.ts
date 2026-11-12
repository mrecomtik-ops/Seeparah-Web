import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  GUTENBERG_DISCOVERY_TARGET,
  parseGutenbergInventoryPage,
} from "@/lib/admin/gutenberg-full-catalog.server";

const header = "Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves";
const rows = [
  "1,Text,2000-01-01,English Historic Novel,en,\"Austen, Jane, 1775-1817\",Fiction,PR,Books",
  "2,Text,2016-01-01,\"Livre français\",fr,\"Auteur, Moderne, 1950-2025\",Roman,PQ,",
  "3,Text,2002-01-01,Arabic Poetry,ar,,Poetry,PJ,",
  "4,Text,2020-10-10,Bilingual Edition,en;ur,\"Author, Modern, 1990-\",Translations,PG,",
  "5,Sound,2000-01-01,Audio Only,en,,Sound,PN,",
  "6,Text,2026-01-01,Classical Chinese,zh,\"Author; Translator\",Poetry,PL,",
  "7,Text,2018-05-04,Modern Short Work,en,\"Anonymous\",Short stories,PR,",
  "8,Text,2025-02-01,Greek Source,el,\"Aristotle\",Classics,PA,",
].join("\n");
const csv = [header, rows].join("\n");
const sha = createHash("sha256").update(csv).digest("hex");

describe("75k+ Gutenberg inventory discovery", () => {
  it("does not filter on author death year, English, translators or era", () => {
    const x = parseGutenbergInventoryPage(csv, 0, 500, sha);
    expect(GUTENBERG_DISCOVERY_TARGET).toBeGreaterThanOrEqual(75000);
    expect(x.exhausted).toBe(true);
    expect(x.items.map((a) => a.gutenberg_id)).toEqual([1, 2, 3, 4, 6, 7, 8]);
    expect(x.items[2]!.author_raw).toBe("");
    expect(x.items[3]!.language_codes).toEqual(["en", "ur"]);
    expect(x.items.every((a) => !("rights_status" in a))).toBe(true);
  });
  it("resumes from a checkpoint without skipping a Text identity", () => {
    const p0 = parseGutenbergInventoryPage(csv, 0, 3, sha);
    const p1 = parseGutenbergInventoryPage(csv, 3, 3, sha);
    const p2 = parseGutenbergInventoryPage(csv, 6, 3, sha);
    expect([...p0.items, ...p1.items, ...p2.items].map((i) => i.gutenberg_id))
      .toEqual([1, 2, 3, 4, 6, 7, 8]);
    expect(p0.exhausted).toBe(false);
    expect(p2.exhausted).toBe(true);
  });
  it("rejects feed/schema corruption instead of missing catalogue records", () => {
    expect(() => parseGutenbergInventoryPage("a,b,c\n1,2,3", 0, 10, sha)).toThrow(/required/i);
    expect(() => parseGutenbergInventoryPage([header, "not-an-id,Text,,,,,"].join("\n"), 0, 10, sha))
      .toThrow(/identity/i);
    expect(() => parseGutenbergInventoryPage(csv, -1, 10, sha)).toThrow(/checkpoint/);
  });
  it("parses quoted multiline records without losing the following book", () => {
    const multi = [header,
      '500,Text,2020-01-01,"The Book of\nTwo Lines",en,"Somebody, X",Fiction',
      '501,Text,2020-01-01,Next Entry,es,"Anon",Fiction',
    ].join("\n");
    const x = parseGutenbergInventoryPage(multi, 0, 10,
      createHash("sha256").update(multi).digest("hex"));
    expect(x.items.map((i) => i.gutenberg_id)).toEqual([500, 501]);
    expect(x.items[0]!.title).toBe("The Book of\nTwo Lines");
  });
});
