/** Split a sourced Arabic Quran surah-opening Basmala for display ONLY.
 * Tanzil's original stored chunk is never edited or renumbered.
 * Surah 1:1 is itself the Basmala, and Surah 9 has no opening Basmala.
 */
export function separateUnnumberedQuranBasmala(input: {
  layout: string;
  language: string;
  canonicalRef: string;
  content: string;
}): { basmala: string | null; ayah: string } {
  const { layout, language, canonicalRef, content } = input;
  if (layout !== "quran" || language !== "Arabic") return { basmala: null, ayah: content };
  const matched = /(?:^|\s)(\d{1,3}):1$/.exec(canonicalRef.trim());
  const surah = Number(matched?.[1] ?? 0);
  if (surah < 2 || surah > 114 || surah === 9) return { basmala: null, ayah: content };
  const newline = content.indexOf("\n");
  if (newline < 1 || newline >= content.length - 1) return { basmala: null, ayah: content };
  const line = content.slice(0, newline);
  // The exact first line is already present in the immutable Arabic source.
  // A different source encoding must never trigger speculative splitting.
  if (!line.startsWith("بِسْمِ ٱللَّهِ") &&
      !line.startsWith("بِّسْمِ ٱللَّهِ")) return { basmala: null, ayah: content };
  return { basmala: line, ayah: content.slice(newline + 1) };
}

/** For the visible ayah's "Copy text" action, exclude an unnumbered
 * prelude, but never remove the numbered Basmala in Al-Fatiha 1:1. */
export function displayAyahTextForCopy(input: Parameters<typeof separateUnnumberedQuranBasmala>[0]): string {
  return separateUnnumberedQuranBasmala(input).ayah;
}
