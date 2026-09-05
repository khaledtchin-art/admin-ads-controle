import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export function AccessDenied({
  email,
  onSignOut,
  reason = "role",
  role,
}: {
  email?: string | undefined;
  onSignOut: () => void;
  reason?: "role" | "missing" | "error";
  role?: string | undefined;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-destructive/40 bg-card p-8 text-center shadow-[var(--shadow-panel)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive/15">
          <ShieldAlert className="size-6 text-destructive" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Accès refusé</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ce compte {email ? <span className="text-foreground">({email})</span> : null} ne dispose
          pas du rôle <span className="text-foreground">super_admin</span>. L'espace
          d'administration ADS est strictement réservé.
        </p>
        <Button variant="outline" className="mt-6" onClick={onSignOut}>
          Changer de compte
        </Button>
      </div>
    </div>
  );
}