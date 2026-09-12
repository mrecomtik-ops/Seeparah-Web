import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Feather, Loader2, User as UserIcon } from "lucide-react";
import { getAuthorProfile, listBooksByAuthorId } from "@/lib/library";
import { BookCard } from "@/components/BookCard";

export const Route = createFileRoute("/author/$authorId")({
  head: () => ({
    meta: [
      { title: "Author — Seeparah" },
      { name: "description", content: "Published books and profile on Seeparah." },
    ],
  }),
  component: PublicAuthorPage,
});

function PublicAuthorPage() {
  const { authorId } = Route.useParams();
  const profileQuery = useQuery({
    queryKey: ["author-profile", authorId],
    queryFn: () => getAuthorProfile(authorId),
  });
  const booksQuery = useQuery({
    queryKey: ["author-books", authorId],
    queryFn: () => listBooksByAuthorId(authorId),
  });

  const profile = profileQuery.data;
  const books = booksQuery.data ?? [];
  const displayName = profile?.pen_name || books[0]?.author || "This author";

  if (profileQuery.isLoading || booksQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-8 sm:px-6">
        <Link
          to="/library"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Library
        </Link>

        <div className="mt-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-accent">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <UserIcon className="h-7 w-7 text-accent-foreground" />
            )}
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">{displayName}</h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Feather className="h-3.5 w-3.5" /> {books.length} published on Seeparah
            </p>
          </div>
        </div>

        {profile?.bio && (
          <p className="mt-5 max-w-2xl leading-relaxed text-foreground">{profile.bio}</p>
        )}

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">Books</h2>
          {books.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No published books yet.</p>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {books.map((b) => (
                <BookCard key={b.id} book={b} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
