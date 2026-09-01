import { useMemo, useState } from "react";
import { Panel, Empty, StatusBadge, Stat } from "./ui";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, Eye, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { money, shortDate, shortId, useAdsTable, useAdsUpdate, type Row } from "@/lib/ads-queries";
import { ValidationDetailDialog } from "./ValidationDetailDialog";

const FILTERS = ["tous", "en_attente", "valide", "rejete"] as const;

/** Vérification des comptes ADS — table `account_validations` (statut + horodatage). */
export function ValidationsPanel({ adminId }: { adminId: string | undefined }) {
  const q = useAdsTable("account_validations", 300);
  const update = useAdsUpdate(adminId);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("tous");
  const [detail, setDetail] = useState<Row | null>(null);

  const rows = (q.data ?? []) as Row[];
  const shown = useMemo(
    () =>
      filter === "tous"
        ? rows
        : rows.filter((r) => String(r["statut"] ?? "").toLowerCase().includes(filter.slice(0, 5))),
    [rows, filter],
  );

  const counts = useMemo(() => {
    const c = { total: rows.length, attente: 0, valide: 0, rejete: 0 };
    for (const r of rows) {
      const s = String(r["statut"] ?? "").toLowerCase();
      if (s.startsWith("valid") || s === "approved") c.valide++;
      else if (s.startsWith("rejet") || s === "rejected") c.rejete++;
      else c.attente++;
    }
    return c;
  }, [rows]);

  async function setStatut(row: Row, statut: string) {
    try {
      await update.mutateAsync({
        table: "account_validations",
        id: String(row["id"]),
        values: { statut, updated_at: new Date().toISOString() },
        action: `validation_${statut}`,
        description: `account_validations · ${shortId(row["user_id"])} · ${money(row["montant"])}`,
      });
      toast.success(`Validation mise à jour : ${statut}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Demandes totales" value={String(counts.total)} />
        <Stat label="En attente" value={String(counts.attente)} />
        <Stat label="Validées" value={String(counts.valide)} />
        <Stat label="Rejetées" value={String(counts.rejete)} />
      </div>

      <Panel
        title="Validations de compte (KYC ADS)"
        description="Source : table `account_validations`. Statut et horodatage issus des champs réels (statut, created_at, updated_at)."
        count={shown.length}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
              >
                {f}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
              {q.isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </div>
        }
      >
        {q.error && <p className="mb-3 text-sm text-destructive">{(q.error as Error).message}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Demandé le</TableHead>
              <TableHead>Dernière mise à jour</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length ? (
              shown.map((r) => (
                <TableRow key={String(r["id"])}>
                  <TableCell className="font-mono text-xs">{shortId(r["user_id"])}</TableCell>
                  <TableCell>{money(r["montant"])}</TableCell>
                  <TableCell>
                    <StatusBadge status={r["statut"]} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {shortDate(r["created_at"])}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {shortDate(r["updated_at"])}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        disabled={update.isPending}
                        onClick={() => setStatut(r, "valide")}
                      >
                        <Check className="mr-1 size-3.5" /> Valider
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={update.isPending}
                        onClick={() => setStatut(r, "rejete")}
                      >
                        <X className="mr-1 size-3.5" /> Rejeter
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <Empty cols={6} />
            )}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
