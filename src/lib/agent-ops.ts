import { supabase } from "@/integrations/ads/client";
import { logJournal, type Row } from "@/lib/ads-queries";
import { extractToken } from "@/lib/qr-scan";

export type AgentMode = "depot" | "retrait";

export type AgentToken = {
  mode: AgentMode;
  raw: string;
  code: string;
  ok: boolean;
  title: string;
  message: string;
  amount: number;
  profile?: Row | undefined;
  token?: Row | undefined;
};

async function rpc(name: string, args: Record<string, unknown>): Promise<Row | null> {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error || data == null) return null;
    return (Array.isArray(data) ? (data[0] as Row | undefined) : (data as Row)) ?? null;
  } catch {
    return null;
  }
}

async function fetchProfile(userId: unknown): Promise<Row | undefined> {
  if (!userId) return undefined;
  const { data } = await supabase.from("profiles").select("*").eq("id", String(userId)).maybeSingle();
  return (data as Row | null) ?? undefined;
}

/** Lit un QR agent (dépôt ou retrait) depuis `qr_tokens`, avec repli RPC. */
export async function readAgentToken(mode: AgentMode, raw: string): Promise<AgentToken> {
  const code = extractToken(raw);

  const v = await rpc(mode === "depot" ? "verifier_qr_depot" : "verifier_qr_retrait", { qr_code: code });
  const row =
    v ??
    ((
      await supabase.from("qr_tokens").select("*").eq("code", code).maybeSingle()
    ).data as Row | null) ??
    undefined;

  if (!row) {
    return {
      mode,
      raw,
      code,
      ok: false,
      title: "QR introuvable",
      message: "Aucune opération ne correspond à ce code.",
      amount: 0,
    };
  }

  const statut = String(row["statut"] ?? row["status"] ?? "actif").toLowerCase();
  const expire = row["expire_at"] ?? row["expires_at"];
  const expired = expire ? new Date(String(expire)).getTime() < Date.now() : false;
  const used = statut === "used" || statut === "utilise";
  const amount = Number(row["montant"] ?? row["amount"] ?? 0);
  const profile = await fetchProfile(row["user_id"]);

  return {
    mode,
    raw,
    code,
    ok: !used && !expired,
    title: used ? "Code déjà utilisé" : expired ? "Code expiré" : mode === "depot" ? "Dépôt à recevoir" : "Retrait à remettre",
    message: used
      ? "Cette opération a déjà été traitée."
      : expired
        ? "Le code a dépassé son délai de validité."
        : mode === "depot"
          ? "Vérifie la pièce d'identité avant de confirmer."
          : "Remets le montant au membre puis confirme.",
    amount,
    profile,
    token: row,
  };
}

/** L'agent confirme avoir REÇU l'argent du membre (dépôt en agence). */
export async function confirmerDepot(code: string, agentId: string | undefined, numeroPiece: string) {
  const res = await rpc("confirmer_depot_agent", {
    qr_code: code,
    agent_id: agentId ?? null,
    numero_piece: numeroPiece,
  });
  if (res && res["success"] === false) throw new Error(String(res["message"] ?? "Dépôt refusé."));
  if (!res) {
    const { error } = await supabase
      .from("qr_tokens")
      .update({ statut: "used", used_at: new Date().toISOString(), agent_id: agentId ?? null, numero_piece: numeroPiece })
      .eq("code", code);
    if (error) throw error;
  }
  await logJournal({ userId: agentId, action: "depot_agent", description: `${code} · pièce ${numeroPiece}` }).catch(
    () => undefined,
  );
  return String(res?.["message"] ?? "Dépôt confirmé.");
}

/** L'agent confirme avoir REMIS l'argent au membre (retrait en agence). */
export async function confirmerRetrait(code: string, agentId: string | undefined, numeroPiece: string) {
  const res = await rpc("valider_retrait_agent", {
    qr_code: code,
    agent_id: agentId ?? null,
    numero_piece: numeroPiece,
  });
  if (res && res["success"] === false) throw new Error(String(res["message"] ?? "Retrait refusé."));
  if (!res) {
    const { error } = await supabase
      .from("qr_tokens")
      .update({ statut: "used", used_at: new Date().toISOString(), agent_id: agentId ?? null, numero_piece: numeroPiece })
      .eq("code", code);
    if (error) throw error;
  }
  await logJournal({ userId: agentId, action: "retrait_agent", description: `${code} · pièce ${numeroPiece}` }).catch(
    () => undefined,
  );
  return String(res?.["message"] ?? "Retrait remis au membre.");
}
