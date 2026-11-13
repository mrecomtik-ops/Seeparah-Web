import { describe, expect, it } from "vitest";
import { assessHistoricalGutenbergRightsSignals } from "./gutenberg-historic-rights.server";

const old = {
  label:"Rights reservation",
  snippet:"IN ONE VOLUME. BOSTON: J. E. TILTON & CO. 1871. [_All Rights Reserved._] Entered according to Act of Congress, in the year 1870, by EDWARD GREEY.",
};
const assessed = (signals: Array<{label:string;snippet:string}>, overrides:Record<string,unknown>={}) =>
  assessHistoricalGutenbergRightsSignals({
    signals,gutenbergCopyright:false,authorDeathYear:1888,
    hasModernContributors:false,...overrides,
  });

describe("Gutenberg original-era copyright notices",()=>{
  it("identifies century-old printed copyright notes as historical, not a modern rights claim",()=>{
    const result=assessed([old]);
    expect(result.unresolved).toBe(false);
    expect(result.historicalCount).toBe(1);
  });
  it("never clears unknown US copyright, newer authors or modern contributors",()=>{
    expect(assessed([old],{gutenbergCopyright:null}).unresolved).toBe(true);
    expect(assessed([old],{gutenbergCopyright:true}).unresolved).toBe(true);
    expect(assessed([old],{authorDeathYear:1910}).unresolved).toBe(true);
    expect(assessed([old],{hasModernContributors:true}).unresolved).toBe(true);
  });
  it("holds undated reservations and current copyright notices",()=>{
    const unknown={...old,snippet:"All rights reserved for the newer edition."};
    const modern={...old,snippet:"All rights reserved 1870, revised edition copyright 2001."};
    expect(assessed([unknown]).unresolved).toBe(true);
    expect(assessed([modern]).unresolved).toBe(true);
  });
  it("blocks any explicit renewal or permission restriction despite an old date",()=>{
    expect(assessed([{...old,snippet:"Copyright renewed 1980; historical 1870"}]).unresolved).toBe(true);
    expect(assessed([{...old,snippet:"Used by special permission, first printed 1870."}]).unresolved).toBe(true);
  });
  it("does not clear mixed signals when one cannot be independently dated",()=>{
    expect(assessed([old,{label:"Edition notice",snippet:"A NEW REVISED EDITION"}]).unresolved).toBe(true);
  });
  it("never claims any recorded historical rights acknowledgement if no flags exist",()=>{
    const result=assessed([]);
    expect(result.unresolved).toBe(false);
    expect(result.historicalCount).toBe(0);
  });
});
