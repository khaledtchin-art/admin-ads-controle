import type { User } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Wallet,
  ArrowLeftRight,
  BadgeCheck,
  Store,
  Share2,
  ScrollText,
  ArrowDownToLine,
  ArrowUpFromLine,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import {
  money,
  shortDate,
  shortId,
  useAdminTable,
  useAdminUpdate,
} from "@/lib/admin-queries";

type Row = Record<string, unknown>;

function StatusBadge({ status }: { status: unknown }) {
  const s = String(status ?? "—");
  const tone =
    s === "approved" || s === "completed" || s === "active"
      ? "border-success/40 bg-success/10 text-success"
      : s === "rejected" || s === "failed" || s === "suspended"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-warning/40 bg-warning/10 text-warning";
  return (
    <Badge variant="outline" className={tone}>
      {s}
    </Badge>
  );
}

function Panel({
  title,
  children,
  count,
}: {
  title: string;
  count?: number | undefined;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card shadow-[var(--shadow-panel)]">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {count !== undefined && (
          <span className="text-sm text-muted-foreground">{count} entrées</span>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function Empty({ cols }: { cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-10 text-center text-muted-foreground">
        Aucune donnée pour le moment.
      </TableCell>
    </TableRow>
  );
}

export function AdminDashboard({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  const profiles = useAdminTable<Row>("profiles");
  const wallets = useAdminTable<Row>("wallets");
  const transactions = useAdminTable<Row>("transactions");
  const deposits = useAdminTable<Row>("deposits");
  const withdrawals = useAdminTable<Row>("withdrawals");
  const kyc = useAdminTable<Row>("kyc_submissions");
  const items = useAdminTable<Row>("marketplace_items");
  const referrals = useAdminTable<Row>("referrals");
  const logs = useAdminTable<Row>("admin_logs");
  const update = useAdminUpdate(user.id);

  const totalBalance = (wallets.data ?? []).reduce((s, w) => s + Number(w["balance"] ?? 0), 0);
  const pending = (rows: Row[] | undefined) =>
    (rows ?? []).filter((r) => String(r["status"]) === "pending").length;

  const stats = [
    { label: "Utilisateurs", value: String(profiles.data?.length ?? 0), icon: Users },
    { label: "Solde total", value: money(totalBalance), icon: Wallet },
    { label: "Transactions", value: String(transactions.data?.length ?? 0), icon: ArrowLeftRight },
    { label: "Dépôts en attente", value: String(pending(deposits.data)), icon: ArrowDownToLine },
    { label: "Retraits en attente", value: String(pending(withdrawals.data)), icon: ArrowUpFromLine },
    { label: "KYC en attente", value: String(pending(kyc.data)), icon: BadgeCheck },
  ];

  const decide = (table: "deposits" | "withdrawals", id: string, approve: boolean) =>
    update.mutate({
      table,
      id,
      action: approve ? `${table}.approve` : `${table}.reject`,
      values: {
        status: approve ? "completed" : "rejected",
        processed_by: user.id,
        processed_at: new Date().toISOString(),
      },
    });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-4">
          <div
            className="flex size-9 items-center justify-center rounded-lg"
            style={{ background: "var(--gradient-brand)" }}
          >
            <ShieldCheck className="size-5 text-primary-foreground" />
          </div>
          <div className="mr-auto">
            <h1 className="text-lg font-semibold leading-tight tracking-tight">Admin ADS</h1>
            <p className="text-xs text-muted-foreground">{user.email} · super_admin</p>
          </div>
          <Button variant="outline" size="sm" onClick={onSignOut}>
            <LogOut className="mr-2 size-4" /> Déconnexion
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {stats.map((s) => (
            <Card key={s.label} className="border-border bg-card">
              <CardContent className="p-4">
                <s.icon className="size-4 text-primary" />
                <p className="mt-3 text-xl font-semibold tracking-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Tabs defaultValue="users">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-secondary p-1">
            <TabsTrigger value="users"><Users className="mr-2 size-4" />Utilisateurs</TabsTrigger>
            <TabsTrigger value="wallets"><Wallet className="mr-2 size-4" />Wallets</TabsTrigger>
            <TabsTrigger value="transactions"><ArrowLeftRight className="mr-2 size-4" />Transactions</TabsTrigger>
            <TabsTrigger value="deposits"><ArrowDownToLine className="mr-2 size-4" />Dépôts</TabsTrigger>
            <TabsTrigger value="withdrawals"><ArrowUpFromLine className="mr-2 size-4" />Retraits</TabsTrigger>
            <TabsTrigger value="kyc"><BadgeCheck className="mr-2 size-4" />KYC</TabsTrigger>
            <TabsTrigger value="market"><Store className="mr-2 size-4" />Marketplace</TabsTrigger>
            <TabsTrigger value="referrals"><Share2 className="mr-2 size-4" />Parrainage</TabsTrigger>
            <TabsTrigger value="logs"><ScrollText className="mr-2 size-4" />Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4">
            <Panel title="Gestion utilisateurs" count={profiles.data?.length}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Inscrit le</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(profiles.data ?? []).length === 0 && <Empty cols={6} />}
                  {(profiles.data ?? []).map((p) => {
                    const suspended = String(p["status"]) === "suspended";
                    return (
                      <TableRow key={String(p["id"])}>
                        <TableCell>{String(p["full_name"] ?? "—")}</TableCell>
                        <TableCell className="text-muted-foreground">{String(p["email"] ?? "—")}</TableCell>
                        <TableCell className="text-muted-foreground">{String(p["phone"] ?? "—")}</TableCell>
                        <TableCell><StatusBadge status={p["status"]} /></TableCell>
                        <TableCell className="text-muted-foreground">{shortDate(p["created_at"])}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={suspended ? "outline" : "destructive"}
                            onClick={() =>
                              update.mutate({
                                table: "profiles",
                                id: String(p["id"]),
                                action: suspended ? "user.reactivate" : "user.suspend",
                                values: { status: suspended ? "active" : "suspended" },
                              })
                            }
                          >
                            {suspended ? "Réactiver" : "Suspendre"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Panel>
          </TabsContent>

          <TabsContent value="wallets" className="mt-4">
            <Panel title="Portefeuilles" count={wallets.data?.length}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Solde</TableHead>
                    <TableHead>Bloqué</TableHead>
                    <TableHead>Devise</TableHead>
                    <TableHead>Mis à jour</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(wallets.data ?? []).length === 0 && <Empty cols={5} />}
                  {(wallets.data ?? []).map((w) => (
                    <TableRow key={String(w["id"])}>
                      <TableCell className="font-mono text-xs">{shortId(w["user_id"])}</TableCell>
                      <TableCell>{money(w["balance"], String(w["currency"] ?? "XOF"))}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {money(w["locked_balance"], String(w["currency"] ?? "XOF"))}
                      </TableCell>
                      <TableCell>{String(w["currency"] ?? "—")}</TableCell>
                      <TableCell className="text-muted-foreground">{shortDate(w["updated_at"])}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </TabsContent>

          <TabsContent value="transactions" className="mt-4">
            <Panel title="Suivi des transactions" count={transactions.data?.length}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Réf.</TableHead>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(transactions.data ?? []).length === 0 && <Empty cols={6} />}
                  {(transactions.data ?? []).map((t) => (
                    <TableRow key={String(t["id"])}>
                      <TableCell className="font-mono text-xs">{shortId(t["id"])}</TableCell>
                      <TableCell className="font-mono text-xs">{shortId(t["user_id"])}</TableCell>
                      <TableCell>{String(t["type"] ?? "—")}</TableCell>
                      <TableCell>{money(t["amount"])}</TableCell>
                      <TableCell><StatusBadge status={t["status"]} /></TableCell>
                      <TableCell className="text-muted-foreground">{shortDate(t["created_at"])}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </TabsContent>

          {(["deposits", "withdrawals"] as const).map((table) => {
            const q = table === "deposits" ? deposits : withdrawals;
            return (
              <TabsContent key={table} value={table} className="mt-4">
                <Panel
                  title={table === "deposits" ? "Gestion des dépôts" : "Gestion des retraits"}
                  count={q.data?.length}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Utilisateur</TableHead>
                        <TableHead>Montant</TableHead>
                        <TableHead>Méthode</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(q.data ?? []).length === 0 && <Empty cols={6} />}
                      {(q.data ?? []).map((r) => (
                        <TableRow key={String(r["id"])}>
                          <TableCell className="font-mono text-xs">{shortId(r["user_id"])}</TableCell>
                          <TableCell>{money(r["amount"])}</TableCell>
                          <TableCell className="text-muted-foreground">{String(r["method"] ?? "—")}</TableCell>
                          <TableCell><StatusBadge status={r["status"]} /></TableCell>
                          <TableCell className="text-muted-foreground">{shortDate(r["created_at"])}</TableCell>
                          <TableCell className="space-x-2 text-right">
                            <Button
                              size="sm"
                              disabled={String(r["status"]) !== "pending"}
                              onClick={() => decide(table, String(r["id"]), true)}
                            >
                              Valider
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={String(r["status"]) !== "pending"}
                              onClick={() => decide(table, String(r["id"]), false)}
                            >
                              Refuser
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Panel>
              </TabsContent>
            );
          })}

          <TabsContent value="kyc" className="mt-4">
            <Panel title="Validation KYC" count={kyc.data?.length}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Soumis le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(kyc.data ?? []).length === 0 && <Empty cols={6} />}
                  {(kyc.data ?? []).map((k) => (
                    <TableRow key={String(k["id"])}>
                      <TableCell className="font-mono text-xs">{shortId(k["user_id"])}</TableCell>
                      <TableCell>{String(k["document_type"] ?? "—")}</TableCell>
                      <TableCell className="text-muted-foreground">{String(k["document_number"] ?? "—")}</TableCell>
                      <TableCell><StatusBadge status={k["status"]} /></TableCell>
                      <TableCell className="text-muted-foreground">{shortDate(k["created_at"])}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button
                          size="sm"
                          disabled={String(k["status"]) !== "pending"}
                          onClick={() =>
                            update.mutate({
                              table: "kyc_submissions",
                              id: String(k["id"]),
                              action: "kyc.approve",
                              values: {
                                status: "approved",
                                reviewed_by: user.id,
                                reviewed_at: new Date().toISOString(),
                              },
                            })
                          }
                        >
                          Approuver
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={String(k["status"]) !== "pending"}
                          onClick={() =>
                            update.mutate({
                              table: "kyc_submissions",
                              id: String(k["id"]),
                              action: "kyc.reject",
                              values: {
                                status: "rejected",
                                rejection_reason: "Document non conforme",
                                reviewed_by: user.id,
                                reviewed_at: new Date().toISOString(),
                              },
                            })
                          }
                        >
                          Rejeter
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </TabsContent>

          <TabsContent value="market" className="mt-4">
            <Panel title="ADS Store" count={items.data?.length}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Article</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Prix</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(items.data ?? []).length === 0 && <Empty cols={6} />}
                  {(items.data ?? []).map((i) => {
                    const active = Boolean(i["is_active"]);
                    return (
                      <TableRow key={String(i["id"])}>
                        <TableCell>{String(i["title"] ?? "—")}</TableCell>
                        <TableCell className="text-muted-foreground">{String(i["category"] ?? "—")}</TableCell>
                        <TableCell>{money(i["price"])}</TableCell>
                        <TableCell>{String(i["stock"] ?? 0)}</TableCell>
                        <TableCell><StatusBadge status={active ? "active" : "suspended"} /></TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              update.mutate({
                                table: "marketplace_items",
                                id: String(i["id"]),
                                action: active ? "market.disable" : "market.enable",
                                values: { is_active: !active },
                              })
                            }
                          >
                            {active ? "Désactiver" : "Activer"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Panel>
          </TabsContent>

          <TabsContent value="referrals" className="mt-4">
            <Panel title="Gestion du parrainage" count={referrals.data?.length}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parrain</TableHead>
                    <TableHead>Filleul</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(referrals.data ?? []).length === 0 && <Empty cols={5} />}
                  {(referrals.data ?? []).map((r) => (
                    <TableRow key={String(r["id"])}>
                      <TableCell className="font-mono text-xs">{shortId(r["referrer_id"])}</TableCell>
                      <TableCell className="font-mono text-xs">{shortId(r["referred_id"])}</TableCell>
                      <TableCell>{String(r["code"] ?? "—")}</TableCell>
                      <TableCell>{money(r["commission"])}</TableCell>
                      <TableCell className="text-muted-foreground">{shortDate(r["created_at"])}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <Panel title="Logs de sécurité admin" count={logs.data?.length}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Cible</TableHead>
                    <TableHead>Réf.</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(logs.data ?? []).length === 0 && <Empty cols={5} />}
                  {(logs.data ?? []).map((l) => (
                    <TableRow key={String(l["id"])}>
                      <TableCell className="font-mono text-xs">{shortId(l["admin_id"])}</TableCell>
                      <TableCell>{String(l["action"] ?? "—")}</TableCell>
                      <TableCell className="text-muted-foreground">{String(l["target_table"] ?? "—")}</TableCell>
                      <TableCell className="font-mono text-xs">{shortId(l["target_id"])}</TableCell>
                      <TableCell className="text-muted-foreground">{shortDate(l["created_at"])}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}