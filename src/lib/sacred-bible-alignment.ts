/**
 * Published SBLGNT Greek / WEB English books whose leaf node keys and
 * canonical_ref strings were checked in live Supabase on 2026-11-02.
 * Each of these 27 books had zero conflicting canonical references and
 * no duplicate leaf keys. Some published editions have added/omitted
 * verses, and many chunk indices shift; positional joins are FORBIDDEN.
 *
 * This registry authorizes comparison requests, not translation production.
 * Individual verses must STILL pass exact key + canonical_ref matching
 * and both chunks must be published at request time.
 */
export const VERIFIED_GREEK_ENGLISH_CANONICAL_WORKS = {
  "bdc623a3-7ff9-5946-b936-29b24caa7ddc": "1 Corinthians",
  "13350527-5a9a-5967-beb9-10d42b5ef6f1": "1 John",
  "63db3781-4e17-56c2-a4c2-fa3010ee1212": "1 Peter",
  "79cf738a-d76c-5019-b97a-3c92babf9372": "1 Thessalonians",
  "f57e4abb-a873-5659-b2bd-7786abdafd6d": "1 Timothy",
  "a003620e-f895-5360-9511-259f6a878495": "2 Corinthians",
  "adaefccc-1f1f-5ad9-b6a9-fc104d85c0c6": "2 John",
  "139f5b86-2e9d-5ad8-a24e-14734da91d67": "2 Peter",
  "50aa2ee3-972f-50fb-b3ee-3ee66a12524a": "2 Thessalonians",
  "664972ec-50bb-5856-bac9-d1b5c849ef8a": "2 Timothy",
  "ff0f0225-46fb-5d5c-a721-90c4eaf8de6b": "3 John",
  "85e0097d-643e-5f10-95b5-3d78209914ca": "Acts",
  "141c4409-0621-5eef-ae73-3ffb0b47697f": "Colossians",
  "2101dd69-3029-5faf-aae3-c58350cfdb2a": "Ephesians",
  "2ed14267-d2cb-5b47-99c5-44e8e98e98c6": "Galatians",
  "c8276fe4-df2a-5d46-815c-a2e134431ab9": "Hebrews",
  "85e66abf-9fdb-56f8-aed1-ac13b12be217": "James",
  "44b1989e-4ad4-5ff8-a182-9093c07b34b7": "John",
  "ca7758d3-c6bb-5d2b-a0a4-0e0c91f96949": "Jude",
  "dbe08801-dfcf-5c68-8467-7c648f0e36b2": "Luke",
  "d725cedf-2443-5c10-a68a-0e100a33aecd": "Mark",
  "7bc812fd-6a4d-544e-903f-b2e333a5cc4f": "Matthew",
  "da43c1ce-a246-5fef-8f6b-2469822c6033": "Philemon",
  "f316bafe-ec15-5ff5-bafa-b23e241275f8": "Philippians",
  "0f04a44a-fe48-5f59-99f9-36ce801271ee": "Revelation",
  "fb88ee5d-f1aa-590e-aaee-9cf2973e48bd": "Romans",
  "44e046c2-c4ae-500e-ac1b-13b3b6f3d0a1": "Titus",
} as const;

export function canCompareByCanonicalReference(bookId: string, from: string, to: string): boolean {
  return Object.prototype.hasOwnProperty.call(VERIFIED_GREEK_ENGLISH_CANONICAL_WORKS, bookId) &&
    from !== to &&
    (from === "Greek" || from === "English") &&
    (to === "Greek" || to === "English");
}
