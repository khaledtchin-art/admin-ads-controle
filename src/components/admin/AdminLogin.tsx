import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("email not confirmed")) {
        setError("Ce compte n'est pas encore confirmé. Valide l'email d'activation puis réessaie.");
      } else if (msg.includes("invalid login credentials")) {
        setError(
          "Email ou mot de passe incorrect. Le compte doit exister dans le backend ADS (aucun mot de passe n'est codé dans l'application).",
        );
      } else if (msg.includes("rate limit") || msg.includes("too many")) {
        setError("Trop de tentatives. Patiente une minute avant de réessayer.");
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