import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/ads/client";

export type Severity = "low" | "medium" | "high";
export type AdminRoleType = "super_admin" | "support_admin" | "kyc_agent" | "finance_admin";

export const ROLE_LABELS: Record<AdminRoleType, string> = {
  super_admin: "Super administrateur",
  support_admin: "Support",
  kyc_agent: "Agent KYC",
  finance_admin: "Finance",
};

export const ROLE_PERMISSIONS: Record<AdminRoleType, string[]> = {
  super_admin: ["users", "wallets", "transactions", "withdrawals", "kyc", "marketplace", "security", "settings"],
  support_admin: ["users", "support"],
  kyc_agent: ["kyc"],
  finance_admin: ["transactions", "deposits", "withdrawals"],
};

/** Journalise une action dans security_logs (jamais supprimable). */
export async function logSecurity(input: {
  adminId?: string | undefined;
  userId?: string | undefined;
  action: string;
  type?: string;
  severity?: Severity;
  details?: Record<string, unknown>;
}) {
  await supabase.from("security_logs").insert({
    admin_id: input.adminId ?? null,
    user_id: input.userId ?? null,
    action: input.action,
    type: input.type ?? "admin",
    severity: input.severity ?? "low",
    device_info: typeof navigator !== "undefined" ? navigator.userAgent : null,
    details: (input.details ?? null) as never,
  });
}

export function useSecurityLogs(limit = 300) {
  return useQuery({
    queryKey: ["admin", "security_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("security_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDuplicateAccounts() {
  return useQuery({
    queryKey: ["admin", "duplicates"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("detect_duplicate_accounts");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useFinanceOverview() {
  return useQuery({
    queryKey: ["admin", "finance_overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("finance_overview");
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
}

export function useAdminRoles() {
  return useQuery({
    queryKey: ["admin", "admin_roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_roles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useNotificationsAdmin(limit = 300) {
  return useQuery({
    queryKey: ["admin", "notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Envoi de notifications (individuelle ou globale) + email en file d'attente. */
export function useSendNotification(adminId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userIds: string[];
      title: string;
      message: string;
      type: string;
    }) => {
      const rows = input.userIds.map((uid) => ({
        user_id: uid,
        title: input.title,
        message: input.message,
        type: input.type,
      }));
      if (rows.length === 0) throw new Error("Aucun destinataire sélectionné.");
      const { error } = await supabase.from("notifications").insert(rows);
      if (error) throw error;
      await logSecurity({
        adminId,
        action: "notification.send",
        type: "notification",
        details: { count: rows.length, title: input.title },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "notifications"] }),
  });
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}