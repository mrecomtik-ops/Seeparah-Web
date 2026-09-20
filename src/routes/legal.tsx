import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SupportRequestForm } from "@/components/legal/SupportRequestForm";
import { CopyrightRequestForm } from "@/components/legal/CopyrightRequestForm";

export const Route = createFileRoute("/legal")({
  head: () => ({ meta: [{ title: "Legal & support — Seeparah" }] }),
  component: LegalPage,
});

const LAST_UPDATED = "2026-09-20";

// Exported (in addition to being wired as the route's component below) so
// it can be rendered directly in tests without a full router harness.
export function LegalPage() {
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
          Legal &amp; support
        </h1>

        {/* ------------------------------------------------------------- */}
        <section id="privacy" className="mt-8">
          <h2 className="font-display text-xl font-semibold text-foreground">Privacy</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              This describes what Seeparah actually collects and does with it today, in plain
              language. It's updated as the product changes — the date at the bottom of this
              section shows when it was last revised.
            </p>

            <p className="font-semibold text-foreground">Information we collect</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-semibold text-foreground">Account information</span> — your
                email address and sign-in method, whether that's Google authentication or
                email/password through Supabase Auth. If you sign in with Google, we receive the
                basic profile information Google shares for authentication (typically your name
                and email address).
              </li>
              <li>
                <span className="font-semibold text-foreground">Profile and reading activity</span>{" "}
                — your reading progress, highlights, notes, and saved/favorite/want-to-read
                shelves, tied to your account so they're available wherever you sign in.
              </li>
              <li>
                <span className="font-semibold text-foreground">Manuscript submissions</span> — if
                you publish, your manuscript text, author name or pen name, bio, and the rights
                information you provide, used to review and (if approved) publish your work.
              </li>
              <li>
                <span className="font-semibold text-foreground">Translation requests</span> — the
                book, language, and requesting account for any translation you request, used to
                track and review the request and grant access if approved.
              </li>
              <li>
                <span className="font-semibold text-foreground">Support and legal requests</span> —
                what you submit through the support and copyright forms on this page (name, reply
                email, and the content of your request), used to respond to and, where relevant,
                act on it.
              </li>
              <li>
                <span className="font-semibold text-foreground">Technical and security data</span> —
                for anonymous form submissions, a hashed (never raw) copy of your IP address, used
                only to limit abuse of that form. We don't otherwise track your browsing beyond
                what's needed to operate the reading experience itself.
              </li>
              <li>
                Reading streak/goal data is kept only on your own device (browser local storage) —
                it isn't sent to us and doesn't sync across devices.
              </li>
            </ul>

            <p className="font-semibold text-foreground">How we use it</p>
            <p>
              Each category above is used only for the purpose it's collected for: operating your
              account and reading experience, evaluating and publishing manuscripts you submit,
              handling translation requests, and responding to support and legal requests. We
              don't sell personal information, and we don't use your reading activity for
              advertising.
            </p>

            <p className="font-semibold text-foreground">Who else sees it</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-semibold text-foreground">Supabase</span> — our database,
                authentication, and backend infrastructure provider. Account and activity data is
                stored in Supabase's infrastructure.
              </li>
              <li>
                <span className="font-semibold text-foreground">Netlify</span> — hosts the
                Seeparah website and runs its server-side request handling.
              </li>
              <li>
                <span className="font-semibold text-foreground">Google</span> — only if you choose
                Google authentication, for that sign-in itself; and separately, manuscript text may
                be sent to the configured translation provider (currently Google's Gemini) only
                when translation processing is enabled and actually run for that manuscript — this
                never includes your personal reading activity, highlights, or account information.
              </li>
              <li>
                <span className="font-semibold text-foreground">
                  No payment processor is active today.
                </span>{" "}
                Seeparah is free during launch — no payment information is collected or processed.
                If a paid plan launches later, this section will name the payment processor before
                any payment data is collected.
              </li>
            </ul>

            <p className="font-semibold text-foreground">Admin access</p>
            <p>
              A small number of authorized staff can access account and content data to operate
              the service — reviewing submissions, responding to support and legal requests, and
              moderating content. Administrative actions that change data are designed to record
              who did it, when, and why, as part of the same operation — we don't claim that
              logging can never fail (for example, if the log write itself hits an infrastructure
              problem), but a failure there is treated as an error to investigate, not something
              silently accepted. Staff cannot grant themselves elevated access, and the admin
              system requires a second sign-in factor (MFA) in addition to a password or Google
              sign-in.
            </p>

            <p className="font-semibold text-foreground">Cookies and local storage</p>
            <p>
              Seeparah uses essential session storage (cookies and/or browser local storage,
              depending on how you sign in) to keep you signed in and to remember basic reading
              preferences. This is functional, not advertising or third-party tracking.
            </p>

            <p className="font-semibold text-foreground">How long we keep it</p>
            <p>
              We keep account and activity data for as long as your account is active, and
              afterward for as long as reasonably needed for operational, security, dispute, or
              legal reasons — for example, records related to a support request, a copyright
              notice, or misuse of the service may be kept longer than ordinary account data. We
              don't commit to a fixed retention period beyond that, since the right length depends
              on the reason the data is being kept.
            </p>

            <p className="font-semibold text-foreground">Your choices</p>
            <p>
              You can edit or delete your own highlights, notes, and reading progress from within
              the app. To request a copy of your data, a correction, deletion, or to withdraw a
              submission, use the{" "}
              <a href="#support" className="font-semibold text-foreground underline">
                support form
              </a>{" "}
              below and select "Privacy request" — we don't publish a direct contact address, so
              this form is the way to reach us for any of these requests.
            </p>
            <p>
              Deleting your account removes your profile and sign-in access; content you
              submitted and published (a book you authored, for example) may be retained if
              removing it would affect other readers, along with records we're required to keep
              for the operational, security, dispute, or legal reasons above.
            </p>

            <p className="font-semibold text-foreground">Security</p>
            <p>
              We use reasonable technical and organizational measures to protect your information,
              including access controls and MFA for administrative access. No system is perfectly
              secure, and we can't guarantee that information will never be accessed, disclosed,
              or lost as a result of a breach of these measures.
            </p>

            <p className="font-semibold text-foreground">International processing</p>
            <p>
              Our infrastructure providers may store and process data in countries other than the
              one you're in. Where that happens, it's as part of how those providers operate their
              services, not a separate transfer we initiate for another purpose.
            </p>

            <p className="font-semibold text-foreground">Children</p>
            <p>
              Seeparah isn't directed at children, and account creation requires the ability to
              consent to this policy. If you believe a child has provided us with personal
              information without appropriate consent, contact us through the support form and
              select "Privacy request" so we can review and act on it.
            </p>

            <p className="font-semibold text-foreground">Changes to this policy</p>
            <p>
              We may update this policy as the product changes. Material changes will be reflected
              here with an updated date below.
            </p>
            <p className="text-xs">Last updated: {LAST_UPDATED}</p>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        <section id="terms" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">Terms of service</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>By creating an account or using Seeparah, you agree to the terms below.</p>

            <p className="font-semibold text-foreground">Free during launch</p>
            <p>
              Every book and every available language edition is free to read while Seeparah is in
              launch. There's no checkout and no active paid tier right now. If paid plans launch
              later, pricing, refund terms, and any author revenue arrangement will be published
              here in advance of being enabled — not applied retroactively or without notice.
            </p>

            <p className="font-semibold text-foreground">Reader and author accounts</p>
            <p>
              Creating an account lets you save reading progress, highlights, and shelves, and
              (if you choose) submit manuscripts as an author. You're responsible for keeping your
              account credentials secure and for the accuracy of what you submit.
            </p>

            <p className="font-semibold text-foreground">Author responsibility and license</p>
            <p>
              An author submitting a manuscript confirms they own the rights to it, or have the
              rights holder's permission to publish and translate it, and is responsible for the
              accuracy of that confirmation. By submitting, you grant Seeparah a license to host,
              review, format, translate, display, and distribute the approved content on the
              platform — this license is for operating the service, not a transfer of your
              underlying rights in the work.
            </p>

            <p className="font-semibold text-foreground">How publishing works</p>
            <p>
              Submitting a manuscript doesn't publish it: an administrator reviews rights and
              edition quality before anything reaches the public library. English and Urdu are the
              standard translation targets prepared for every accepted book; readers can request
              additional languages (currently Hindi and Arabic), and a requested translation is
              produced and reviewed before being made available — we don't promise instant or
              universal translation into every language, or that every request will be approved.
              An author may withdraw (unpublish) their own book at any time; a published book can't
              be silently edited in place — revising it goes through the same review as a new
              submission.
            </p>

            <p className="font-semibold text-foreground">Prohibited use</p>
            <p>
              You agree not to submit content you don't have the rights to, impersonate another
              person or entity, scrape or bulk-extract content from the service, attempt to
              bypass access controls, attack or disrupt the service, or otherwise misuse or abuse
              the platform.
            </p>

            <p className="font-semibold text-foreground">Enforcement and appeals</p>
            <p>
              We may remove content, restrict access, or suspend or remove accounts that violate
              these terms, infringe someone else's rights, or abuse the service. Suspending an
              account blocks future sign-in; it doesn't instantly invalidate a session already in
              progress. If you believe an enforcement action was made in error, you can appeal
              through the{" "}
              <a href="#support" className="font-semibold text-foreground underline">
                support form
              </a>
              .
            </p>

            <p className="font-semibold text-foreground">Availability</p>
            <p>
              We aim to keep Seeparah available, but the service may be unavailable at times for
              maintenance, updates, or reasons outside our control, and its features may change as
              the product develops.
            </p>

            <p className="font-semibold text-foreground">No current paid plan</p>
            <p>
              Seeparah does not currently have an active paid plan, and makes no commitment today
              regarding future pricing, author payouts, or revenue sharing. Any such commitment
              will be described in these terms before it takes effect, not implied by anything
              elsewhere on the site.
            </p>

            <p className="font-semibold text-foreground">Disclaimer and limitation of liability</p>
            <p>
              Seeparah is provided on an "as is" and "as available" basis, without warranties of
              any kind, express or implied, to the fullest extent permitted by applicable law. To
              the fullest extent permitted by applicable law, Seeparah is not liable for indirect,
              incidental, or consequential damages arising from your use of the service. Nothing
              here is intended to exclude any liability that can't be excluded under the law that
              applies to you.
            </p>

            <p className="font-semibold text-foreground">Changes to these terms</p>
            <p>
              We may update these terms as the product changes. Material changes — in particular,
              anything affecting pricing or an author revenue arrangement — will be announced on
              this page before taking effect. Questions about these terms can be sent through the{" "}
              <a href="#support" className="font-semibold text-foreground underline">
                support form
              </a>
              .
            </p>
            <p className="text-xs">Last updated: {LAST_UPDATED}</p>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        <section id="copyright" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">Copyright</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Seeparah respects copyright and expects authors to as well. Every book on Seeparah
              has a stated rights basis (public domain, or rights confirmed by the submitting
              author) recorded and reviewed before publication — see "Author responsibility and
              license" under Terms above.
            </p>
            <p>
              If you believe a book, translation, or other content on Seeparah infringes your
              copyright or other rights, use the copyright form below to send us a notice. A
              complete notice should include:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Identification of the copyrighted work you believe is infringed.</li>
              <li>The exact Seeparah URL of the content in question.</li>
              <li>Your contact information, so we can follow up.</li>
              <li>
                An explanation of your ownership of, or authority to act on behalf of, the rights
                holder.
              </li>
              <li>
                A statement that you have a good-faith belief the use isn't authorized by the
                rights holder, its agent, or the law.
              </li>
              <li>
                A statement that the information you provide is accurate, and an electronic
                signature (your typed full name).
              </li>
            </ul>
            <p>
              We review notices and may temporarily restrict or remove access to the content while
              we do. If we need clarification to evaluate a notice, we'll ask for it through the
              reply address you provide; content may be restored if a notice is withdrawn, found
              incomplete, or successfully countered.
            </p>
            <p className="font-semibold text-foreground">Counter-notices</p>
            <p>
              If you believe content of yours was restricted or removed in error or
              misidentification, you can submit a counter-notice using the same form below,
              selecting "Counter-notice." A counter-notice should identify the material, explain
              why you believe the restriction was a mistake, and include the same accuracy
              statement and signature as an infringement notice.
            </p>
            <p>
              The specific legal procedures and protections that apply to a copyright notice or
              counter-notice depend on the law that applies to you and to the content in question
              — we don't claim a specific registered legal process (such as a formal U.S. DMCA
              agent registration) here, and reviewing a notice under this process doesn't
              constitute legal advice about your rights.
            </p>
            <p>
              The "Report translation issue" button inside the reader is for translation-quality
              problems, not rights disputes — use this copyright form for rights concerns instead.
            </p>

            <div className="mt-4">
              <CopyrightRequestForm />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- */}
        <section id="support" className="mt-10">
          <h2 className="font-display text-xl font-semibold text-foreground">Support</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Use this form for account and login issues, reading or progress problems, manuscript
              and publication questions, translation requests, general complaints, safety or abuse
              reports, privacy requests, and accessibility issues — pick the closest category
              below. For copyright infringement notices or counter-notices, use the{" "}
              <a href="#copyright" className="font-semibold text-foreground underline">
                dedicated copyright form
              </a>{" "}
              above instead.
            </p>
            <p>
              You'll receive a reference number after submitting. We review every request, but we
              can't promise a fixed response time.
            </p>
          </div>
          <div className="mt-4">
            <SupportRequestForm />
          </div>
        </section>
      </main>
    </div>
  );
}
