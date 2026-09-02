import { useMemo } from "react";
import type { User } from "@supabase/supabase-js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldCheck } from "lucide-react";
import { Stat } from "./ui";
import { SystemPanel } from "./SystemPanel";
import { JournalPanel } from "./JournalPanel";
import { ValidationsPanel } from "./ValidationsPanel";
import { ScannerPanel } from "./ScannerPanel";
import {
  BoutiquePanel,
  ParrainagesPanel,
  RetraitsPanel,
  TransactionsPanel,
  UsersPanel,
} from "./AdsPanels";
import { money, useAdsTable } from "@/lib/ads-queries";
import { AlertsBell } from "./AlertsBell";
import { useAdsAlerts } from "@/lib/ads-alerts";

export function AdminDashboard({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const adminId = user.id;
  const { alerts, unread, markAllRead, clear } = useAdsAlerts();
  const profiles = useAdsTable("profiles", 1000);
  const transactions = useAdsTable("transactions", 1000);
  const retraits = useAdsTable("retraits", 1000);
  const validations = useAdsTable("account_validations", 1000);

  const stats = useMemo(() => {
    const sum = (rows: Record<string, unknown>[] | undefined, key: string) =>
      (rows ?? []).reduce((a, r) => a + Number(r[key] ?? 0), 0);
    const pending = (rows: Record<string, unknown>[] | undefined) =>
      (rows ?? []).filter((r) => {
        const s = String(r["statut"] ?? "").toLowerCase();
        return s === "" || s.startsWith("en_") || s.startsWith("attente") || s === "pending";
      }).length;
    return {
      users: profiles.data?.length ?? 0,
      volume: sum(transactions.data, "montant"),
      retraits: sum(retraits.data, "montant"),
      soldes: sum(profiles.data, "solde"),
      validationsEnAttente: pending(validations.data),
      retraitsEnAttente: pending(retraits.data),
    };
  }, [profiles.data, transactions.data, retraits.data, validations.data]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex size-9 items-center justify-center rounded-lg"
              style={{ background: "var(--gradient-brand)" }}
            >
              <ShieldCheck className="size-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">Console Admin ADS</h1>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertsBell alerts={alerts} unread={unread} onOpen={markAllRead} onClear={clear} />
            <Button variant="outline" size="sm" onClick={onSignOut}>
              <LogOut className="mr-2 size-4" /> Déconnexion
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Utilisateurs" value={String(stats.users)} />
          <Stat label="Volume transactions" value={money(stats.volume)} />
          <Stat label="Retraits demandés" value={money(stats.retraits)} />
          <Stat label="Soldes cumulés" value={money(stats.soldes)} />
          <Stat label="Validations en attente" value={String(stats.validationsEnAttente)} />
          <Stat label="Retraits en attente" value={String(stats.retraitsEnAttente)} />
        </div>

        <Tabs defaultValue="users">
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="users">Utilisateurs</TabsTrigger>
            <TabsTrigger value="validations">Validations (KYC)</TabsTrigger>
            <TabsTrigger value="scanner">📷 Scanner QR</TabsTrigger>
            <TabsTrigger value="retraits">Retraits</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="boutique">Boutique</TabsTrigger>
            <TabsTrigger value="parrainage">Parrainage</TabsTrigger>
            <TabsTrigger value="logs">Logs admin</TabsTrigger>
            <TabsTrigger value="systeme">Système</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <UsersPanel adminId={adminId} />
          </TabsContent>
          <TabsContent value="validations" className="mt-4">
            <ValidationsPanel adminId={adminId} />
          </TabsContent>
          <TabsContent value="scanner" className="mt-4">
            <ScannerPanel adminId={adminId} />
          </TabsContent>
          <TabsContent value="retraits" className="mt-4">
            <RetraitsPanel adminId={adminId} />
          </TabsContent>
          <TabsContent value="transactions" className="mt-4">
            <TransactionsPanel />
          </TabsContent>
          <TabsContent value="boutique" className="mt-4">
            <BoutiquePanel adminId={adminId} />
          </TabsContent>
          <TabsContent value="parrainage" className="mt-4">
            <ParrainagesPanel />
          </TabsContent>
          <TabsContent value="logs" className="mt-4">
            <JournalPanel />
          </TabsContent>
          <TabsContent value="systeme" className="mt-4">
            <SystemPanel email={user.email ?? undefined} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
