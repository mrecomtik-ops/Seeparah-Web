export function sacredTraditionId(value: string): string {
  return 'source-tradition-' + value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
export type SourceHoldingIdentity = {
  tradition: string;
  title: string;
  edition: string;
  language: string;
  translator: string;
  status: string;
  rights_note: string;
  acquired_coverage: string;
};

export function matchSacredHolding(holding: SourceHoldingIdentity, search: string): boolean {
  const term = search.trim().toLocaleLowerCase();
  if (!term) return true;
  return [holding.tradition, holding.title, holding.edition, holding.language,
    holding.translator, holding.status, holding.acquired_coverage, holding.rights_note]
    .some((value) => value.toLocaleLowerCase().includes(term));
}

export function sourceTraditionCounts(holdings: readonly SourceHoldingIdentity[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const holding of holdings) result[holding.tradition] = (result[holding.tradition] ?? 0) + 1;
  return result;
}
