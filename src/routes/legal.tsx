import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createPublicReport } from "@/lib/admin/support.functions";

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

function PublicReportForm() {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (subject.trim().length < 3 || description.trim().length < 1) {
      toast.error("Please fill in a subject and description");
      return;
    }
    setBusy(true);
    try {
      await createPublicReport({
        data: {
          subject: subject.trim(),
          description: description.trim(),
          contactEmail: email.trim() || undefined,
          honeypot: honeypot || undefined,
        },
      });
      setSent(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't submit — try again in a moment",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm text-secondary-foreground">
        Received. If you left an email, our team may follow up there — there's no automated
        confirmation email yet.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <input
        type="text"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={`Subject (e.g. "Can't sign in with Google")`}
        className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What's happening?"
        rows={4}
        className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email (optional, if you'd like a reply)"
        className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="submit"
        disabled={busy}
        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send report
      </button>
    </form>
  );
}

function LegalPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-2xl px-4 pb-20 pt-8 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold text-foreground">
          Legal & support
        </h1>

        <section id="support" className="mt-8">
          <h2 className="font-display text-xl font-semibold text-foreground">
            Support & billing help
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            Can't sign in, or something else broken? Use this form — it reaches our support queue
            directly (no account needed). If you're signed in, use the in-app support option in your
            profile instead so it's linked to your account.
          </p>
          <PublicReportForm />
        </section>

        <section id="copyright" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">
            Copyright / DMCA reporting
          </h2>
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
