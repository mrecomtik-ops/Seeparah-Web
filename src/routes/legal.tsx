import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createPublicReport } from "@/lib/admin/support.functions";

export const Route = createFileRoute("/legal")({
  head: () => ({ meta: [{ title: "Legal & support — Seeparah" }] }),
  component: LegalPage,
});

/** The only two facts these pages need that can't be written from the
 * product's own behavior: a real, monitored contact address, and the
 * legal entity/jurisdiction for the Terms. Everything else on this page
 * describes what Seeparah actually does today. This is a good-faith,
 * plain-language draft reflecting current practice — not a substitute for
 * a lawyer's review once there's real payment processing or a larger user
 * base to account for. */
function PlaceholderNotice({ what }: { what: string }) {
  return (
    <p className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs font-semibold text-foreground">
      [{what} — fill in before relying on this page; see the operator notes in this file]
    </p>
  );
}
const CONTACT_EMAIL = "[CONTACT EMAIL NOT YET SET]";
const LEGAL_ENTITY = "[LEGAL ENTITY / OPERATOR NAME NOT YET SET]";
const GOVERNING_LAW = "[GOVERNING LAW / JURISDICTION NOT YET SET]";

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
          <PlaceholderNotice what="Rights-report contact address" />
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              If you believe a book, translation, or other content on Seeparah infringes your
              copyright or other rights, send a notice to{" "}
              <span className="font-semibold text-foreground">{CONTACT_EMAIL}</span> including:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>The specific work you believe is infringed, and the Seeparah URL of the content.</li>
              <li>Your contact information (name and email address).</li>
              <li>
                A statement that you have a good-faith belief the use is not authorized by the
                rights holder, its agent, or the law.
              </li>
              <li>A statement, under penalty of perjury, that the information is accurate and that you are the rights holder or authorized to act on their behalf.</li>
              <li>Your physical or electronic signature.</li>
            </ul>
            <p>
              We review reports and remove or restrict access to content we determine to be
              infringing. Every book on Seeparah has a stated rights basis (public domain, or
              rights confirmed by the submitting author) recorded and reviewed before publication
              — see "How publishing works" under Terms below. The "Report translation issue"
              button inside the reader is for translation-quality problems, not rights disputes —
              use this contact for rights concerns instead.
            </p>
          </div>
        </section>

        <section id="privacy" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">Privacy</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              This describes what Seeparah actually collects and does with it today. It will be
              updated as the product changes — check back if you're relying on specifics.
            </p>
            <p className="font-semibold text-foreground">What we collect</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Account information: your email address and sign-in method (Google or email/password), via Supabase Auth.</li>
              <li>Reading activity: your reading progress, highlights, notes, and saved/favorite/want-to-read shelves, tied to your account.</li>
              <li>
                If you publish: your manuscript text, author name/pen name, bio, and the rights
                information you provide when submitting.
              </li>
              <li>If you contact support: the content of your message and, for anonymous "can't sign in" reports, a hashed (not raw) copy of your IP address, used only to limit abuse of that form.</li>
              <li>Reading streak/goal data is kept only on your own device (browser local storage) — it is not sent to us and does not sync across devices.</li>
            </ul>
            <p className="font-semibold text-foreground">Who else sees it</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><span className="font-semibold text-foreground">Supabase</span> — our database, authentication, and backend hosting provider. Your account and activity data is stored in Supabase's infrastructure.</li>
              <li><span className="font-semibold text-foreground">Google Gemini</span> — used to prepare translated editions of books. Manuscript text is sent to Gemini for translation processing; Gemini is not used on your personal reading activity, highlights, or account information.</li>
              <li>
                <span className="font-semibold text-foreground">No payment processor is active today.</span>{" "}
                Seeparah is free during launch — no payment information is collected or processed.
                If paid plans launch later, this section will name the payment processor before
                any payment data is collected.
              </li>
            </ul>
            <p className="font-semibold text-foreground">Admin access</p>
            <p>
              A small number of authorized administrators can access account and content data to
              operate the service (review submissions, respond to support requests, moderate
              content). Every administrative action that changes data is logged with who did it,
              when, and why; administrators cannot grant themselves elevated access, and access to
              the admin system requires a second sign-in factor (MFA) in addition to a password or
              Google sign-in.
            </p>
            <p className="font-semibold text-foreground">Your choices</p>
            <p>
              You can edit or delete your highlights and reading progress from within the app. To
              request a copy of your data or full account deletion, contact{" "}
              <span className="font-semibold text-foreground">{CONTACT_EMAIL}</span>.
            </p>
          </div>
        </section>

        <section id="terms" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">Terms of service</h2>
          <PlaceholderNotice what="Legal entity name and governing-law jurisdiction" />
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Seeparah is operated by {LEGAL_ENTITY}. These terms are governed by the laws of{" "}
              {GOVERNING_LAW}. By creating an account or using Seeparah, you agree to the terms
              below.
            </p>
            <p className="font-semibold text-foreground">Free during launch</p>
            <p>
              Every book and every available language edition is free to read while Seeparah is in
              launch. There is no checkout and no premium tier active right now. If paid
              subscriptions launch later, pricing, refund terms, and the author revenue split will
              be published here in advance of being enabled — not applied retroactively or without
              notice.
            </p>
            <p className="font-semibold text-foreground">How publishing works</p>
            <p>
              An author submitting a manuscript confirms they hold the rights to publish and
              translate it, and grants Seeparah a license to host, translate, and display it on the
              platform. Submitting a manuscript does not publish it: an administrator reviews
              rights and edition quality before anything reaches the public library. English and
              Urdu are the standard translation targets prepared for every accepted book; readers
              can request additional languages (currently Hindi and Arabic), subject to
              administrator approval. An author may withdraw (unpublish) their own book at any
              time; a published book cannot be silently edited in place — revising it goes through
              the same review as a new submission.
            </p>
            <p className="font-semibold text-foreground">Account standards</p>
            <p>
              You're responsible for the accuracy of what you submit, including your rights
              confirmation. We may suspend or remove content or accounts that infringe someone
              else's rights, violate this policy, or abuse the service (including automated
              scraping or attempts to bypass access controls). Suspending an account blocks future
              sign-in; it does not instantly invalidate a session already in progress.
            </p>
            <p className="font-semibold text-foreground">Changes</p>
            <p>
              We may update these terms as the product changes. Material changes (in particular,
              anything affecting pricing or the author revenue split) will be announced on this
              page before taking effect.
            </p>
            <p>
              Questions about these terms:{" "}
              <span className="font-semibold text-foreground">{CONTACT_EMAIL}</span>.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
