import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "./ui";
import { supabase } from "@/integrations/ads/client";
import { money, shortDate, type Row } from "@/lib/ads-queries";
import { History, Loader2 } from "lucide-react";

/** Fiche détaillée d'une demande KYC : statut, horodatages, champs bruts et historique. */
export function ValidationDetailDialog({
  row,
  onClose,
}: {
  row: Row | null;
  onClose: () => void;
}) {
  const id = row ? String(row["id"]) : "";
  const userId = row?.["user_id"] ? String(row["user_id"]) : "";

  const history = useQuery({
    queryKey: ["ads", "journal", "kyc_history", id, userId],
    enabled: Boolean(row),
    queryFn: async (): Promise<Row[]> => {
      const filters = [`description.ilike.%${id}%`];
      if (userId) filters.push(`description.ilike.%${userId.slice(0, 8)}%`, `user_id.eq.${userId}`);
      const { data, error } = await supabase
        .from("journal")
        .select("*")
        .or(filters.join(","))
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const entries = row
    ? Object.entries(row).filter(([k]) => !["id", "user_id", "statut"].includes(k))
    : [];

  return (
    <Dialog open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Demande KYC {id.slice(0, 8)}
            <StatusBadge status={row?.["statut"]} />
          </DialogTitle>
          <DialogDescription>
            Utilisateur <span className="font-mono">{userId || "—"}</span> · déposée le{" "}
            {shortDate(row?.["created_at"])}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          <Info label="Statut actuel" value={String(row?.["statut"] ?? "—")} />
          <Info label="Montant" value={money(row?.["montant"])} />
          <Info label="Créée le" value={shortDate(row?.["created_at"])} />
          <Info label="Dernière mise à jour" value={shortDate(row?.["updated_at"])} />
        </div>

        {entries.length > 0 && (
          <div className="rounded-lg border border-border">
            <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              Champs de la demande
            </p>
            <dl className="divide-y divide-border">
              {entries.map(([k, v]) => (
                <div key={k} className="flex gap-3 px-3 py-1.5 text-xs">
                  <dt className="w-44 shrink-0 font-mono text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 break-all">
                    {k.includes("_at") ? shortDate(v) : String(v ?? "—")}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="rounded-lg border border-border">
          <p className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            <History className="size-3.5" /> Historique des changements (journal)
          </p>
          {history.isLoading ? (
            <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Chargement…
            </p>
          ) : history.error ? (
            <p className="px-3 py-4 text-xs text-destructive">{(history.error as Error).message}</p>
          ) : history.data?.length ? (
            <ol className="divide-y divide-border">
              {history.data.map((h) => (
                <li key={String(h["id"])} className="px-3 py-2">
                  <p className="text-sm font-medium">{String(h["action"] ?? "—")}</p>
                  <p className="text-xs text-muted-foreground">{String(h["description"] ?? "—")}</p>
                  <p className="text-[11px] text-muted-foreground/70">{shortDate(h["created_at"])}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Aucun changement enregistré pour cette demande.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}
