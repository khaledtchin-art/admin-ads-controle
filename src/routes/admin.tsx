import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { backend as supabase } from "@/integrations/firebase/client";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { Loader2 } from "lucide-react";

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

  useEffect(() => {
    let cancelled = false;
    if (!session?.user) {
      setIsSuperAdmin(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("admins")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!cancelled) setIsSuperAdmin(Boolean(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (!ready) return <FullScreenLoader />;
  if (!session?.user) return <AdminLogin />;
  if (isSuperAdmin === null) return <FullScreenLoader />;
  if (!isSuperAdmin)
    return <AccessDenied email={session.user.email ?? undefined} onSignOut={signOut} />;

  return <AdminDashboard user={session.user} onSignOut={signOut} />;
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}