export interface Book {
  id: string;
  title: string;
  author: string;
  author_id: string | null;
  cover_url: string | null;
  available_languages: string[];
  total_chunks: number;
  source_language: string;
  description: string;
  genre?: string | null;
  status: string;
  access_type: "free" | "paid";
  subscription_price_usd: number | null;
  created_at: string;
  // Rights/review workflow fields (migration 0005) — optional because demo
  // books and older rows may not carry them.
  rights_status?: string;
  edition_review_status?: string;
  rejection_reason?: string | null;
  review_notes?: string | null;
}

export interface Chunk {
  book_id: string;
  language: string;
  chunk_index: number;
  content: string;
  status?: string;
  source_version?: number;
  job_id?: string | null;
  model?: string | null;
  prompt_version?: string | null;
  updated_at?: string;
}

export interface Progress {
  user_id: string;
  book_id: string;
  language: string;
  last_chunk_index: number;
  updated_at: string;
}

export interface Highlight {
  id: string;
  user_id: string;
  book_id: string;
  language: string;
  chunk_index: number;
  highlight_text: string;
  created_at: string;
  note: string | null;
}

export interface Subscription {
  id: string;
  user_id: string;
  book_id: string;
  status: string;
  monthly_price_usd: number;
  starts_at: string;
  expires_at: string | null;
  renewed_at: string | null;
  created_at: string;
}

export type ShelfKind = "favorite" | "saved" | "want_to_read";

export interface ShelfRow {
  id: string;
  user_id: string;
  book_id: string;
  shelf: ShelfKind;
  created_at: string;
}

export const LANGUAGES = [
  "English",
  "Urdu",
  "Hindi",
  "Pashto",
  "Arabic",
  "French",
  "German",
  "Russian",
  "Chinese",
  "Spanish",
] as const;

export const RTL_LANGUAGES = new Set(["Urdu", "Arabic", "Pashto"]);

/** English/Urdu: every book gets these as its standard translation
 * targets (see computePublishGate's pendingTranslations in
 * src/lib/admin/catalog.server.ts). Hindi/Arabic: only produced after a
 * signed-in reader requests them and an admin approves
 * (REQUEST_GATED_LANGUAGES in src/lib/reader.server.ts,
 * REQUESTABLE_LANGUAGES in src/lib/admin/translation-access.server.ts).
 * The other six entries in LANGUAGES are valid as a manuscript's own
 * source language, but have no defined path to an additional translated
 * edition today — don't imply otherwise in author- or reader-facing copy. */
export const STANDARD_TRANSLATION_LANGUAGES = ["English", "Urdu"] as const;
export const REQUESTABLE_TRANSLATION_LANGUAGES = ["Hindi", "Arabic"] as const;

export const GENRES = [
  "Classic Romance",
  "Literary Fiction",
  "Adventure",
  "Poetry & Wisdom",
  "History",
  "Philosophy",
] as const;

export const PLATFORM_COMMISSION = 0.3;
export const AUTHOR_PAYOUT = 0.7;

// ---------------------------------------------------------------------------
// Shared launch-accurate copy — reused everywhere this claim appears so a
// correction only has to be made once. Do not restate these claims with
// different wording on individual pages; import and use these instead.
// ---------------------------------------------------------------------------

/** What actually happens to a manuscript's language editions, in one
 * sentence, everywhere this needs saying. No "automatic," no "ten
 * languages," no per-page live translation — reviewed editions only. */
export const TRANSLATION_EXPLAINER =
  "Read available editions free during launch. Translations are prepared once, reviewed, and saved. English and Urdu are the standard targets for every book; readers can request Hindi or Arabic for administrator review.";

/** Short form for tight spaces (badges, stat labels). */
export const TRANSLATION_EXPLAINER_SHORT =
  "Editions are reviewed before publishing. English/Urdu are standard; Hindi/Arabic are available on request.";

/** The one sentence describing what publishing costs/pays right now — no
 * revenue split, no payout promise, while monetization is off. */
