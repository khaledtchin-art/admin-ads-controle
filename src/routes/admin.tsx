import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { Loader2, MailCheck, Loader as LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Espace Admin ADS — Console super administrateur" },
      {
        name: "description",
        content:
          "Console d'administration ADS : utilisateurs, wallets, transactions, KYC, dépôts, retraits, marketplace et logs de sécurité.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Espace Admin ADS" },
      {
        property: "og:description",
        content: "Console sécurisée réservée aux super administrateurs ADS.",
      },
    ],
  }),
  component: AdminPage,
});

/** Vérifie le rôle super_admin dans admin_profiles (fallback : table admins historique). */
async function fetchSuperAdmin(userId: string): Promise<boolean> {
  const { data: adminProfile } = await supabase
    .from("admin_profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (adminProfile?.role === "super_admin") return true;

  const { data: legacy } = await supabase
    .from("admins")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  return Boolean(legacy);
}

function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setIsSuperAdmin(null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setIsSuperAdmin(null);
      return;
    }
    void (async () => {
      const ok = await fetchSuperAdmin(userId).catch(() => false);
      if (!cancelled) setIsSuperAdmin(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  if (!ready) return <FullScreenLoader />;
  if (!session?.user) return <AdminLogin />;
  if (!session.user.email_confirmed_at)
    return <EmailNotConfirmed email={session.user.email ?? undefined} onSignOut={signOut} />;
  if (isSuperAdmin === null) return <FullScreenLoader />;
  if (!isSuperAdmin)
    return <AccessDenied email={session.user.email ?? undefined} onSignOut={signOut} />;

  return <AdminDashboard user={session.user} onSignOut={signOut} />;
}

function EmailNotConfirmed({
  email,
  onSignOut,
}: {
  email?: string | undefined;
  onSignOut: () => void;
}) {
  const [sending, setSending] = useState(false);

  async function resend() {
    if (!email) return;
    setSending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    setSending(false);
    if (error) toast.error(error.message);
    else toast.success("Email de confirmation renvoyé.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-panel)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/15">
          <MailCheck className="size-6 text-primary" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Email non confirmé</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          L'accès à l'espace d'administration ADS exige une adresse email vérifiée. Ouvre le lien de
          confirmation envoyé à {email ? <span className="text-foreground">{email}</span> : "ton adresse"}, puis
          reconnecte-toi.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={resend} disabled={sending || !email}>
            {sending && <LoaderIcon className="mr-2 size-4 animate-spin" />}
            Renvoyer l'email
          </Button>
          <Button variant="outline" onClick={onSignOut}>
            Changer de compte
          </Button>
        </div>
      </div>
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}
