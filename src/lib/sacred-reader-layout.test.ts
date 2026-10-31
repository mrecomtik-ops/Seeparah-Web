import { describe, expect, it } from "vitest";
import {
  sacredReadingProfile,
  sacredReaderMeasure,
  sourceEditionLabel,
  sacredSourceDescription,
  isSourcePoetryChunk,
  sacredScriptFontHref,
} from "./sacred-reader-layout";

describe("sacred reader presentation profiles", () => {
  it("sets script-aware defaults with shaping clearance", () => {
    expect(sacredReadingProfile("Arabic").size).toBeGreaterThan(sacredReadingProfile("English").size);
    expect(sacredReadingProfile("Urdu").leading).toBeGreaterThan(sacredReadingProfile("Greek").leading);
    expect(sacredReadingProfile("Hebrew").leading).toBeGreaterThan(1.5);
    expect(sacredReadingProfile("Sanskrit").script).toContain("Devanagari");
    expect(sacredReadingProfile("Chinese").measure).toBe("40rem");
    expect(sacredReadingProfile("Unknown").size).toBe(19);
  });

  it("uses source-appropriate readable widths and leaves source text untouched", () => {
    expect(sacredReaderMeasure("narrow", "Arabic")).toBe("34rem");
    expect(sacredReaderMeasure("comfortable", "Arabic")).toBe("39rem");
    expect(sacredReaderMeasure("wide", "Arabic")).toBe("60rem");
    expect(sacredReaderMeasure("comfortable", "English")).toBe("44rem");
  });

  it("never labels every translation as an original source", () => {
    expect(sourceEditionLabel("Urdu", "Arabic", true)).toBe("Published translation");
    expect(sourceEditionLabel("English", "Greek", true)).toBe("Published translation");
    expect(sourceEditionLabel("Sanskrit", "Sanskrit", false)).toBe("Selected source edition");
    expect(sourceEditionLabel("English", "Greek", false)).toBe("Published language edition");
  });

  it("does not invent publisher structure for WEB Classic English", () => {
    expect(sacredSourceDescription("English", "Matthew")).toMatch(/does not preserve/i);
    expect(sacredSourceDescription("Greek", "Matthew")).toMatch(/reflowable/i);
    expect(sacredSourceDescription("Hebrew", "Psalms")).toMatch(/not claimed/i);
  });

  it("uses bundled fonts for core scripts and optional external styles for other scripts", () => {
    expect(sacredScriptFontHref("Urdu")).toBeNull();
    expect(sacredScriptFontHref("Arabic")).toBeNull();
    expect(sacredScriptFontHref("Hebrew")).toBeNull();
    expect(sacredScriptFontHref("Hindi")).toBeNull();
    expect(sacredScriptFontHref("Chinese")).toContain("Noto+Serif+SC");
    expect(sacredScriptFontHref("English")).toBeNull();
  });

  it("marks poetry only where source node kind explicitly identifies it", () => {
    expect(isSourcePoetryChunk("stanza")).toBe(true);
    expect(isSourcePoetryChunk("verse-line")).toBe(true);
    expect(isSourcePoetryChunk("paragraph")).toBe(false);
    expect(isSourcePoetryChunk("verse")).toBe(false);
  });
});
