import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import holdingsData from "@/lib/sacred-unpublished-holdings.json";

export const Route = createFileRoute("/sacred-texts/sources")({
  head: () => ({
    meta: [
      { title: "Acquired Sacred-Text Source Holdings | Seeparah" },
      { name: "description", content: "Source and facsimile catalogue of acquired but unpublished sacred-text editions, with permissions and structure blockers." },
    ],
    links: [{ rel: "canonical", href: "https://seeparah.com/sacred-texts/sources" }],
  }),
  component: SacredSourceHoldingsPage,
});

type Holding = {
  tradition: string;
  title: string;
  language: string;
  edition: string;
  translator: string;
  content_role: string;
  status: string;
  rights_note: string;
  source_url: string;
  acquired_coverage: string;
  revision: string;
  package_name: string;
};
const holdings: Holding[] = holdingsData;
const preferredOrder = ["Hinduism", "Christianity", "Buddhism", "Jainism", "Zoroastrianism", "Daoism", "Confucian traditions", "Shinto", "Sikhism", "Bahá’í", "Latter-day Saint tradition"];
const statusLabels: Record<string, string> = {
  scan_only: "Facsimile / scan only",
  unpublished_rights: "Not cleared for reader redistribution",
  unpublished_structure: "Text acquired · reader structure pending",
  source_link_only: "Official source link only",
};

function safeSourceHref(source: string): string | null {
  try {
    const parsed = new URL(source);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch { return null; }
}

function SacredSourceHoldingsPage() {
  const groups = Object.entries(holdings.reduce<Record<string, Holding[]>>((acc, record) => {
    (acc[record.tradition] ??= []).push(record);
    return acc;
  }, {})).sort(([a], [b]) => {
    const x = preferredOrder.indexOf(a);
    const y = preferredOrder.indexOf(b);
    return (x < 0 ? 999 : x) - (y < 0 ? 999 : y) || a.localeCompare(b);
  });

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <a href="/sacred-texts" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Published sacred texts
      </a>
      <header className="mt-7 rounded-3xl border border-border bg-card px-5 py-7 card-shadow sm:px-8 sm:py-9">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Source holdings · not a reader catalogue</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-foreground sm:text-4xl">Acquired and identified editions</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          These {holdings.length} source-edition records are <strong>not available as published full-text readers</strong>.
          Some sources have been acquired, others are source-link-only. Restrictions, scan status and incomplete structure are
          recorded explicitly; no OCR or translation is invented to complete them.
        </p>
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-primary/20 bg-secondary/50 p-4 text-sm leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>External links lead to publishers or source repositories, not necessarily to an exact downloadable facsimile.
            Owning a source or making artwork does not grant permission to rehost it.</span>
        </div>
      </header>

      <section className="mt-5 rounded-2xl border border-border bg-card p-5 card-shadow sm:p-6" aria-label="Tibetan source transcript access">
        <h2 className="font-display text-xl font-semibold text-foreground">Derge Tibetan source volumes</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          All 103 Kangyur and 213 Tengyur source-volume transcriptions can be browsed as pinned, byte-verified
          originals. These are source files, not work-level canonical readers or manuscript facsimiles.
          Publication of individual works still requires cross-volume and catalogue reconciliation.
        </p>
        <a href="/sacred-texts/tibetan-volumes" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          Browse the 316 verified Tibetan source volumes <ExternalLink className="h-4 w-4" />
        </a>
      </section>

      <section className="mt-7 space-y-5" aria-label="Unpublished source editions by tradition">
        {groups.map(([tradition, entries]) => (
          <details key={tradition} open={tradition === "Hinduism" || tradition === "Christianity" || tradition === "Buddhism"}
            className="group overflow-hidden rounded-2xl border border-border bg-card card-shadow">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-5 hover:bg-secondary/30 sm:px-6">
              <span className="min-w-0">
                <span className="block font-display text-xl font-semibold text-foreground sm:text-2xl">{tradition}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {entries.length} unpublished source {entries.length === 1 ? "record" : "records"}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-xl text-primary">+</span>
            </summary>
            <div className="grid gap-3 border-t border-border px-4 py-5 sm:grid-cols-2 sm:px-6">
              {entries.map((entry) => {
                const href = safeSourceHref(entry.source_url);
                return (
                  <article key={entry.title + ":" + entry.language + ":" + entry.edition} className="flex min-w-0 flex-col rounded-xl border border-border bg-background p-4">
                    <div className="flex items-start gap-3">
                      <FileText className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-lg font-semibold leading-snug text-foreground" dir="auto">{entry.title}</h3>
                        <p className="mt-1 text-xs text-muted-foreground" dir="auto">{entry.edition} · {entry.language}</p>
                        {entry.translator && <p className="mt-1 text-xs text-muted-foreground" dir="auto">{entry.translator}</p>}
                      </div>
                    </div>
                    <p className="mt-3 w-fit rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs font-semibold text-foreground">
                      {statusLabels[entry.status] ?? "Publication pending"}
                    </p>
                    {entry.acquired_coverage && <p className="mt-3 text-xs leading-relaxed text-muted-foreground" dir="auto">{entry.acquired_coverage}</p>}
                    <p className="mt-3 flex-1 text-xs leading-relaxed text-muted-foreground" dir="auto">
                      <strong className="text-foreground">Remaining blocker:</strong> {entry.rights_note}
                    </p>
                    <div className="mt-4 border-t border-border pt-3">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                          Publisher / source page <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : <span className="text-xs text-muted-foreground">No direct public source URL verified</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          </details>
        ))}
      </section>
      <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
        Available verified readers remain in the <a href="/sacred-texts" className="font-semibold text-primary underline">published sacred-text library</a>.
        No source appears there until it meets its edition-specific requirements.
      </p>
    </main>
  );
}