export const FREE_LAUNCH_AUTHOR_TERMS =
  "Free to publish and free for readers during launch — no subscriptions, no premium switch, no revenue split yet. Payout terms will be published here before any paid plan starts.";

// ---------------------------------------------------------------------------
// Demo / offline fallback content (mirrors the seeded cloud library)
// ---------------------------------------------------------------------------

export const DEMO_BOOKS: Book[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Pride and Prejudice",
    author: "Jane Austen",
    author_id: null,
    cover_url: null,
    // Only languages this demo fallback actually has chunk content for
    // (see DEMO_CHUNKS below) — a language name here must mean a reader
    // can actually open a page in it, not a marketing aspiration.
    available_languages: ["English", "Urdu", "French"],
    total_chunks: 10,
    source_language: "English",
    description:
      "The opening chapters of Elizabeth Bennet's story, in the public domain. Sample chapters — not the complete novel.",
    status: "published",
    access_type: "free",
    subscription_price_usd: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    title: "The Lantern in the Rain",
    author: "Amina Rahman",
    author_id: null,
    cover_url: null,
    available_languages: ["English"],
    total_chunks: 10,
    source_language: "English",
    description:
      "A demo manuscript used to show the publishing flow — not a real reader-facing title. A lighthouse keeper's daughter finds a lantern that only glows when it rains.",
    status: "published",
    access_type: "free",
    subscription_price_usd: null,
    created_at: "2026-02-01T00:00:00Z",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    title: "Moby-Dick",
    author: "Herman Melville",
    author_id: null,
    cover_url: null,
    available_languages: ["English"],
    total_chunks: 4,
    source_language: "English",
    description:
      "Captain Ahab's obsessive hunt for the white whale — one of the great American novels, in the public domain. Sample chapters — not the complete novel.",
    status: "published",
    access_type: "free",
    subscription_price_usd: null,
    created_at: "2026-01-15T00:00:00Z",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    title: "The Prophet",
    author: "Kahlil Gibran",
    author_id: null,
    cover_url: null,
    available_languages: ["English"],
    total_chunks: 4,
    source_language: "English",
    description:
      "Twenty-six poetic essays on love, work, freedom and sorrow, spoken by the prophet Almustafa. A public-domain treasure. Sample chapters — not the complete text.",
    status: "published",
    access_type: "free",
    subscription_price_usd: null,
    created_at: "2026-01-20T00:00:00Z",
  },
];

/** Books in the (demo-fallback and, currently, live-seeded) catalog that
 * are excerpts/samples rather than complete works, or are demo content
 * rather than a real reader-facing title. Used to render an honest
 * "Sample chapters" / "Demo" badge instead of presenting these as
 * ordinary, complete catalog entries. Keep in sync with
 * supabase/remediation/2026-09-14_free_launch_catalog_accuracy.sql, which
 * corrects the same rows in the live database. */
export const SAMPLE_EXCERPT_BOOK_IDS = new Set([
  "11111111-1111-1111-1111-111111111111", // Pride and Prejudice — opening chapters only
  "33333333-3333-3333-3333-333333333333", // Moby-Dick — opening chapters only
  "44444444-4444-4444-4444-444444444444", // The Prophet — opening chapters only
]);
export const DEMO_MANUSCRIPT_BOOK_IDS = new Set([
  "22222222-2222-2222-2222-222222222222", // The Lantern in the Rain — publishing-flow demo, not a real title
]);

export const SAMPLE_MANUSCRIPT_TITLE = "The Lantern in the Rain";
export const SAMPLE_MANUSCRIPT_AUTHOR = "Amina Rahman";
export const SAMPLE_MANUSCRIPT_SUMMARY =
  "A lighthouse keeper's daughter finds a storm lantern that only glows when it rains — and discovers the water has been keeping accounts of every ship it has ever known.";

