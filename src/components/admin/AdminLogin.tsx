import { useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { supabase } from "@/integrations/ads/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2, ArrowLeft, MailCheck } from "lucide-react";

const HCAPTCHA_SITE_KEY =
  (import.meta.env["VITE_ADS_HCAPTCHA_SITE_KEY"] as string | undefined)?.trim() || "";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha | null>(null);

  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [resetSent, setResetSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (HCAPTCHA_SITE_KEY && !captchaToken) {
      setError("Complète la vérification anti-robot avant de continuer.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
    if (error) {
      captchaRef.current?.resetCaptcha();
      setCaptchaToken(null);
      const msg = error.message.toLowerCase();
      if (msg.includes("email not confirmed")) {
        setError("Ce compte n'est pas encore confirmé. Valide l'email d'activation puis réessaie.");
      } else if (msg.includes("invalid login credentials")) {
        setError(
          "Email ou mot de passe incorrect. Le compte doit exister dans le backend ADS (aucun mot de passe n'est codé dans l'application).",
        );
      } else if (msg.includes("rate limit") || msg.includes("too many")) {
        setError("Trop de tentatives. Patiente une minute avant de réessayer.");
      } else if (msg.includes("captcha")) {
        setError(
          HCAPTCHA_SITE_KEY
            ? "Vérification anti-robot refusée. Réessaie la case hCaptcha."
            : "Le captcha est activé côté backend ADS : renseigne la clé de site hCaptcha (VITE_ADS_HCAPTCHA_SITE_KEY).",
        );
      } else {
        setError(error.message);
      }
    }
    setLoading(false);
  }

  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/admin`,
    });
    setLoading(false);
    if (error) {
      // Ne révèle jamais si le compte existe ou non : message générique.
      const msg = error.message.toLowerCase();
      if (msg.includes("rate") || msg.includes("too many") || msg.includes("security")) {
        setError("Trop de demandes. Patiente une minute avant de réessayer.");
      } else {
        setError("Une erreur est survenue. Réessaie dans un instant.");
      }
      return;
    }
    setResetSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-panel)]">
        {mode === "forgot" ? (
          <ForgotPasswordView
            email={email}
            setEmail={setEmail}
            loading={loading}
            error={error}
            resetSent={resetSent}
            onSubmit={onResetPassword}
            onBack={() => {
              setMode("login");
              setError(null);
              setResetSent(false);
            }}
          />
        ) : (
          <>
            <div
              className="mx-auto flex size-12 items-center justify-center rounded-xl"
              style={{ background: "var(--gradient-brand)" }}
            >
              <ShieldCheck className="size-6 text-primary-foreground" />
            </div>
            <h1 className="mt-5 text-center text-xl font-semibold tracking-tight">
              Espace Admin ADS
            </h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              Connexion réservée aux super administrateurs.
            </p>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@ads.app"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Mot de passe</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError(null);
                      setResetSent(false);
                    }}
                    className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {HCAPTCHA_SITE_KEY && (
                <div className="flex justify-center">
                  <HCaptcha
                    ref={captchaRef}
                    sitekey={HCAPTCHA_SITE_KEY}
                    theme="dark"
                    onVerify={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken(null)}
                  />
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
                Se connecter
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function ForgotPasswordView({
  email,
  setEmail,
  loading,
  error,
  resetSent,
  onSubmit,
  onBack,
}: {
  email: string;
  setEmail: (v: string) => void;
  loading: boolean;
  error: string | null;
  resetSent: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/15">
        <MailCheck className="size-6 text-primary" />
      </div>
      <h1 className="mt-5 text-center text-xl font-semibold tracking-tight">
        Mot de passe oublié
      </h1>
      {resetSent ? (
        <div className="mt-6 space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Un email de réinitialisation a été envoyé si ce compte existe. Ouvre le lien contenu
            dans l'email pour définir un nouveau mot de passe.
          </p>
          <Button variant="outline" className="w-full" onClick={onBack}>
            <ArrowLeft className="mr-2 size-4" /> Retour à la connexion
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            Saisis ton adresse email : tu recevras un lien sécurisé pour réinitialiser ton mot de
            passe.
          </p>
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@ads.app"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
            Envoyer le lien
          </Button>
          <button
            type="button"
            onClick={onBack}
            className="flex w-full items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Retour à la connexion
          </button>
        </form>
      )}
    </>
  );
}