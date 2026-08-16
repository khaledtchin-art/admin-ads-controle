import { useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { supabase } from "@/integrations/ads/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";

const HCAPTCHA_SITE_KEY =
  (import.meta.env["VITE_ADS_HCAPTCHA_SITE_KEY"] as string | undefined)?.trim() || "";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha | null>(null);

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-panel)]">
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
            <Label htmlFor="password">Mot de passe</Label>
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
      </div>
    </div>
  );
}