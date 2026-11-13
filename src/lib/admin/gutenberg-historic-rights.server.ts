/**
 * Separate 19th-century edition notices from genuinely unresolved rights.
 * Original printed notices like "[All Rights Reserved.] Entered ... 1870"
 * survive faithfully inside public-domain classics and must not be confused
 * with a modern licensing restriction.
 *
 * Fail closed unless Gutenberg explicitly marks this exact work unrestricted
 * in the US, its sole original author died <=1900, and every flagged snippet
 * contains an unambiguous historical date no later than 1900.
 * No editor, translation or modern source may use this exception.
 */
export type HistoricalRightsSignal={label:string;snippet:string};
export function assessHistoricalGutenbergRightsSignals(input:{
  signals:readonly HistoricalRightsSignal[];
  gutenbergCopyright:boolean|null;
  authorDeathYear:number;
  hasModernContributors:boolean;
}):{unresolved:boolean;historicalCount:number;explanation:string}{
  if(input.signals.length===0)
    return{unresolved:false,historicalCount:0,explanation:"No source rights-risk clues"};
  if(input.gutenbergCopyright!==false ||
     !Number.isInteger(input.authorDeathYear) ||
     input.authorDeathYear>1900 ||
     input.hasModernContributors)
    return{unresolved:true,historicalCount:0,
      explanation:"Cannot classify rights notices without original-work clearance"};
  for(const signal of input.signals){
    const snippet=signal.snippet;
    const dates=[...snippet.matchAll(/\b(?:1[5-9]\d{2}|20\d{2})\b/gu)]
      .map(x=>Number(x[0]));
    if(dates.length===0 || dates.some(year=>year>1900)){
      return{unresolved:true,historicalCount:0,
        explanation:"Undated or modern edition-rights signal: "+signal.label};
    }
    if(!["Copyright notice","Rights reservation","Revised edition",
          "Renewal notice","Edition notice"].includes(signal.label)){
      return{unresolved:true,historicalCount:0,
        explanation:"Unrecognized rights clue: "+signal.label};
    }
    // Copyright renewal and special permission may describe a distinct
    // protected contributor's edition even if an old date is nearby.
    if(/(?:renew(?:ed|al)?\s+copyright|used by (?:special )?permission|
          permission (?:granted|required)|license granted solely)/iu.test(snippet.replace(/\s+/gu," "))){
      return{unresolved:true,historicalCount:0,
        explanation:"Explicit renewal or permission restriction"};
    }
  }
  return{unresolved:false,historicalCount:input.signals.length,
    explanation:"All detected rights notices are explicitly dated no later than 1900"};
}
