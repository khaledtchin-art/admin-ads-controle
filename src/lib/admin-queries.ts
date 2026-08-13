import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backend as supabase } from "@/integrations/firebase/client";

export type TableName =
  | "profiles"
  | "wallets"
  | "transactions"
  | "deposits"
  | "withdrawals"
  | "kyc_submissions"
  | "marketplace_items"
  | "referrals"
  | "admin_logs";

export function useAdminTable<T = Record<string, unknown>>(table: TableName, limit = 200) {
  return useQuery({
    queryKey: ["admin", table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export async function logAdminAction(input: {
  adminId: string;
  action: string;
  targetTable?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  await supabase.from("admin_logs").insert({
    admin_id: input.adminId,
    action: input.action,
    target_table: input.targetTable ?? null,
    target_id: input.targetId ?? null,
    details: (input.details ?? null) as never,
  });
}

/** Mutation d'administration : écrit, journalise, puis rafraîchit. */
export function useAdminUpdate(adminId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      table: TableName;
      id: string;
      values: Record<string, unknown>;
      action: string;
    }) => {
      const { error } = await supabase
        .from(input.table)
        .update(input.values as never)
        .eq("id", input.id);
      if (error) throw error;
      if (adminId) {
        await logAdminAction({
          adminId,
          action: input.action,
          targetTable: input.table,
          targetId: input.id,
          details: input.values,
        });
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", vars.table] });
      qc.invalidateQueries({ queryKey: ["admin", "admin_logs"] });
    },
  });
}

export const money = (v: unknown, currency = "XOF") =>
  `${Number(v ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 0 })} ${currency}`;

export const shortDate = (v: unknown) =>
  v ? new Date(String(v)).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—";

export const shortId = (v: unknown) => (v ? String(v).slice(0, 8) : "—");