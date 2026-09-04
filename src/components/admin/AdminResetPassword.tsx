import { useState } from "react";
import { supabase } from "@/integrations/ads/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2, KeyRound } from "lucide-react";

/**
 * Affiché lorsque l'utilisateur revient depuis l'email de réinitialisation
 * (type=recovery dans le hash). La session de récupération est déjà établie
 * par le client Supabase ; on demande juste le nouveau mot de passe.
 */
export function AdminResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("same") || msg.includes("identical")) {
        setError("Choisis un mot de passe différent de l'actuel.");
      } else if (msg.includes("rate") || msg.includes("too many")) {
        setError("Trop de tentatives. Patiente une minute avant de réessayer.");
      } else {
        setError(error.message);
      }
      return;
    }
    onDone();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-panel)]">
        <div
          className="mx-auto flex size-12 items-center justify-center rounded-xl"
          style={{ background: "var(--gradient-brand)" }}
        >
          <KeyRound className="size-6 text-primary-foreground" />
        </div>
        <h1 className="mt-5 text-center text-xl font-semibold tracking-tight">
          Nouveau mot de passe
        </h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Définis un nouveau mot de passe pour ton compte admin ADS.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmer</Label>
            <Input
              id="confirm-password"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
            Définir le mot de passe
          </Button>
        </form>
      </div>
    </div>
  );
}
