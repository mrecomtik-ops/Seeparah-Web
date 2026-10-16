import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Download, ExternalLink, ShieldCheck } from "lucide-react";
import tibetanManifest from "@/lib/sacred-tibetan-source-manifest.json";

const sourceConfig = {
  Kangyur: {
    repo: "derge-kangyur",
    revision: "a582cf471b7c85a101035071078032f106a8e536",
    introduction: "Derge Kangyur: the Esukhia-Barom source-volume transcription; not a verified work-by-work reader.",
  },
  Tengyur: {
    repo: "derge-tengyur",
    revision: "174653137d62af481f53c6ae3dc842bf8629323e",
    introduction: "Derge Tengyur: the Esukhia-Barom source-volume transcription; not a verified work-by-work reader.",
  },
} as const;
type Corpus = keyof typeof sourceConfig;
const PAGE_LENGTH = 25000;
const isCorpus = (value: unknown): value is Corpus => value === "Kangyur" || value === "Tengyur";
const parseVolume = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value :
  typeof value === "string" && /^[1-9]\d{0,3}$/.test(value) ? Number(value) : 1;

type VolumeEntry = (typeof tibetanManifest.volumes)[number];

export const Route = createFileRoute("/sacred-texts/tibetan-volumes")({
  validateSearch: (search: Record<string, unknown>) => ({
    corpus: isCorpus(search['corpus']) ? search['corpus'] : ("Kangyur" as Corpus),
    volume: parseVolume(search['volume']),
  }),
  head: () => ({
    meta: [
      { title: "Tibetan Source Volumes — Derge Kangyur & Tengyur | Seeparah" },
      { name: "description", content: "Browse byte-verified Esukhia Tibetan Kangyur and Tengyur source volumes with explicit unverified work-boundary labelling and preserved source markers." },
    ],
    links: [{ rel: "canonical", href: "https://seeparah.com/sacred-texts/tibetan-volumes" }],
  }),
  component: TibetanSourceVolumePage,
});

function href(corpus: Corpus, volume: number): string {
  return "/sacred-texts/tibetan-volumes?corpus=" + corpus + "&volume=" + volume;
}
function sourceUrl(volume: VolumeEntry): string {
  const cfg = sourceConfig[volume.corpus as Corpus];
  return "https://raw.githubusercontent.com/Esukhia/" + cfg.repo + "/" + cfg.revision +
    "/text/" + encodeURIComponent(volume.filename);
}
function volumeLabel(entry: VolumeEntry): string {
  return entry.filename.replace(/\.txt$/, "").replace(/^\d+_/, "").replace(/_/g, " ");
}

