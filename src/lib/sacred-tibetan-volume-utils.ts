/** Validated navigation and byte-verification helpers for acquired Tibetan source volumes. */
export type TibetanCorpus = "Kangyur" | "Tengyur";

export function validateTibetanSearch(
  search: Record<string, unknown>,
  limits: Readonly<Record<TibetanCorpus, number>>,
): { corpus: TibetanCorpus; volume: number } {
  const corpus: TibetanCorpus =
    search["corpus"] === "Tengyur" ? "Tengyur" : "Kangyur";
  const candidate = search["volume"];
  const volume = typeof candidate === "number" && Number.isInteger(candidate)
    ? candidate
    : typeof candidate === "string" && /^[1-9]\d{0,3}$/.test(candidate)
      ? Number(candidate)
      : 1;
  return { corpus, volume: volume > 0 && volume <= limits[corpus] ? volume : 1 };
}

export type SourceIntegrity = { bytes: number; sha256: string };

export async function verifyTibetanSourceBytes(
  data: ArrayBuffer,
  source: SourceIntegrity,
): Promise<string> {
  if (data.byteLength !== source.bytes) {
    throw new Error("Source length differs from the acquired verified file; cannot display it.");
  }
  const digest = await crypto.subtle.digest("SHA-256", data);
  const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  if (actual !== source.sha256) {
    throw new Error("Source SHA-256 differs from the acquired verified file; cannot display it.");
  }
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);
}

export async function fetchVerifiedTibetanSource(
  url: string,
  source: SourceIntegrity,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher(url, { signal: signal ?? null, cache: "force-cache" });
  if (!response.ok) throw new Error("The pinned source server returned HTTP " + response.status);
  return verifyTibetanSourceBytes(await response.arrayBuffer(), source);
}
