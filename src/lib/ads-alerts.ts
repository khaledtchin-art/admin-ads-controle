import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/ads/client";
import type { Row } from "@/lib/ads-queries";

export type AdsAlert = {
  id: string;
  kind: "journal" | "kyc";
  level: "critique" | "info";
  title: string;
  detail: string;
  at: string;
  userId?: string | undefined;
};

/** Mots-clés considérés comme critiques dans `journal.action` / `description`. */
const CRITICAL = [
  "suppr",
  "delete",
  "retrait",
  "withdraw",
  "blocage",
  "bloque",
  "fraude",
  "echec",
  "failed",
  "erreur",
  "alerte",
  "securite",
  "sécurité",
  "rejet",
  "admin",
];

export function isCriticalAction(action: unknown, description?: unknown) {
  const hay = `${String(action ?? "")} ${String(description ?? "")}`.toLowerCase();
  return CRITICAL.some((k) => hay.includes(k));
}

const POLL_MS = 20_000;
const MAX_ALERTS = 50;

function journalAlert(r: Row): AdsAlert {
  const action = String(r["action"] ?? "action");
  return {
    id: `journal:${String(r["id"])}`,
    kind: "journal",
    level: isCriticalAction(r["action"], r["description"]) ? "critique" : "info",
    title: action,
    detail: String(r["description"] ?? "Nouvelle entrée dans le journal"),
    at: String(r["created_at"] ?? new Date().toISOString()),
    userId: r["user_id"] ? String(r["user_id"]) : undefined,
  };
}

function kycAlert(r: Row): AdsAlert {
  const statut = String(r["statut"] ?? "—");
  return {
    id: `kyc:${String(r["id"])}:${statut}:${String(r["updated_at"] ?? "")}`,
    kind: "kyc",
    level: /rejet|refus/i.test(statut) ? "critique" : "info",
    title: `KYC · statut ${statut}`,
    detail: `Demande ${String(r["id"] ?? "").slice(0, 8)} — utilisateur ${String(r["user_id"] ?? "—").slice(0, 8)}`,
    at: String(r["updated_at"] ?? r["created_at"] ?? new Date().toISOString()),
    userId: r["user_id"] ? String(r["user_id"]) : undefined,
  };
}

/**
 * Alertes temps réel : nouvelles lignes critiques dans `journal` et changements
 * de statut KYC dans `account_validations`.
 * Utilise Supabase Realtime, avec repli sur un sondage régulier si la
 * réplication temps réel n'est pas activée sur la base ADS.
 */
export function useAdsAlerts() {
  const qc = useQueryClient();
  const [alerts, setAlerts] = useState<AdsAlert[]>([]);
  const [readAt, setReadAt] = useState<number>(() => Date.now());
  const seen = useRef<Set<string>>(new Set());
  const since = useRef<string>(new Date().toISOString());

  useEffect(() => {
    let stopped = false;

    const push = (a: AdsAlert, notify = true) => {
      if (stopped || seen.current.has(a.id)) return;
      seen.current.add(a.id);
      setAlerts((prev) => [a, ...prev].slice(0, MAX_ALERTS));
      if (notify) {
        const msg = `${a.title} — ${a.detail}`;
        if (a.level === "critique") toast.error(msg, { description: "Événement critique ADS" });
        else toast.info(msg);
      }
      qc.invalidateQueries({ queryKey: ["ads", a.kind === "kyc" ? "account_validations" : "journal"] });
    };

    const channel = supabase
      .channel("ads-admin-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "journal" },
        (payload) => {
          const row = payload.new as Row;
          if (isCriticalAction(row["action"], row["description"])) push(journalAlert(row));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "account_validations" },
        (payload) => {
          const row = payload.new as Row;
          const old = (payload.old ?? {}) as Row;
          if (String(row["statut"] ?? "") !== String(old["statut"] ?? "")) push(kycAlert(row));
        },
      )
      .subscribe();

    // Repli : sondage périodique (fonctionne même sans Realtime activé).
    const poll = async () => {
      const cutoff = since.current;
      since.current = new Date().toISOString();
      try {
        const [j, k] = await Promise.all([
          supabase
            .from("journal")
            .select("*")
            .gt("created_at", cutoff)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("account_validations")
            .select("*")
            .gt("updated_at", cutoff)
            .order("updated_at", { ascending: false })
            .limit(20),
        ]);
        for (const r of (j.data ?? []) as Row[]) {
          if (isCriticalAction(r["action"], r["description"])) push(journalAlert(r));
        }
        for (const r of (k.data ?? []) as Row[]) push(kycAlert(r));
      } catch {
        /* base injoignable : on réessaie au prochain tick */
      }
    };
    const timer = setInterval(() => void poll(), POLL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  const unread = useMemo(
    () => alerts.filter((a) => new Date(a.at).getTime() > readAt || seenAfter(a, readAt)).length,
    [alerts, readAt],
  );

  return {
    alerts,
    unread,
    markAllRead: () => setReadAt(Date.now()),
    clear: () => setAlerts([]),
  };
}

/** Une alerte reçue après le dernier « tout lu » compte comme non lue. */
function seenAfter(a: AdsAlert, readAt: number) {
  const t = new Date(a.at).getTime();
  return Number.isNaN(t) ? true : t > readAt;
}