export const SAMPLE_MANUSCRIPT_CHAPTERS: string[] = [
  `Chapter 1 — The Keeper's Daughter

The rain came to Qamar's island the way letters come to the lonely: suddenly, and all at once. She stood at the lighthouse door with her father's oilskin over her shoulders and watched the sea turn the colour of pewter.

Her father had been keeper for thirty-one years. He knew every mood of the water, he liked to say, the way a scholar knows the margins of a favourite book. But he had never seen anything like the lantern.`,
  `Chapter 2 — What the Tide Brought In

She found it at dawn, half-buried in the wrack line, tangled in kelp the colour of old bottles. A storm lantern of green glass and tarnished brass, quite dry inside though the sea had clearly carried it for miles.

Qamar turned it over in her hands. There was no maker's mark, only a line of tiny script around the base, worn almost smooth: Light me when it rains, and I will show you what the water remembers.`,
  `Chapter 3 — The First Lighting

She waited three weeks. The island went dry, the cistern sank, her father complained about the dust in the logbooks. Then, one October night, the sky opened.

Qamar struck a match with shaking hands. The wick caught — and the flame was not gold but green, a deep underwater green, and in its light the rain on the windows turned to handwriting. Hundreds of tiny letters, running down the glass like a letter being written very fast.`,
  `Chapter 4 — The Language of Water

It took her a month to learn to read the rain. The writing on the glass was not any alphabet she knew, but the lantern was patient. Night after night it showed her the same shapes until they settled into meaning the way stones settle into a riverbed.

The water remembered ships. That was the first thing she understood. Every wreck within a hundred miles of the island was written down somewhere in the rain, and the lantern had been keeping the accounts.`,
  `Chapter 5 — Her Father's Secret

She should have told him. She knew that even then. But her father had begun to talk of retiring to the mainland, of leaving the light to a keeper from the shipping authority, and Qamar could not bear to give him a reason to stay that was also a reason to worry.

So she kept the lantern in the boathouse, under a sailcloth, and lit it only when he was asleep and the rain was loud enough to cover her footsteps.`,
  `Chapter 6 — The Name in the Rain

On the first night of the winter storms, the rain wrote her own name.

Qamar stood very still while the letters spelled it out against the dark, again and again, patient as a tide. Beneath her name the rain wrote a date — a date three weeks in the future — and beneath the date, a single word she had learned early, because the water used it often: wreck.`,
  `Chapter 7 — Twenty-One Days

She had twenty-one days to understand why the water had written her name beside a sinking.

Her father noticed she was not sleeping. He made her the cardamom tea her mother used to make and did not ask questions, which was his way of asking. Qamar almost told him then, over the steaming cups, while the lighthouse lamp turned above them like a slow, patient star.`,
  `Chapter 8 — What the Lantern Wanted

The night before the date, the rain came down harder than she had ever known it, and the lantern burned so brightly the boathouse glowed like a green coal.

On the glass the water wrote a ship's name — the Gulshan, a coastal steamer — and a position twelve miles north-east of the island. And then, in letters that ran and blurred and rewrote themselves, it wrote the one thing Qamar had not dared to guess: You are the only light it will see.`,
  `Chapter 9 — The Night of the Gulshan

They never found the official log of that night, because her father tore the pages out and burned them. What is known is this: the lighthouse's great lamp failed at midnight, and some other light — green, impossible, low to the water — burned in its place until dawn.

The Gulshan came safe into harbour with all souls. The captain swore to his dying day that he had followed a lantern carried along the shore by a girl who walked on the rain.`,
  `Chapter 10 — Keeper of Two Lights

In the spring, her father signed the retirement papers, and the shipping authority sent a letter asking who would take over the light.

Qamar wrote back in her careful hand: The keeper's daughter. She has kept two lights for a year already.

The lantern sits on her desk to this day. It only glows when it rains. But on this island, the rain comes the way letters come to the lonely — suddenly, and all at once, and always when it is needed most.`,
];

