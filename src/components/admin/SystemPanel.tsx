import { useQuery } from "@tanstack/react-query";
import { supabase, ADS_SUPABASE_URL } from "@/integrations/ads/client";
import { Panel } from "./ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";

// Tables réelles de la plateforme ADS — aucune table générée ici.
const TABLES = [
  "profiles",
  "account_validations",
  "access_tokens",
  "transactions",
  "retraits",
  "produits",
  "achats",
  "avis",
  "parrainages",
  "notifications",
  "messages_admin",
  "promo_codes",
  "evenements",
  "journal",
  "recus",
  "temoignages",
  "stories",
  "versions_app",
  "ambassadeurs",
  "formations",
  "progressions_formations",
  "partenaires",
  "parametres",
  "moyens_paiement",
  "configuration_agregateurs",
] as const;

type TableRowInfo = { table: string; count: number | null; error: string | null };

function instanceInfo() {
  const url = ADS_SUPABASE_URL;
  let host = "—";
  let ref = "—";
  try {
    host = new URL(url).host;
    ref = host.split(".")[0] ?? "—";
  } catch {
    /* URL absente */
  }
  return { host, ref };
}

export function SystemPanel({ email }: { email?: string | undefined }) {
  const { host, ref } = instanceInfo();

  const probe = useQuery({
    queryKey: ["admin", "system_probe"],
    queryFn: async (): Promise<TableRowInfo[]> =>
      Promise.all(
        TABLES.map(async (table) => {
          const { count, error } = await supabase
            .from(table as never)
            .select("*", { count: "exact", head: true });
          return { table, count: count ?? null, error: error?.message ?? null };
        }),
      ),
  });

  const ok = probe.data?.filter((r) => !r.error).length ?? 0;

  return (
    <div className="space-y-4">
      <Panel
        title="Instance backend utilisée"
        description="Informations publiques uniquement — aucune clé ni secret n'est affiché ici."
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <Info label="Hôte de l'instance" value={host} />
          <Info label="Référence du projet" value={ref} />
          <Info label="Authentification" value="Supabase Auth (email / mot de passe)" />
          <Info label="Compte connecté" value={email ?? "—"} />
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Toutes les lectures et écritures de cette console passent par cette instance. Si tu
          attends une autre base, c'est ici qu'il faut vérifier avant de déboguer les données.
        </p>
      </Panel>

      <Panel
        title="Tables connectées"
        description={`${ok}/${TABLES.length} tables accessibles avec les droits du compte courant.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => probe.refetch()} disabled={probe.isFetching}>
            {probe.isFetching ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Revérifier
          </Button>
        }
      >
        {probe.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Vérification en cours…</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {probe.data?.map((r) => (
              <li
                key={r.table}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm">
                  {r.error ? (
                    <XCircle className="size-4 text-destructive" />
                  ) : (
                    <CheckCircle2 className="size-4 text-success" />
                  )}
                  <span className="font-mono text-xs">{r.table}</span>
                </span>
                {r.error ? (
                  <Badge
                    variant="outline"
                    className="max-w-[55%] truncate border-destructive/40 bg-destructive/10 text-destructive"
                    title={r.error}
                  >
                    {r.error}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">{r.count ?? 0} lignes</span>
                )}
              </li>
            ))}
          </ul>
        )}
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
