import { useQuery } from "@tanstack/react-query";
import { supabase, ADS_SUPABASE_URL } from "@/integrations/ads/client";
import { Panel } from "./ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { ADS_TABLES } from "@/lib/ads-queries";

/** Un test = un onglet du dashboard, avec la requête réelle qu'il exécute. */
const TAB_TESTS: { tab: string; tables: string[] }[] = [
  { tab: "Statistiques", tables: ["profiles", "transactions", "retraits", "account_validations"] },
  { tab: "Utilisateurs", tables: ["profiles"] },
  { tab: "Validations (KYC)", tables: ["account_validations"] },
  { tab: "Retraits", tables: ["retraits"] },
  { tab: "Transactions", tables: ["transactions"] },
  { tab: "Boutique", tables: ["produits", "achats", "avis"] },
  { tab: "Parrainage", tables: ["parrainages"] },
  { tab: "Logs admin", tables: ["journal", "messages_admin"] },
];

type Probe = { table: string; count: number | null; error: string | null };

function instanceInfo() {
  let host = "—";
  let ref = "—";
  try {
    host = new URL(ADS_SUPABASE_URL).host;
    ref = host.split(".")[0] ?? "—";
  } catch {
    /* URL absente */
  }
  return { host, ref };
}

async function probeTable(table: string): Promise<Probe> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  return { table, count: count ?? null, error: error?.message ?? null };
}

export function SystemPanel({ email }: { email?: string | undefined }) {
  const { host, ref } = instanceInfo();

  const probe = useQuery({
    queryKey: ["ads", "system_probe"],
    queryFn: async () => {
      const results = await Promise.all(ADS_TABLES.map((t) => probeTable(t)));
      return Object.fromEntries(results.map((r) => [r.table, r])) as Record<string, Probe>;
    },
  });

  const byTable = probe.data ?? {};
  const ok = Object.values(byTable).filter((r) => !r.error).length;
  const failingTabs = TAB_TESTS.map((t) => ({
    ...t,
    failures: t.tables.map((n) => byTable[n]).filter((r): r is Probe => Boolean(r?.error)),
  })).filter((t) => t.failures.length > 0);

  return (
    <div className="space-y-4">
      <Panel
        title="Instance backend utilisée"
        description="Informations publiques uniquement — aucune clé ni secret n'est affiché ici."
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <Info label="Hôte de l'instance" value={host} />
          <Info label="Référence du projet" value={ref} />
          <Info label="Plateforme" value="ADS Niger — base principale" />
          <Info label="Compte connecté" value={email ?? "—"} />
        </dl>
      </Panel>

      <Panel
        title="Test de permissions par onglet"
        description="Requêtes réelles exécutées avec les droits du compte connecté."
        actions={
          <Button variant="outline" size="sm" onClick={() => probe.refetch()} disabled={probe.isFetching}>
            {probe.isFetching ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Relancer les tests
          </Button>
        }
      >
        {probe.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Tests en cours…</p>
        ) : failingTabs.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" /> Tous les onglets ont accès à leurs tables.
          </p>
        ) : (
          <ul className="space-y-2">
            {failingTabs.map((t) => (
              <li key={t.tab} className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <XCircle className="size-4" /> {t.tab}
                </p>
                <ul className="mt-1 space-y-1">
                  {t.failures.map((f) => (
                    <li key={f.table} className="text-xs text-destructive/90">
                      <span className="font-mono">{f.table}</span> — {f.error}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Tables ADS connectées"
        description={`${ok}/${ADS_TABLES.length} tables accessibles avec les droits du compte courant.`}
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {ADS_TABLES.map((t) => {
            const r = byTable[t];
            return (
              <li
                key={t}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm">
                  {r?.error ? (
                    <XCircle className="size-4 text-destructive" />
                  ) : (
                    <CheckCircle2 className="size-4 text-success" />
                  )}
                  <span className="font-mono text-xs">{t}</span>
                </span>
                {r?.error ? (
                  <Badge
                    variant="outline"
                    className="max-w-[55%] truncate border-destructive/40 bg-destructive/10 text-destructive"
                    title={r.error}
                  >
                    {r.error}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">{r?.count ?? 0} lignes</span>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-all font-mono text-sm">{value}</dd>
    </div>
  );
}
