import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import logoAsset from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Seeparah" },
      {
        name: "description",
        content:
          "Sign in to Seeparah to sync your library, highlights and reading progress across every device.",
      },
      { property: "og:title", content: "Sign in — Seeparah" },
      {
        property: "og:description",
        content: "Sync your library, highlights and progress across devices.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) navigate({ to: "/library", replace: true });
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function handleGoogle() {
    setGoogleBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in didn't complete. Try email instead.");
      setGoogleBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/library" });
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      toast.error("Enter your email and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            ...(name.trim() ? { data: { full_name: name.trim() } } : {}),
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          return;
        }
        toast.success("Welcome to Seeparah");
        navigate({ to: "/library" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        toast.success("Welcome back");
        navigate({ to: "/library" });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "That didn't work — try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring";

  return (
    <div className="flex min-h-screen items-center justify-center paper-texture px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="rounded-3xl border border-border bg-card p-7 card-shadow-lg sm:p-9">
          <div className="flex items-center gap-3">
            <img
              src={logoAsset.url}
              alt="Seeparah logo"
              className="h-11 w-11 rounded-2xl"
              width={44}
              height={44}
            />
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                {mode === "signin" ? "Sign in" : "Create your account"}
              </h1>
              <p className="text-xs text-muted-foreground">
                Your library, highlights and progress on every device.
              </p>
            </div>
          </div>

          {sent ? (
            <div className="mt-7 rounded-2xl border border-border bg-secondary/50 p-5 text-center">
              <Mail className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 font-display text-lg font-semibold text-foreground">
                Check your email
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                We sent a confirmation link to {email}. Open it and you'll be
                signed in.
              </p>
            </div>
          ) : (
            <>
              <button
                onClick={handleGoogle}
                disabled={googleBusy}
                className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
              >
                {googleBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleMark />
                )}
                {googleBusy ? "Opening Google…" : "Sign in with Google"}
              </button>

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  or
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleEmail} className="space-y-3">
                {mode === "signup" && (
                  <input
                    className={inputCls}
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                )}
                <input
                  className={inputCls}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <input
                  className={inputCls}
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  required
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === "signin" ? "Sign in" : "Create account"}
                </button>
              </form>

              <p className="mt-5 text-center text-sm text-muted-foreground">
                {mode === "signin" ? "New to Seeparah?" : "Already have an account?"}{" "}
                <button
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  className="font-semibold text-primary hover:underline"
                >
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </div>

        <Link
          to="/library"
          className="mt-5 block text-center text-sm font-semibold text-primary hover:underline"
        >
          Try demo — read without an account
        </Link>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
      />
    </svg>
  );
}
