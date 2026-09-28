export interface InsightSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface InsightArticle {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
  keywords: string[];
  sections: InsightSection[];
}

export const INSIGHT_ARTICLES: InsightArticle[] = [
  {
    slug: "how-to-read-classic-literature-without-losing-momentum",
    title: "How to Read Classic Literature Without Losing Momentum",
    description:
      "A practical guide to reading classic literature with better context, manageable pacing, notes, and a reading routine that keeps difficult books enjoyable.",
    excerpt:
      "Classic books become easier when you stop treating every page like a test. Build context, read in manageable sections, and keep a simple record of what matters.",
    category: "Reading Guides",
    publishedAt: "2026-09-28",
    updatedAt: "2026-09-28",
    readingMinutes: 7,
    keywords: [
      "how to read classic literature",
      "classic books reading guide",
      "reading difficult books",
      "literature reading tips",
    ],
    sections: [
      {
        heading: "Start with context, not a summary",
        paragraphs: [
          "Before opening a classic, learn just enough about the period, setting, and form to understand the world you are entering. A short note about the historical setting or the type of book can remove a surprising amount of friction.",
          "Avoid reading a full plot summary first. Context helps you understand; a detailed summary can remove the discovery that makes the book worth reading.",
        ],
      },
      {
        heading: "Read in natural sections",
        paragraphs: [
          "Many older works were written in chapters, books, cantos, letters, or serialized installments. Use those structural boundaries as stopping points instead of chasing an arbitrary page target.",
          "If a chapter is dense, reading ten focused pages is more useful than forcing forty distracted pages. Consistency matters more than speed.",
        ],
      },
      {
        heading: "Keep a small reading record",
        paragraphs: [
          "You do not need academic notes for every book. Save names that matter, unfamiliar terms, one or two questions, and passages you want to revisit. A lightweight record keeps the story and ideas connected across reading sessions.",
        ],
        bullets: [
          "Mark the last important event or argument before you stop.",
          "Save a short note when a character relationship changes.",
          "Highlight only passages you genuinely expect to revisit.",
          "Write questions rather than forcing an interpretation too early.",
        ],
      },
      {
        heading: "Use translations deliberately",
        paragraphs: [
          "When a classic was not written in a language you read comfortably, the translation is part of the reading experience. Check who translated the edition, when it was published, and whether the source edition is identified.",
          "Different translations can make different choices about tone, literalness, rhythm, names, and explanatory notes. The best edition for you is the one whose provenance is clear and whose style helps you keep reading without hiding what the original text is.",
        ],
      },
      {
        heading: "Let difficult passages stay difficult for a while",
        paragraphs: [
          "Not every sentence needs to be solved immediately. Read forward when a difficult paragraph does not block the larger argument or story, then return later with more context. Classics often become clearer after the book has taught you how to read them.",
        ],
      },
    ],
  },
  {
    slug: "how-to-choose-a-reliable-book-translation",
    title: "How to Choose a Reliable Book Translation",
    description:
      "Learn what to check before choosing a translated edition: translator, source edition, publication details, notes, completeness, and how clearly the edition explains its provenance.",
    excerpt:
      "A translation is an edition, not an invisible layer. The translator, source text, publication history, and editorial choices all matter.",
    category: "Translation",
    publishedAt: "2026-09-28",
    updatedAt: "2026-09-28",
    readingMinutes: 8,
    keywords: [
      "how to choose a book translation",
      "reliable translation edition",
      "translator edition source",
      "best translation of classic books",
    ],
    sections: [
      {
        heading: "Treat the translation as an edition",
        paragraphs: [
          "Readers often compare translated books only by title and language. That misses the most important information. A translation has a translator or editorial team, a publication date, a source text, and a set of choices about vocabulary, rhythm, names, notes, and structure.",
          "Two editions in the same language can therefore feel very different while both being legitimate translations.",
        ],
      },
      {
        heading: "Look for clear provenance",
        paragraphs: [
          "A trustworthy edition should make it possible to identify where the text came from. Useful provenance includes the translator or organization, edition title, publisher, publication year, source edition or identifier, and a source link when one can be provided.",
          "Clear provenance does not prove that every editorial decision is perfect, but it lets a reader understand and verify what they are actually reading.",
        ],
      },
      {
        heading: "Check whether the edition is complete",
        paragraphs: [
          "Some digital copies contain excerpts, abridgments, missing notes, damaged OCR, or only selected chapters. Before investing time in a long work, confirm whether the edition is complete and whether chapter or section numbering matches the stated source.",
        ],
      },
      {
        heading: "Read a sample for style",
        paragraphs: [
          "After checking provenance, read several pages. A translation that is technically careful but exhausting for you may not be the best reading edition. Compare dialogue, descriptive passages, and any poetry or highly stylized section rather than judging from a single famous sentence.",
        ],
      },
      {
        heading: "For sacred texts, use a higher standard",
        paragraphs: [
          "Religious scriptures require a different workflow from ordinary books. The original text, canonical reference system, exact source, and the identity of every existing translation should be explicit. A platform should not silently generate a new machine translation and present it as an established religious translation.",
          "Readers should be able to move between a canonical reference in the original text and the same reference in a verified sourced translation without losing the source attribution.",
        ],
      },
    ],
  },
  {
    slug: "multilingual-reading-how-to-read-the-same-book-across-languages",
    title: "Multilingual Reading: How to Read the Same Book Across Languages",
    description:
      "Practical ways to compare editions across languages without losing your place, including parallel references, vocabulary notes, and when not to switch languages.",
    excerpt:
      "Reading the same work in more than one language is most useful when editions stay aligned and your notes remain connected to the same place in the book.",
    category: "Multilingual Reading",
    publishedAt: "2026-09-28",
    updatedAt: "2026-09-28",
    readingMinutes: 6,
    keywords: [
      "multilingual reading",
      "read books in two languages",
      "parallel translation reading",
      "bilingual reading books",
    ],
    sections: [
      {
        heading: "Choose one language as your reading anchor",
        paragraphs: [
          "Constantly switching languages sentence by sentence can make a book feel fragmented. Pick one edition as your primary reading path, then use another language when a passage is unclear, especially meaningful, or worth comparing.",
        ],
      },
      {
        heading: "Alignment matters more than page numbers",
        paragraphs: [
          "Printed page numbers rarely match across editions. Chapters, sections, paragraphs, and canonical references are much more stable. Digital reading tools should preserve those structural markers so a reader can move between languages without guessing where the corresponding text begins.",
        ],
      },
      {
        heading: "Save vocabulary in context",
        paragraphs: [
          "A word list is more useful when it includes the sentence or passage where the word appeared. Meaning changes with context, register, irony, and genre. Keep the phrase, your note, and the corresponding translation together.",
        ],
      },
      {
        heading: "Compare after reading, not during every sentence",
        paragraphs: [
          "For literary works, first experience a passage in one language. Then compare another edition. This makes differences in tone and phrasing easier to notice because you already understand the scene or argument.",
        ],
      },
    ],
  },
  {
    slug: "public-domain-books-editions-and-rights-explained",
    title: "Public-Domain Books, Editions, and Rights: A Reader’s Guide",
    description:
      "Why a public-domain work can still have modern copyrighted editions and translations, and what readers should look for in a transparent digital library.",
    excerpt:
      "A work, an edition, and a translation are not the same rights object. Knowing the difference helps readers understand why source and edition information matter.",
    category: "Books & Editions",
    publishedAt: "2026-09-28",
    updatedAt: "2026-09-28",
    readingMinutes: 7,
    keywords: [
      "public domain books",
      "public domain translation copyright",
      "book edition rights",
      "classic book editions",
    ],
    sections: [
      {
        heading: "The work and the edition are different",
        paragraphs: [
          "A literary work may be old enough to be in the public domain in a particular jurisdiction while a modern edition contains new editorial material, notes, typography, or a translation that has separate rights.",
          "That is why a responsible digital library identifies the specific edition it uses instead of assuming the age of the original work answers every rights question.",
        ],
      },
      {
        heading: "Translations have their own history",
        paragraphs: [
          "A translation can be much newer than the original book. Even when the source work is public domain, a modern translation may still be protected. Older translations may themselves be public domain depending on the applicable law and publication history.",
        ],
      },
      {
        heading: "What transparent catalog metadata looks like",
        paragraphs: [
          "Readers benefit from seeing the edition title, publisher, year, translator where relevant, source identifier, and a clear link or citation to the source used for the digital text. This is useful for trust, citation, and comparing versions.",
        ],
      },
      {
        heading: "Why this matters for reading, not only law",
        paragraphs: [
          "Edition details help explain spelling, chapter numbering, omitted material, footnotes, and translation choices. Provenance is therefore a reading feature as much as an administrative one.",
        ],
      },
    ],
  },
  {
    slug: "how-to-write-a-literature-research-paper",
    title: "How to Write a Literature Research Paper: From Question to References",
    description:
      "A practical literature-research workflow covering the research question, primary text, secondary sources, evidence, structure, citations, and final revision.",
    excerpt:
      "Strong literature research begins with a focused question and a primary text. Build the argument from evidence instead of collecting quotations first.",
    category: "Research",
    publishedAt: "2026-09-28",
    updatedAt: "2026-09-28",
    readingMinutes: 9,
    keywords: [
      "how to write a literature research paper",
      "literary analysis research paper",
      "literature research guide",
      "literary research citations",
    ],
    sections: [
      {
        heading: "Begin with a question you can actually answer",
        paragraphs: [
          "A topic is not yet a research question. “Memory in a novel” is a topic; a question asks how, why, or to what effect the text uses memory in a defined set of scenes, voices, or structural choices.",
          "Narrow questions make it easier to decide which evidence belongs in the paper and which interesting material should be left out.",
        ],
      },
      {
        heading: "Keep the primary text at the center",
        paragraphs: [
          "Secondary criticism can help you understand a debate, but a literature paper still needs close engagement with the primary work. Record the exact edition you are citing so page, chapter, or section references can be checked.",
        ],
      },
      {
        heading: "Organize evidence by claim",
        paragraphs: [
          "Do not build paragraphs around quotations simply because you found them. Write the claim first, then select the smallest amount of textual evidence needed to support it. Explain how the evidence supports your interpretation.",
        ],
      },
      {
        heading: "Separate sources from your own argument",
        paragraphs: [
          "When you summarize or paraphrase another scholar, cite that source as carefully as you would a direct quotation. Keep notes that distinguish copied words, paraphrases, and your own ideas so attribution does not become ambiguous during drafting.",
        ],
      },
      {
        heading: "Revise the argument before polishing sentences",
        paragraphs: [
          "First check whether every section advances the research question and whether the evidence is sufficient. Only then spend time smoothing transitions, formatting citations, and proofreading. Structural revision usually improves a paper more than line editing an argument that is still unclear.",
        ],
      },
    ],
  },
  {
    slug: "why-source-provenance-matters-for-sacred-texts",
    title: "Why Source Provenance Matters When Reading Sacred Texts Online",
    description:
      "A neutral guide to source provenance for digital scriptures: original text, canonical references, verified translations, edition identity, and why these should remain visible to readers.",
    excerpt:
      "For sacred texts, “what is the source?” should never be hidden. Readers need to know the exact original edition or authoritative source and the identity of each translation.",
    category: "Sacred Texts",
    publishedAt: "2026-09-28",
    updatedAt: "2026-09-28",
    readingMinutes: 8,
    keywords: [
      "authentic religious texts online",
      "scripture source provenance",
      "verified scripture translations",
      "sacred text translations",
    ],
    sections: [
      {
        heading: "A title alone is not enough",
        paragraphs: [
          "Sacred texts often exist across manuscripts, recensions, editions, script traditions, numbering systems, and established translations. A digital page that shows only a title and language leaves important questions unanswered.",
          "Readers should be able to identify the specific source used for the original text and the specific existing translation used for each translated edition.",
        ],
      },
      {
        heading: "Canonical references should survive digitization",
        paragraphs: [
          "Religious traditions do not all organize texts in the same way. Some use book, chapter, and verse; others use surah and ayah, chapter and shloka, hymn, canto, section, ang, or another canonical system.",
          "A digital reader should preserve the terminology and reference structure appropriate to that text rather than forcing every scripture into one generic chapter-and-verse model.",
        ],
      },
      {
        heading: "Original and translation should remain connected",
        paragraphs: [
          "If a reader opens a specific canonical reference in a translation, the interface should make it easy to view the same reference in the original source text and in other verified translations. That relationship should be based on reviewed reference mapping, not approximate page numbers.",
        ],
      },
      {
        heading: "Translation identity must stay visible",
        paragraphs: [
          "A translated scripture should identify the translator, organization, edition, publication details, source, and any relevant authenticity or typography notes when that information is available. This helps readers distinguish established translations from newly generated text.",
        ],
      },
      {
        heading: "Why Seeparah separates sacred-text translation",
        paragraphs: [
          "Seeparah’s Religious content policy is designed so scripture translations are imported from verified existing sources rather than generated by the platform’s AI translation pipeline. The source record is intended to travel with the edition so readers can understand where the text came from.",
        ],
      },
    ],
  },
];

export function getInsightArticle(slug: string): InsightArticle | undefined {
  return INSIGHT_ARTICLES.find((article) => article.slug === slug);
}

export const INSIGHT_CATEGORIES = [...new Set(INSIGHT_ARTICLES.map((article) => article.category))];
