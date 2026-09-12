// Pure manuscript-parsing logic, split out of library.ts so it can be unit
// tested without importing anything that touches Supabase or the browser.
export function splitManuscript(text: string): string[] {
  const byChapter = text
    .split(/\n(?=(?:chapter|باب|अध्याय|الفصل)\s)/im)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byChapter.length > 1) return byChapter;
  const paragraphs = text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < paragraphs.length; i += 4) {
    chunks.push(paragraphs.slice(i, i + 4).join("\n\n"));
  }
  return chunks.length ? chunks : [text.trim()];
}
