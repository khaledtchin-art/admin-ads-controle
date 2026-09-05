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
        <h1 className="mt-5 text-xl font-semibold tracking-tight">
          {reason === "missing" ? "Profil introuvable" : "Accès refusé"}
        </h1>
        {reason === "missing" ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Aucune fiche n'existe dans la table <span className="text-foreground">profiles</span>{" "}
            pour {email ? <span className="text-foreground">{email}</span> : "ce compte"}. Crée la
            ligne correspondante avec le rôle{" "}
            <span className="text-foreground">super_admin</span> (colonne{" "}
            <span className="text-foreground">role</span>) et son{" "}
            <span className="text-foreground">id</span> égal à l'identifiant du compte, puis
            reconnecte-toi.
          </p>
        ) : reason === "error" ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Impossible de lire le profil de {email ?? "ce compte"} : la base ADS a refusé la
            lecture (droits RLS sur <span className="text-foreground">profiles</span>). Le rôle n'a
            donc pas pu être vérifié.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Ce compte {email ? <span className="text-foreground">({email})</span> : null} a le rôle{" "}
            <span className="text-foreground">{role || "aucun"}</span> et ne dispose pas du rôle{" "}
            <span className="text-foreground">super_admin</span>. L'espace d'administration ADS est
            strictement réservé.
          </p>
        )}
        <Button variant="outline" className="mt-6" onClick={onSignOut}>
          Changer de compte
        </Button>
      </div>
    </div>
  );
}