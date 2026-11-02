import { toast } from "sonner";
import { getAccessToken } from "@/lib/admin/use-admin-session";
import { adminSetEditionAccessType } from "@/lib/admin/catalog.functions";

export interface AdminAccessBook {
  source_language: string;
  content_classification: string;
  categories: string[] | null;
}
export interface AdminAccessEdition {
  language: string;
  access_type: string;
}

/** Rendering-only extraction of access and safe-category panels.
 * Server-controlled authorization and the protected Religious category rule
 * remain exactly where they were before this refactor. */
export function AdminBookAccessCategories({
  book, bookId, editions, canPublish, busy, withBusy, categoriesBusy,
  masterCategories, toggleCategory,
}: {
  book: AdminAccessBook;
  bookId: string;
  editions: AdminAccessEdition[];
  canPublish: boolean;
  busy: boolean;
  withBusy: (task: () => Promise<void>) => Promise<void>;
  categoriesBusy: boolean;
  masterCategories: string[];
  toggleCategory: (category: string, current: string[]) => void | Promise<void>;
}) {
  return (
    <>
      <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
        <h2 className="font-display text-base font-semibold text-foreground">Access</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every original-language edition is permanently free. General translated editions are
          monthly-plan content when monetization is active. Religious books and all of their
          verified sourced editions are permanently free.
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm">
          <span className="font-medium text-foreground">
            Original edition ({book.source_language})
          </span>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
            Always free
          </span>
        </div>

        {editions.length > 0 && (
          <ul className="mt-2 space-y-2">
            {editions.map((ed) => (
              <li
                key={ed.language}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-foreground">{ed.language} translation</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ed.access_type === "paid" ? "bg-gold/20 text-gold-foreground" : "bg-accent text-accent-foreground"}`}
                  >
                    {ed.access_type === "paid" ? "Premium" : "Free"}
                  </span>
                  {book.content_classification === "religious" ? (
                    <span className="text-[11px] text-muted-foreground">Always free</span>
                  ) : canPublish ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        withBusy(async () => {
                          const next = ed.access_type === "paid" ? "free" : "paid";
                          await adminSetEditionAccessType({
                            data: {
                              accessToken: await getAccessToken(),
                              bookId,
                              language: ed.language,
                              accessType: next,
                            },
                          });
                          toast.success(
                            `${ed.language} edition set to ${next === "paid" ? "Premium" : "Free"}`,
                          );
                        })
                      }
                      className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
                    >
                      Switch to {ed.access_type === "paid" ? "Free" : "Premium"}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {editions.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            No published translated editions yet — access settings appear here once one is reviewed
            and published below.
          </p>
        )}
      </section>

      {canPublish && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 card-shadow">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">Categories</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Click a category to add or remove it from this book. Author-selected categories can
                be corrected here before publication. Only categories in Admin Settings can be used.
              </p>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
              {(book.categories ?? []).length} selected
            </span>
          </div>
          {masterCategories.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              No categories defined yet — add some to the "categories" setting in Admin Settings
              first.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {masterCategories.map((c) => {
                const active = (book.categories ?? []).includes(c);
                return (
                  <button
                    key={c}
                    disabled={categoriesBusy || c === "Religious"}
                    title={
                      c === "Religious"
                        ? book.content_classification === "religious"
                          ? "Religious is protected here. Use Content policy & typography for an owner-only downgrade."
                          : "Religious is a protected classification. Use Content policy & typography to enable its free/source-only safeguards."
                        : undefined
                    }
                    onClick={() => toggleCategory(c, book.categories ?? [])}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-background text-foreground hover:bg-secondary"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </>
  );
}
