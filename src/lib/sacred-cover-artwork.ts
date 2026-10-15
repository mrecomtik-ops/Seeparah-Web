/** Edition-aware presentation artwork. Not an authoritative scripture source. */
type SacredArtworkBook = {
  title: string;
  cover_url?: string | null;
  source_edition_id?: string | null;
};

const JPS_1917_ENGLISH_COVER =
  "/book-covers/sacred/named/05-Tanakh-JPS-1917-English-Translation.webp";

export function sacredCoverSrc(book: SacredArtworkBook, language?: string | null): string | null {
  if (book.source_edition_id === "sefaria-tanach-taamei-hamikra" && language === "English") {
    return JPS_1917_ENGLISH_COVER;
  }
  return book.cover_url ?? null;
}

export function sacredCoverAlt(book: SacredArtworkBook, language?: string | null): string {
  if (book.source_edition_id === "sefaria-tanach-taamei-hamikra") {
    return language === "English"
      ? `Tanakh JPS 1917 English collection artwork; ${book.title} is an individual work in that collection`
      : `Hebrew Tanakh collection artwork; ${book.title} is an individual work in that collection`;
  }
  if (book.source_edition_id === "SBLGNT-v1.2") {
    return `SBL Greek New Testament collection artwork; ${book.title} is an individual New Testament book`;
  }
  if (book.source_edition_id?.startsWith("suttacentral-bilara-") && book.title !== "Dhammapada") {
    return `SuttaCentral Pali and English collection artwork; ${book.title} is one selected collection, not the entire Pali Canon`;
  }
  if (book.title === "The Qur’an") {
    return "The Qur’an combined Arabic, Urdu, English, Hindi and Chinese collection artwork; no translator is identified by this cover";
  }
  return `Cover artwork for ${book.title}`;
}
