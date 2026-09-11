import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  bookId: z.string(),
  language: z.string(),
  chunkIndex: z.number().int().min(0),
});

export const translateChunk = createServerFn({ method: "POST" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { bookId, language, chunkIndex } = data;
    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );

      const { data: book, error: bookError } = await supabaseAdmin
        .from("books")
        .select("id, title, source_language")
        .eq("id", bookId)
        .single();
      if (bookError || !book) throw new Error("Book not found");

      const { data: existing } = await supabaseAdmin
        .from("book_chunks")
        .select("content")
        .eq("book_id", bookId)
        .eq("language", language)
        .eq("chunk_index", chunkIndex)
        .maybeSingle();
      if (existing?.content) {
        return { content: existing.content as string, cached: true };
      }

      const { data: source, error: sourceError } = await supabaseAdmin
        .from("book_chunks")
        .select("content")
        .eq("book_id", bookId)
        .eq("language", book.source_language)
        .eq("chunk_index", chunkIndex)
        .single();
      if (sourceError || !source) throw new Error("Source chunk not found");

      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new Error("AI gateway not configured");

      const response = await fetch(
        "https://ai-gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3.1-flash-lite",
            messages: [
              {
                role: "system",
                content: `You are a literary translator for the reading app Seeparah. Translate the provided book passage from ${book.source_language} to ${language}, preserving tone, voice, paragraph breaks, and meaning. Return only the translated text, with no commentary or notes.`,
              },
              { role: "user", content: source.content },
            ],
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Translation failed [${response.status}]: ${body}`);
      }
      const result = await response.json();
      const translated = result?.choices?.[0]?.message?.content?.trim();
      if (!translated) throw new Error("Empty translation");

      await supabaseAdmin.from("book_chunks").upsert({
        book_id: bookId,
        language,
        chunk_index: chunkIndex,
        content: translated,
      });

      return { content: translated as string, cached: false };
    } catch (error) {
      console.error("translateChunk failed:", error);
      return { content: null, cached: false };
    }
  });
