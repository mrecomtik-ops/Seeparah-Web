// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { findVerifiedQuranVerse, QuranVerseTranslation } from "./QuranVerseTranslation";

// Production book_structure_nodes use a Quran-prefixed canonical reference.
const source = { chunkIndex: 0, canonicalRef: "Quran 1:1", label: "1:1" };
const originalUrdu = "شروع کرتا ہوں اللہ تعالیٰ کے نام سے";
const matched = { ...source, content: originalUrdu };
const style = { fontSize: "26px", lineHeight: 2 };

afterEach(cleanup);

describe("Qur'an source-ayah/edition pairing", () => {
  it("pairs only the exact canonical reference and verified shared chunk identity", () => {
    expect(findVerifiedQuranVerse(source, [
      { chunkIndex: 1, canonicalRef: "Quran 1:2", label: "1:2", content: "next verse" },
      matched,
    ])?.content).toBe(originalUrdu);
    expect(findVerifiedQuranVerse(source, [
      { chunkIndex: 1, canonicalRef: "Quran 1:1", label: "1:1", content: "wrong offset" },
    ])).toBeNull();
    expect(findVerifiedQuranVerse(source, [
      { chunkIndex: 0, canonicalRef: "Quran 1:2", label: "1:2", content: "wrong reference" },
    ])).toBeNull();
    // Never equate an unverified, differently encoded reference merely
    // because the human-visible label looks similar.
    expect(findVerifiedQuranVerse(source, [
      { ...matched, canonicalRef: "1:1" },
    ])).toBeNull();
    expect(findVerifiedQuranVerse(
      { chunkIndex: 0, canonicalRef: "1:1", label: "1:1" },
      [{ ...matched, canonicalRef: "1:1" }],
    )?.content).toBe(originalUrdu);
  });

  it("rejects missing, ambiguous, or nonscriptural verse references without guessing", () => {
    expect(findVerifiedQuranVerse(source, undefined)).toBeNull();
    expect(findVerifiedQuranVerse(source, [matched, matched])).toBeNull();
    expect(findVerifiedQuranVerse({ ...source, canonicalRef: "1" }, [matched])).toBeNull();
    expect(findVerifiedQuranVerse(source, [{ ...matched, content: " " }])).toBeNull();
  });

  it("places exact Urdu verse text in an RTL block labelled with its Arabic source ayah", () => {
    const { container } = render(
      <QuranVerseTranslation source={source} candidates={[matched]} language="Urdu" textStyle={style} />,
    );
    const block = container.querySelector('[data-quran-inline-comparison="Quran 1:1"]')!;
    expect(block.getAttribute("lang")).toBe("ur");
    expect(block.getAttribute("dir")).toBe("rtl");
    expect(block.getAttribute("aria-label")).toContain("ayah Quran 1:1");
    const verse = container.querySelector('[data-quran-matched-reference="Quran 1:1"]')!;
    expect(verse.textContent).toBe(originalUrdu);
    expect(verse.getAttribute("style")).toContain("font-size: 26px");
    // Urdu is not misrepresented as highlighted Arabic source content.
    expect(container.querySelector("[data-sacred-source-text]")).toBeNull();
  });

  it("warns about an unmatched verse instead of showing its neighbor", () => {
    render(<QuranVerseTranslation source={source}
      candidates={[{ chunkIndex: 1, canonicalRef: "Quran 1:2", label: "1:2", content: "verse 2" }]}
      language="Urdu" textStyle={style} />);
    expect(screen.getByRole("status").textContent).toContain("No verified Urdu text matches ayah 1:1");
    expect(screen.queryByText("verse 2")).toBeNull();
  });

  it("distinguishes an edition still loading from an edition failure", () => {
    const { rerender } = render(<QuranVerseTranslation source={source}
      candidates={undefined} language="Urdu" textStyle={style} loading />);
    expect(screen.getByRole("status").textContent).toContain("Loading matching ayah");
    rerender(<QuranVerseTranslation source={source}
      candidates={undefined} language="Urdu" textStyle={style} error />);
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
  });
});
