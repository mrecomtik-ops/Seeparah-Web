import { describe, expect, it } from "vitest";
import { sacredCoverAlt, sacredCoverSrc, isSharedSacredCollectionCover, sacredCollectionCaption } from "./sacred-cover-artwork";

const hebrewTanakh = {
  title: "Genesis",
  source_edition_id: "sefaria-tanach-taamei-hamikra",
  cover_url: "/book-covers/sacred/named/04-Tanakh-Hebrew-Scriptures.webp",
};
describe("sacred collection artwork edition rules", () => {
  it("keeps Hebrew Tanakh and JPS 1917 English artwork distinct", () => {
    expect(sacredCoverSrc(hebrewTanakh, "Hebrew")).toBe(hebrewTanakh.cover_url);
    expect(sacredCoverSrc(hebrewTanakh, "English")).toContain("05-Tanakh-JPS-1917-English-Translation.webp");
    expect(sacredCoverAlt(hebrewTanakh, "English")).toContain("Genesis");
    expect(sacredCoverAlt(hebrewTanakh, "Hebrew")).not.toContain("JPS 1917");
  });
  it("identifies a Greek New Testament book as a collection member", () => {
    expect(sacredCoverAlt({title:"Matthew",source_edition_id:"SBLGNT-v1.2"})).toContain("Matthew is an individual New Testament book");
  });
  it("does not assign Sutta Collection artwork to Dhammapada", () => {
    const book={ title:"Dhammapada", source_edition_id:"suttacentral-bilara-dhp-06ab1b50b259",cover_url:null };
    expect(sacredCoverSrc(book,"Pali")).toBeNull();
    expect(sacredCoverAlt({title:"Dīgha Nikāya",source_edition_id:"suttacentral-bilara-dn-06ab1b50b259"})).toContain("one selected collection");
  });
  it("does not invent a translator for the multilingual Qur’an cover", () => {
    expect(sacredCoverAlt({title:"The Qur’an"})).toContain("no translator is identified");
  });
});

describe("individual sacred book presentation versus shared collection art", () => {
  it("treats Greek NT, Tanakh and selected SuttaCentral units as collection members", () => {
    expect(isSharedSacredCollectionCover({title:"Mark",source_edition_id:"SBLGNT-v1.2"})).toBe(true);
    expect(isSharedSacredCollectionCover(hebrewTanakh)).toBe(true);
    expect(isSharedSacredCollectionCover({title:"Dīgha Nikāya",source_edition_id:"suttacentral-bilara-dn-06ab1b50b259"})).toBe(true);
  });
  it("never turns Qur’an, Dhammapada or unrelated works into a collection title panel", () => {
    expect(isSharedSacredCollectionCover({title:"The Qur’an",source_edition_id:"tanzil-uthmani-1.1"})).toBe(false);
    expect(isSharedSacredCollectionCover({title:"Dhammapada",source_edition_id:"suttacentral-bilara-dhp-06ab1b50b259"})).toBe(false);
    expect(isSharedSacredCollectionCover({title:"Pride and Prejudice"})).toBe(false);
  });
  it("labels the selected Tanakh edition separately without changing the source record", () => {
    expect(sacredCollectionCaption(hebrewTanakh,"Hebrew")).toContain("Hebrew Tanakh");
    expect(sacredCollectionCaption(hebrewTanakh,"English")).toContain("JPS 1917 English");
  });
});
