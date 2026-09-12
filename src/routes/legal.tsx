import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/legal")({
  head: () => ({ meta: [{ title: "Legal & support — Seeparah" }] }),
  component: LegalPage,
});

function DraftNotice() {
  return (
    <p className="mb-4 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-secondary-foreground">
      DRAFT — placeholder text. Replace with reviewed legal copy before launch.
    </p>
  );
}

function LegalPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 pb-20 pt-8 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold text-foreground">Legal & support</h1>

        <section id="support" className="mt-8">
          <h2 className="font-display text-xl font-semibold text-foreground">Support & billing help</h2>
          <DraftNotice />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Support contact isn't configured yet — add a real support email or help-desk link here
            before launch. Do not point users at an address that isn't monitored.
          </p>
        </section>

        <section id="copyright" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">Copyright / DMCA reporting</h2>
          <DraftNotice />
          <p className="text-sm leading-relaxed text-muted-foreground">
            To report copyrighted or infringing content, contact the address above once configured,
            with the book title, the URL, and a description of the rights concerned. This section
            needs a reviewed DMCA/copyright policy before launch — the "Report translation issue"
            button in the reader handles translation-quality reports, not rights disputes.
          </p>
        </section>

        <section id="privacy" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">Privacy</h2>
          <DraftNotice />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Seeparah stores account information, reading progress, highlights and notes, and
            subscription records to operate the service. A full privacy policy describing data
            retention, third-party processors (Supabase, the AI translation provider, and any
            payment processor), and user rights needs legal review before launch.
          </p>
        </section>

        <section id="terms" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">Terms of service</h2>
          <DraftNotice />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Authors publishing on Seeparah confirm they hold the rights to their manuscript and
            grant Seeparah permission to translate and host it (see the publishing form). A full
            terms-of-service document — covering subscriptions, refunds, content standards and
            account termination — needs legal review before launch.
          </p>
        </section>
      </main>
    </div>
  );
}
