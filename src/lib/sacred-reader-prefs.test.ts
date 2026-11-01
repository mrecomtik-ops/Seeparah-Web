import { describe, expect, it } from "vitest";
import {
  DEFAULT_SACRED_PREFS,
  parseSacredPrefs,
  readSacredPrefs,
  persistSacredPrefs,
  canRetainCanonicalPosition,
  sacredEditionLayout,
  sacredReferenceGroupLabel,
  sacredSourceFingerprint,
} from "./sacred-reader-prefs";
import {
  verifiedDhammapadaLines,
  prepareDiscourseBlocks,
  inlineMarkupBalancedByBlock,
  BilaraDiscourse,
} from "@/components/reader/SacredSourceStructure";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import dhp from "./sacred-bilara-dhp-lines.json";
import dn from "./sacred-bilara-dn-structure.json";

describe("sacred preferences and language alignment", () => {
  it("recovers settings across a simulated reload", () => {
    let saved = "";
    const storage = {
      getItem: () => saved,
      setItem: (_key: string, value: string) => {
        saved = value;
      },
    };
    const prefs = {
      mode: "study" as const,
      fontDelta: 4,
      lineDelta: 0.25,
      measure: "narrow" as const,
      sans: true,
    };
    persistSacredPrefs(storage, prefs);
    expect(readSacredPrefs(storage)).toEqual(prefs);
  });
  it("fails safely when storage is unavailable, malformed or hostile", () => {
    expect(parseSacredPrefs("not json")).toEqual(DEFAULT_SACRED_PREFS);
    expect(
      parseSacredPrefs(
        '{"mode":"study","fontDelta":999,"measure":"bad","lineDelta":1,"sans":"yes"}',
      ),
    ).toEqual({
      mode: "study",
      fontDelta: 0,
      measure: "comfortable",
      lineDelta: 0,
      sans: false,
    });
    expect(
      readSacredPrefs({
        getItem: () => {
          throw Error("storage blocked");
        },
      }),
    ).toEqual(DEFAULT_SACRED_PREFS);
  });
  it("preserves position only for fully verified source-leaf reference alignments", () => {
    const q = "f7e3a9f0-931a-5207-9859-a27210cc2ca8";
    expect(canRetainCanonicalPosition(q, "Arabic", "Urdu", 6236, 300)).toBe(true);
    expect(canRetainCanonicalPosition(q, "Arabic", "English", 6236, 6236)).toBe(false);
    // The live source/English JPS 1917 records use 1,533 identical
    // canonical_ref + node_key + chunk_index pairs throughout Genesis.
    const genesis = "87205571-41a9-540a-abd2-3784a4079fad";
    expect(canRetainCanonicalPosition(genesis, "Hebrew", "English", 1533, 0)).toBe(true);
    expect(canRetainCanonicalPosition(genesis, "English", "Hebrew", 1533, 1532)).toBe(true);
    expect(canRetainCanonicalPosition(genesis, "Hebrew", "English", 1533, 1533)).toBe(false);
    // The Greek and English Matthew editions differ in source chunk count
    // (1,068 vs 1,071). Never assume positional parallel alignment.
    expect(canRetainCanonicalPosition("7bc812fd-6a4d-544e-903f-b2e333a5cc4f", "Greek", "English", 1071, 25)).toBe(false);
    expect(
      canRetainCanonicalPosition(
        "e0c836a6-6d04-5914-9196-aeb9871776e9",
        "Sanskrit",
        "English",
        701,
        0,
      ),
    ).toBe(false);
    expect(
      canRetainCanonicalPosition(
        "7bc812fd-6a4d-544e-903f-b2e333a5cc4f",
        "Greek",
        "English",
        800,
        9,
      ),
    ).toBe(false);
    expect(
      canRetainCanonicalPosition("3e2c1103-36a9-5a44-987c-259d27dea072", "Pali", "English", 423, 5),
    ).toBe(true);
  });
  it("selects scripture profiles from verified title identities", () => {
    expect(sacredEditionLayout("The Qur’an")).toBe("quran");
    expect(sacredEditionLayout("Matthew")).toBe("bible");
    expect(sacredEditionLayout("Psalms")).toBe("psalms");
    expect(sacredEditionLayout("Bhagavad Gita")).toBe("gita");
    expect(sacredEditionLayout("Confucian Analects (Legge bilingual)")).toBe("analects");
    expect(sacredEditionLayout("Dao De Jing — Wang Bi Commentary")).toBe("dao");
    expect(sacredReferenceGroupLabel("quran", "chapter")).toBe("Ayahs");
    expect(sacredReferenceGroupLabel("analects", "chapter")).toBe("Source passages");
  });
});
describe("pinned Bilara structural fidelity", () => {
  it("requires exact length, fingerprint and independent DB-source verification", () => {
    const meta = (
      dhp.lines as Record<
        string,
        Record<
          string,
          { length: number; ends: number[]; fnv: number; db_verified: boolean; source: string }
        >
      >
    )["Pali"]!["1"]!;
    // We do not need to trust any generated text: source structure must match it exactly.
    const fake = "a".repeat(meta.length);
    expect(verifiedDhammapadaLines(fake, "Pali", 1, dhp)).toBeNull();
    expect(sacredSourceFingerprint(fake)).not.toBe(meta.fnv);
    expect(dhp.lines.Pali["208"]?.db_verified).toBe(false); // DB index 207
    expect(dhp.lines.English["29"]?.db_verified).toBe(false); // DB index 28
    expect(dhp.lines.Pali["1"]?.db_verified).toBe(true);
    expect(dhp.revision).toBe("06ab1b50b259a19a380adc7b8ec4f1fbba4f6f21");
  });
  it("uses pinned DN1 and DN34 source HTML markers", () => {
    expect(dn.markers["dn1:1.0"]).toContain("heading-2");
    expect(dn.markers["dn1:1.2.1"]).toContain("p-open");
    expect(dn.markers["dn34:0.1"]).toBeDefined();
    expect(dn.revision).toBe(dhp.revision);
  });
  it("DN34 regression: no literal tag leak when Bilara emphasis crosses source cell boundaries", () => {
    const content = "Source <b>important phrase</b> follows.";
    const ranges: [[string, number, number], [string, number, number]] = [
      ["dn34:1.1.1", 0, 10],
      ["dn34:1.1.2", 10, content.length],
    ];
    const meta = {
      revision: dn.revision,
      markers: {
        "dn34:1.1.1": ["p-open"],
        "dn34:1.1.2": ["p-close"],
      },
    };
    const output = renderToStaticMarkup(
      createElement(BilaraDiscourse, {
        content,
        ranges,
        data: meta,
        language: "English",
        style: { fontSize: "18px" },
      }),
    );
    expect(output).not.toContain("&lt;b&gt;");
    expect(output).not.toContain("&lt;/b&gt;");
    expect(output).toContain("<strong>important phrase</strong>");
    expect(output).toContain("Source ");
    expect(output).toContain(" follows.");
    const badBlocks = prepareDiscourseBlocks(content, ranges, {
      revision: dn.revision,
      markers: { "dn34:1.1.1": ["p-open", "p-close"], "dn34:1.1.2": ["p-open", "p-close"] },
    });
    expect(badBlocks).not.toBeNull();
    expect(inlineMarkupBalancedByBlock(badBlocks!)).toBe(false);
  });
  it("splits source-backed paragraphs without fabricating a heading", () => {
    const demo = "Title  \n\nSource one. \n\nNext source.";
    const ranges: [string, number, number][] = [
      ["dn1:0.2", 0, 7],
      ["dn1:1.2.1", 9, 21],
      ["dn1:1.2.5", 23, demo.length],
    ];
    const blocks = prepareDiscourseBlocks(demo, ranges, dn);
    expect(blocks).not.toBeNull();
    expect(blocks?.[0]?.type).toBe("h2");
    expect(prepareDiscourseBlocks(demo, [["dn1:0.2", 1, 7]], dn)).toBeNull();
  });
});
