import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/ads/client";

/** Tables réelles de la plateforme ADS. Aucune table générée. */
export const ADS_TABLES = [
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
  "tickets_evenements",
  "qr_scans_log",
] as const;

export type AdsTable = (typeof ADS_TABLES)[number];
export type Row = Record<string, unknown>;

export function useAdsTable(table: AdsTable, limit = 200, orderBy = "created_at") {
  return useQuery({
    queryKey: ["ads", table, limit, orderBy],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order(orderBy, { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

export async function logJournal(input: {
  userId?: string | undefined;
  action: string;
  description?: string;
}) {
  await supabase.from("journal").insert({
    user_id: input.userId ?? null,
    action: input.action,
    description: input.description ?? null,
    appareil: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 180) : null,
  });
}

/** Écrit dans une table ADS puis journalise l'action dans `journal`. */
export function useAdsUpdate(adminId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      table: AdsTable;
      id: string;
      values: Row;
      action: string;
      description?: string;
    }) => {
      const { error } = await supabase.from(input.table).update(input.values).eq("id", input.id);
      if (error) throw error;
      await logJournal({
        userId: adminId,
        action: input.action,
        description: input.description ?? `${input.table} · ${input.id}`,
      }).catch(() => undefined);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["ads", vars.table] });
      qc.invalidateQueries({ queryKey: ["ads", "journal"] });
    },
  });
}

export const money = (v: unknown, currency = "FCFA") =>
  `${Number(v ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} ${currency}`;

export const shortDate = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

export const shortId = (v: unknown) => (v ? String(v).slice(0, 8) : "—");
