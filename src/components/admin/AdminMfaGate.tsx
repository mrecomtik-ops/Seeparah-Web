// Enforces MFA for the admin surface using Supabase Auth's own TOTP support
// (supabase.auth.mfa.*) — real second-factor enforcement, not a UI-only
// checkbox. The server independently re-checks the session's aal claim on
// every admin server function (see require-admin.server.ts), so this
// component is about giving the admin a way to satisfy that requirement,
// not about being the actual boundary.
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Step = "loading" | "needs_enroll" | "needs_challenge" | "satisfied";

export function AdminMfaGate({ onSatisfied }: { onSatisfied: () => void }) {
  const [step, setStep] = useState<Step>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === "aal2") {
      setStep("satisfied");
      onSatisfied();
      return;
    }
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp.find((f) => f.status === "verified");
    if (verified) {
      setFactorId(verified.id);
      const { data: challenge, error } = await supabase.auth.mfa.challenge({
        factorId: verified.id,
      });
      if (error) {
        toast.error("Couldn't start an MFA challenge — try refreshing.");
        return;
      }
      setChallengeId(challenge.id);
      setStep("needs_challenge");
    } else {
      setStep("needs_enroll");
    }
  }

  async function startEnroll() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error || !data) throw error ?? new Error("Enrollment failed");
      setFactorId(data.id);
      setQrDataUrl(`data:image/svg+xml;utf8,${encodeURIComponent(data.totp.qr_code)}`);
      setSecret(data.totp.secret);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start MFA enrollment");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnroll() {
    if (!factorId) return;
    setBusy(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError || !challenge)
        throw challengeError ?? new Error("Could not start challenge");
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
      toast.success("MFA enabled for this account");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That code didn't verify — try again");
    } finally {
      setBusy(false);
    }
  }

  async function verifyChallenge() {
    if (!factorId || !challengeId) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
      if (error) throw error;
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That code didn't verify — try again");
    } finally {
      setBusy(false);
    }
  }

  if (step === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (step === "satisfied") return null;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-6 card-shadow">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="font-display text-lg font-semibold text-foreground">
            {step === "needs_enroll" ? "Set up multi-factor authentication" : "Enter your MFA code"}
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Admin actions on Seeparah require MFA on every session — this is enforced server-side, not
          just here.
        </p>

        {step === "needs_enroll" && !qrDataUrl && (
          <button
            onClick={startEnroll}
            disabled={busy}
            className="mt-5 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Starting…" : "Set up an authenticator app"}
          </button>
        )}

        {step === "needs_enroll" && qrDataUrl && (
          <div className="mt-5 space-y-3">
            <img
              src={qrDataUrl}
              alt="MFA QR code"
              className="mx-auto h-40 w-40 rounded-lg border border-border bg-white p-2"
            />
            {secret && (
              <p className="break-all text-center text-xs text-muted-foreground">
                Can't scan? Enter this key manually: <span className="font-mono">{secret}</span>
              </p>
            )}
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-center text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={verifyEnroll}
              disabled={busy || code.length < 6}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify and enable"}
            </button>
          </div>
        )}

        {step === "needs_challenge" && (
          <div className="mt-5 space-y-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code from your authenticator app"
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-center text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={verifyChallenge}
              disabled={busy || code.length < 6}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
