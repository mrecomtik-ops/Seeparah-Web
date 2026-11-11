import { describe, expect, it } from "vitest";
import { chooseUnambiguousPublicationYear } from "./gutenberg-publication-year.server";

describe("QA-001 bibliography validation", () => {
  const doc=(title: string, author: string, year: number) =>
    ({title,author_name:[author],first_publish_year:year});
  it("avoids the exact 1800 and 1656 placeholder failure modes", () => {
    expect(chooseUnambiguousPublicationYear("Uncle Tom's Cabin","Stowe, Harriet Beecher",1896,[
      doc("Uncle Tom's Cabin","Harriet Beecher Stowe",1800),
      doc("Uncle Tom's Cabin","Harriet Beecher Stowe",1852),
    ])).toBe(1852);
    expect(chooseUnambiguousPublicationYear("Lorna Doone: A Romance of Exmoor","Blackmore, R. D.",1900,[
      doc("Lorna Doone","R. D. Blackmore",1656),
      doc("Lorna Doone","R. D. Blackmore",1869),
    ])).toBe(1869);
  });
  it("fails closed when plausible years conflict materially", () => {
    expect(()=>chooseUnambiguousPublicationYear("Example Novel","Smith, Jane",1920,[
      doc("Example Novel","Jane Smith",1860),
      doc("Example Novel","Jane Smith",1880),
    ])).toThrow(/Conflicting/);
  });
  it("tolerates a one-year serial-to-book variance, not unrelated authors", () => {
    expect(chooseUnambiguousPublicationYear("A Tale of Two Cities","Dickens, Charles",1870,[
      doc("A Tale of Two Cities","Charles Dickens",1859),
      doc("A Tale of Two Cities","Charles Dickens",1860),
    ])).toBe(1859);
    expect(()=>chooseUnambiguousPublicationYear("Example Novel","Smith, Jane",1920,[
      doc("Example Novel","Other Writer",1860),
    ])).toThrow(/unavailable/);
  });
});
