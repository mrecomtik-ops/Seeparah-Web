import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Regression guard for mixed-language JSX. Physical screen-reader speech must
// still be accepted separately on real iOS and Android devices.
const reader = readFileSync(new URL("./SacredTextReader.tsx", import.meta.url), "utf8");

describe("sacred reader English controls inside non-English source", () => {
  it("marks study reference navigation, kind and copy labels as English", () => {
    expect(reader).toMatch(/<div className="mb-2 flex items-baseline justify-between gap-3" dir="auto" lang="en">/);
    expect(reader).toMatch(/aria-label=\{"Go to reference " \+ chunk\.label\}/);
    expect(reader).toMatch(/inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center text-xs font-semibold text-primary/);
    expect(reader).toMatch(/inline-flex min-h-6 items-center gap-1 text-xs text-muted-foreground/);
  });
  it("keeps editorial labels English and source text in its edition language", () => {
    expect(reader).toMatch(/lang=\{languageToBcp47\(language\)\}/);
    expect(reader).toMatch(/lang=\{analectsKind \? \(analectsKind\.startsWith\("chinese"\) \? "zh-Hant" : "en"\) : undefined\}/);
    expect(reader).toMatch(/<summary className="cursor-pointer font-medium text-muted-foreground" lang="en">/);
    expect(reader).toMatch(/className="mb-1 text-xs font-medium text-muted-foreground" dir="auto" lang="en"/);
    expect(reader).toMatch(/aria-label=\{"Reference " \+ chunk\.label\}\s+lang="en"/);
    expect(reader).toMatch(/lang="en"\s+aria-label=\{"Ayah " \+ chunk\.label\}/);
  });
});
