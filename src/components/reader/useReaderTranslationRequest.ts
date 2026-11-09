import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Book } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyTranslationRequests,
  requestBookTranslationAccess,
} from "@/lib/admin/translation-access.functions";

/**
 * Reader translation requests register demand only. Approval, translation
 * rights, job creation, and publication remain separate privileged actions.
 */
export function useReaderTranslationRequest(book: Book, userId: string) {
  const queryClient = useQueryClient();
  const [requestLanguage, setRequestLanguage] = useState("");
  const [requestingTranslation, setRequestingTranslation] = useState(false);
  const requests = useQuery({
    queryKey: ["my-translation-requests", userId, book.id],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return [];
      return listMyTranslationRequests({ data: { accessToken: token } });
    },
    staleTime: 60_000,
  });
  const activeRequestStatus = (requests.data ?? []).find(
    (row) => row.book_id === book.id && row.language === requestLanguage,
  )?.status ?? null;

  async function handleTranslationRequest() {
    if (!requestLanguage || requestingTranslation ||
        book.content_classification === "religious" ||
        book.translation_generation_policy === "source_only") return;
    setRequestingTranslation(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.info("Sign in to submit a translation request.", {
          action: { label: "Sign in", onClick: () => window.location.assign("/auth") },
        });
        return;
      }
      const result = await requestBookTranslationAccess({
        data: { accessToken: token, bookId: book.id, language: requestLanguage },
      });
      await queryClient.invalidateQueries({
        queryKey: ["my-translation-requests", userId, book.id],
      });
      if (result.status === "requested") {
        toast.success(`${requestLanguage} request received. Rights and editorial approval are required before a translation can be made available.`);
      } else {
        toast.info(`${requestLanguage}: request status is ${result.status.replaceAll("_", " ")}.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit translation request");
    } finally {
      setRequestingTranslation(false);
    }
  }
  return {
    requestLanguage,
    setRequestLanguage,
    requestingTranslation,
    activeRequestStatus,
    handleTranslationRequest,
  };
}