function TibetanSourceVolumePage() {
  const search = Route.useSearch();
  const corpus: Corpus = search.corpus;
  const volumes = useMemo(() =>
    tibetanManifest.volumes.filter((v) => v.corpus === corpus),
  [corpus]);
  const volume = volumes.find(v => v.volume === search.volume) ?? volumes[0]!;
  const [sourceText, setSourceText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [page, setPage] = useState(0);
  const url = sourceUrl(volume);

  useEffect(() => {
    const controller = new AbortController();
    setSourceText(null);
    setError("");
    setPending(true);
    setVerified(false);
    setPage(0);
    async function fetchVerifiedVolume() {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "force-cache" });
        if (!response.ok) throw new Error("The pinned source server returned HTTP " + response.status);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== volume.bytes) {
          throw new Error("Source length differs from the acquired verified file; cannot display it.");
        }
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
        if (hex !== volume.sha256) {
          throw new Error("Source SHA-256 differs from the acquired verified file; cannot display it.");
        }
        const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        if (!controller.signal.aborted) {
          setSourceText(decoded);
          setVerified(true);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "Unable to load this source volume.");
        }
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    }
    void fetchVerifiedVolume();
    return () => controller.abort();
  }, [url, volume.bytes, volume.sha256]);

  const count = sourceText == null ? 0 : Math.ceil(sourceText.length / PAGE_LENGTH);
  const safePage = Math.min(page, Math.max(0, count - 1));
  const displayedText = sourceText == null ? "" :
    sourceText.slice(safePage * PAGE_LENGTH, (safePage + 1) * PAGE_LENGTH);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <a href="/sacred-texts/sources" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Acquired source holdings
      </a>

      <header className="mt-6 rounded-3xl border border-border bg-card px-5 py-7 card-shadow sm:px-8 sm:py-9">
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">Source archive · original Tibetan · unsegmented</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-foreground sm:text-4xl">
          Derge {corpus} — source volumes
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{sourceConfig[corpus].introduction}</p>
        <div className="mt-4 rounded-xl border border-primary/20 bg-secondary/50 p-4 text-sm leading-relaxed text-foreground">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <strong>Not a complete, canonical work edition.</strong> These are original pinned source-volume
              transcriptions from Esukhia, not facsimile page images. Some works continue across volumes.
              Tohoku and folio markers, blank lines and editorial annotations remain visible.
              Text is fetched from its pinned original revision and is displayed only after verifying its
              exact byte count and SHA-256 against the acquired archive.
            </div>
          </div>
        </div>
      </header>

      <nav aria-label="Choose Tibetan source collection" className="mt-6 flex flex-wrap gap-2">
        {(["Kangyur", "Tengyur"] as const).map((option) => (
          <a key={option} href={href(option, 1)}
            aria-current={corpus === option ? "page" : undefined}
            className={"rounded-full border px-4 py-2 text-sm font-semibold transition-colors " +
              (corpus === option ? "border-primary bg-primary text-primary-foreground" :
              "border-border bg-card text-foreground hover:bg-secondary")}>
            Derge {option} ({option === "Kangyur" ? 103 : 213} volumes)
          </a>
        ))}
      </nav>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card card-shadow">
          <div className="border-b border-border px-4 py-5 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Source volume {volume.volume} of {volumes.length}{volume.catalogue ? " · source catalogue, not scripture text" : ""}
            </p>
            <h2 lang="bo" dir="ltr" className="mt-2 font-display text-xl font-semibold text-foreground sm:text-2xl">
              {volumeLabel(volume)}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {volume.bytes.toLocaleString()} original UTF-8 bytes · {volume.markerCount.toLocaleString()} Tohoku candidate markers · pinned source checksum
            </p>
            <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{volume.sha256}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                Open entire original source <ExternalLink className="h-4 w-4" />
              </a>
              <a href={url} download={volume.filename} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                Source file <Download className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div aria-live="polite" className="p-4 sm:p-6">
            {pending && <p className="flex items-center gap-2 text-sm text-muted-foreground"><BookOpen className="h-4 w-4" /> Loading and independently verifying source bytes…</p>}
            {error && <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
              <strong>Source could not be verified.</strong> {error} You can use the pinned original-source link above.
            </p>}
            {verified && sourceText != null && (
              <>
                <p className="mb-4 text-xs font-semibold text-primary">
                  Verified source SHA-256 and byte count. Displayed without rewriting.
                </p>
                <nav aria-label="Source text pagination" className="mb-4 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => setPage(v => Math.max(0,v-1))} disabled={safePage===0}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40">Previous segment</button>
                  <span className="text-xs text-muted-foreground">Segment {safePage+1} of {count}</span>
                  <button type="button" onClick={() => setPage(v => Math.min(count-1,v+1))} disabled={safePage>=count-1}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40">Next segment</button>
                </nav>
                <article lang="bo" dir="ltr" className="min-w-0 overflow-wrap-anywhere break-words whitespace-pre-wrap rounded-xl border border-border bg-background p-4 font-serif text-base leading-[2.0] text-foreground sm:p-6 sm:text-lg">
                  {displayedText}
                </article>
                <nav aria-label="Source text pagination bottom" className="mt-4 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => { setPage(v => Math.max(0,v-1)); }}
                    disabled={safePage===0} className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40">Previous segment</button>
                  <span className="text-xs text-muted-foreground">Segment {safePage+1} of {count}</span>
                  <button type="button" onClick={() => setPage(v => Math.min(count-1,v+1))}
                    disabled={safePage>=count-1} className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40">Next segment</button>
                </nav>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  Segments are display slices, not chapters, sutras, canonical verses or complete works.
                  The original source remains available through the full-file link above.
                </p>
              </>
            )}
          </div>
        </section>

        <aside className="min-w-0 rounded-2xl border border-border bg-card p-4 card-shadow sm:p-5">
          <h2 className="font-display text-lg font-semibold">Source-volume navigation</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {volumes.length} independent source volume files. Names and their original order are preserved.
          </p>
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            {volume.volume>1 && <a href={href(corpus,volume.volume-1)} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              <ArrowLeft className="h-4 w-4"/> Previous volume
            </a>}
            {volume.volume<volumes.length && <a href={href(corpus,volume.volume+1)} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Next volume <ArrowRight className="h-4 w-4"/>
            </a>}
          </div>
          <ol className="mt-4 max-h-[480px] space-y-1 overflow-y-auto rounded-xl border border-border p-2" aria-label="Volumes in source order">
            {volumes.map((entry) => (
              <li key={entry.filename}>
                <a href={href(corpus,entry.volume)} aria-current={entry.volume===volume.volume ? "page" : undefined}
                  className={"flex gap-2 rounded-lg px-2 py-2 text-xs transition-colors " + (entry.volume===volume.volume?
                    "bg-secondary font-semibold text-primary" : "text-foreground hover:bg-secondary/60")}>
                  <span className="w-6 shrink-0 text-right tabular-nums">{entry.volume}.</span>
                  <span lang="bo" className="min-w-0 break-words">{volumeLabel(entry)}</span>
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Attribution: Esukhia / Barom proofreading project, based on UVA-SOAS / Derge source material.
            The pinned source has documented editorial conventions; it is not a claim of exact diplomatic
            correspondence to every manuscript or woodblock image.
          </p>
        </aside>
      </div>
    </main>
  );
}