export const DEMO_CHUNKS: Chunk[] = [
  {
    book_id: "11111111-1111-1111-1111-111111111111",
    language: "English",
    chunk_index: 0,
    content: `Chapter 1

It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.`,
  },
  {
    book_id: "11111111-1111-1111-1111-111111111111",
    language: "English",
    chunk_index: 1,
    content: `"My dear Mr. Bennet," said his lady to him one day, "have you heard that Netherfield Park is let at last?"

Mr. Bennet replied that he had not.

"But it is," returned she; "for Mrs. Long has just been here, and she told me all about it."

Mr. Bennet made no answer.

"Do you not want to know who has taken it?" cried his wife impatiently.

"You want to tell me, and I have no objection to hearing it."`,
  },
  {
    book_id: "11111111-1111-1111-1111-111111111111",
    language: "Urdu",
    chunk_index: 0,
    content: `باب اول

یہ ایک مسلمہ حقیقت ہے کہ اچھی دولت کا مالک کنوارا مرد ضرور بیوی چاہتا ہوگا۔

ایسے شخص کے جذبات یا نظریات کتنے ہی پوشیدہ کیوں نہ ہوں، جب وہ کسی محلے میں پہلی بار قدم رکھتا ہے تو یہ حقیقت اردگرد کے خاندانوں کے ذہنوں میں اتنی پککی ہوتی ہے کہ اسے ان کی بیٹیوں میں سے کسی نہ کسی کی جائیداد سمجھا جاتا ہے۔`,
  },
  {
    book_id: "11111111-1111-1111-1111-111111111111",
    language: "French",
    chunk_index: 0,
    content: `Chapitre 1

C'est une vérité universellement reconnue qu'un célibataire pourvu d'une belle fortune doit avoir envie de se marier.

Si peu que l'on connaisse les sentiments ou les vues d'un tel homme à son arrivée dans un voisinage, cette vérité est si bien fixée dans l'esprit des familles d'alentour qu'il est considéré comme la propriété légitime de l'une ou l'autre de leurs filles.`,
  },
  ...SAMPLE_MANUSCRIPT_CHAPTERS.map((content, i) => ({
    book_id: "22222222-2222-2222-2222-222222222222",
    language: "English",
    chunk_index: i,
    content,
  })),
];

// ---------------------------------------------------------------------------
// Local demo store (used when signed out or backend unavailable)
// ---------------------------------------------------------------------------

function readStore<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`seeparah:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`seeparah:${key}`, JSON.stringify(value));
  } catch {
    // storage unavailable — demo continues in-memory only
  }
}

export const demoStore = {
  getProgress: () => readStore<Progress[]>("progress", []),
  setProgress: (rows: Progress[]) => writeStore("progress", rows),
  getHighlights: () => readStore<Highlight[]>("highlights", []),
  setHighlights: (rows: Highlight[]) => writeStore("highlights", rows),
  getSubscriptions: () => readStore<Subscription[]>("subscriptions", []),
  setSubscriptions: (rows: Subscription[]) => writeStore("subscriptions", rows),
  getPublishedBooks: () =>
    readStore<{ book: Book; chunks: Chunk[] }[]>("published", []),
  setPublishedBooks: (rows: { book: Book; chunks: Chunk[] }[]) =>
    writeStore("published", rows),
  getShelves: () => readStore<ShelfRow[]>("shelves", []),
  setShelves: (rows: ShelfRow[]) => writeStore("shelves", rows),
  getReadingDays: () => readStore<string[]>("reading-days", []),
  setReadingDays: (days: string[]) => writeStore("reading-days", days),
  getExtraChunks: () => readStore<Chunk[]>("translated-chunks", []),
  addExtraChunk: (chunk: Chunk) => {
    const all = readStore<Chunk[]>("translated-chunks", []);
    const i = all.findIndex(
      (c) =>
        c.book_id === chunk.book_id &&
        c.language === chunk.language &&
        c.chunk_index === chunk.chunk_index,
    );
    if (i >= 0) all[i] = chunk;
    else all.push(chunk);
    writeStore("translated-chunks", all);
  },
};
