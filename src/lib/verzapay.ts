import { useEffect, useState } from "react";
import { supabase } from "@/integrations/ads/client";
import type { Row } from "@/lib/ads-queries";

export type VerzapayStatus = "pending" | "completed" | "failed" | string;

export type CreatePaymentInput = {
  amount: number;
  description: string;
  customer_name: string;
  customer_phone: string;
  order_id: string;
};

export type CreatePayoutInput = {
  amount: number;
  recipient_phone: string;
  recipient_name: string;
  retrait_id: string;
};

async function invoke<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    throw new Error(String((data as Record<string, unknown>)["error"]));
  }
  return data as T;
}

/** Crée un paiement Verzapay et renvoie l'URL de checkout. */
export function createVerzapayPayment(input: CreatePaymentInput) {
  return invoke<{ checkout_url: string; id: string }>("verzapay-create-payment", input);
}

/** Crée un retrait (payout) Verzapay. */
export function createVerzapayPayout(input: CreatePayoutInput) {
  return invoke<{ id: string; status: VerzapayStatus }>("verzapay-create-payout", input);
}

/** Redirige l'utilisateur vers la page de paiement Verzapay. */
export function goToCheckout(url: string) {
  if (typeof window !== "undefined") window.location.assign(url);
}

type WatchOptions = { orderId?: string | undefined; retraitId?: string | undefined; externalId?: string | undefined };

function matches(row: Row, o: WatchOptions) {
  if (o.orderId && String(row["order_id"] ?? "") === o.orderId) return true;
  if (o.retraitId && String(row["retrait_id"] ?? "") === o.retraitId) return true;
  if (o.externalId && String(row["external_id"] ?? "") === o.externalId) return true;
  return false;
}

/**
 * Suit en temps réel le statut d'une transaction Verzapay (webhook → table
 * `transactions`). Repli par sondage si Realtime n'est pas activé.
 */
export function useVerzapayTransaction(options: WatchOptions) {
  const { orderId, retraitId, externalId } = options;
  const [transaction, setTransaction] = useState<Row | null>(null);
  const [status, setStatus] = useState<VerzapayStatus | null>(null);

  useEffect(() => {
    if (!orderId && !retraitId && !externalId) return;
    let alive = true;
    const opts: WatchOptions = { orderId, retraitId, externalId };

    const apply = (row: Row | null | undefined) => {
      if (!alive || !row) return;
      setTransaction(row);
      setStatus(String(row["status"] ?? row["statut"] ?? "pending"));
    };

    const load = async () => {
      const column = orderId ? "order_id" : retraitId ? "retrait_id" : "external_id";
      const value = orderId ?? retraitId ?? externalId!;
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .eq(column, value)
        .order("created_at", { ascending: false })
        .limit(1);
      apply((data?.[0] as Row | undefined) ?? null);
    };

    void load();

    const channel = supabase
      .channel(`verzapay-${orderId ?? retraitId ?? externalId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, (payload) => {
        const row = (payload.new ?? payload.old) as Row | undefined;
        if (row && matches(row, opts)) apply(row);
      })
      .subscribe();

    const poll = setInterval(() => {
      if (status !== "completed" && status !== "failed") void load();
    }, 5000);

    return () => {
      alive = false;
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, retraitId, externalId]);

  return {
    transaction,
    status,
    isPending: status === null || status === "pending",
    isCompleted: status === "completed",
    isFailed: status === "failed",
  };
}
