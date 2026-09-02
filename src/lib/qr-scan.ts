import { supabase } from "@/integrations/ads/client";
import { logJournal, type Row } from "@/lib/ads-queries";

export type ScanKind = "ticket" | "recu" | "profil";
export type ScanOutcome = "valide" | "invalide" | "deja_utilise";

export type ScanResult = {
  kind: ScanKind;
  outcome: ScanOutcome;
  raw: string;
  title: string;
  message: string;
  photoUrl?: string | undefined;
  profile?: Row | undefined;
  ticket?: Row | undefined;
  evenement?: Row | undefined;
  recu?: Row | undefined;
  transaction?: Row | undefined;
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Extrait l'identifiant utile d'un QR (texte brut, URL ou JSON). */
export function extractToken(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("{")) {
    try {
      const o = JSON.parse(value) as Record<string, unknown>;
      const k = o["qr"] ?? o["id"] ?? o["ticket"] ?? o["user_id"] ?? o["code"];
      if (k) return String(k);
    } catch {
      /* ignore */
    }
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const u = new URL(value);
      const inQuery = ["id", "code", "ref", "ticket", "user"].map((p) => u.searchParams.get(p)).find(Boolean);
      if (inQuery) return inQuery;
      const seg = u.pathname.split("/").filter(Boolean).pop();
      if (seg) return decodeURIComponent(seg);
    } catch {
      /* ignore */
    }
  }
  const m = UUID.exec(value);
  return m ? m[0] : value;
}

async function fetchProfile(userId: unknown): Promise<Row | undefined> {
  if (!userId) return undefined;
  const { data } = await supabase.from("profiles").select("*").eq("id", String(userId)).maybeSingle();
  return (data as Row | null) ?? undefined;
}

async function logScan(input: {
  kind: ScanKind;
  outcome: ScanOutcome;
  raw: string;
  adminId: string | undefined;
  userId?: unknown;
}) {
  await supabase
    .from("qr_scans_log")
    .insert({
      type_scan: input.kind,
      scanne_par: input.adminId ?? null,
      qr_data_scanne: input.raw.slice(0, 500),
      resultat: input.outcome,
      user_concerne_id: input.userId ? String(input.userId) : null,
    })
    .then(() => undefined, () => undefined);
  await logJournal({
    userId: input.adminId,
    action: `scan_${input.kind}`,
    description: `${input.outcome} · ${input.raw.slice(0, 120)}`,
  }).catch(() => undefined);
}

/* --------------------------------- Ticket -------------------------------- */

/**
 * Appelle une fonction SQL de la base ADS. Renvoie `null` si la fonction est
 * absente ou en erreur (on retombe alors sur la lecture directe des tables).
 */
async function rpc(name: string, args: Record<string, unknown>): Promise<Row | null> {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error || data == null) return null;
    const row = Array.isArray(data) ? (data[0] as Row | undefined) : (data as Row);
    return row ?? null;
  } catch {
    return null;
  }
}

export async function scanTicket(raw: string, adminId: string | undefined): Promise<ScanResult> {
  const token = extractToken(raw);

  // 1) Fonction dédiée côté ADS
  const v = await rpc("verifier_qr_ticket", { qr_code: token });
  if (v) {
    const statut = String(v["statut"] ?? v["statut_ticket"] ?? "").toLowerCase();
    const outcome: ScanOutcome = statut === "utilise" ? "deja_utilise" : statut === "valide" || statut === "" ? "valide" : "invalide";
    const dateScan = v["date_scan"] ? new Date(String(v["date_scan"])).toLocaleString("fr-FR") : "—";
    await logScan({ kind: "ticket", outcome, raw, adminId, userId: v["user_id"] });
    return {
      kind: "ticket",
      outcome,
      raw,
      title:
        outcome === "valide" ? "Ticket valide" : outcome === "deja_utilise" ? `DÉJÀ UTILISÉ le ${dateScan}` : `Ticket ${statut || "invalide"}`,
      message: outcome === "valide" ? "Contrôle de l'entrée autorisé." : "Entrée refusée.",
      photoUrl: (v["photo_url"] ?? v["photo"] ?? undefined) as string | undefined,
      ticket: { ...v, id: v["ticket_id"] ?? v["id"], qr_code_unique: token },
      profile: {
        id: v["user_id"],
        nom: v["nom"] ?? v["nom_membre"],
        numero_membre: v["numero_membre"],
        niveau: v["niveau"],
        statut: v["statut_compte"],
      } as Row,
      evenement: { titre: v["titre_evenement"] ?? v["evenement"], lieu: v["lieu"] } as Row,
    };
  }

  const { data } = await supabase
    .from("tickets_evenements")
    .select("*")
    .or(`qr_code_unique.eq.${token},id.eq.${UUID.test(token) ? token : "00000000-0000-0000-0000-000000000000"}`)
    .maybeSingle();
  const ticket = (data as Row | null) ?? undefined;

  if (!ticket) {
    const res: ScanResult = {
      kind: "ticket",
      outcome: "invalide",
      raw,
      title: "Ticket introuvable",
      message: "Aucun ticket ne correspond à ce QR code.",
    };
    await logScan({ kind: "ticket", outcome: "invalide", raw, adminId });
    return res;
  }

  const statut = String(ticket["statut"] ?? "").toLowerCase();
  const [profile, evenement] = await Promise.all([
    fetchProfile(ticket["user_id"]),
    ticket["evenement_id"]
      ? supabase
          .from("evenements")
          .select("*")
          .eq("id", String(ticket["evenement_id"]))
          .maybeSingle()
          .then(({ data: e }) => (e as Row | null) ?? undefined)
      : Promise.resolve(undefined),
  ]);

  const outcome: ScanOutcome =
    statut === "utilise" ? "deja_utilise" : statut === "valide" || statut === "" ? "valide" : "invalide";

  await logScan({ kind: "ticket", outcome, raw, adminId, userId: ticket["user_id"] });

  return {
    kind: "ticket",
    outcome,
    raw,
    title:
      outcome === "valide"
        ? "Ticket valide"
        : outcome === "deja_utilise"
          ? "TICKET DÉJÀ UTILISÉ"
          : `Ticket ${statut || "invalide"}`,
    message:
      outcome === "deja_utilise"
        ? `Scanné le ${ticket["date_scan"] ? new Date(String(ticket["date_scan"])).toLocaleString("fr-FR") : "—"}`
        : "Contrôle de l'entrée autorisé.",
    ticket,
    profile,
    evenement,
  };
}

/** Valide l'entrée via la fonction ADS, avec repli sur une mise à jour directe. */
export async function validerEntree(ticketId: string, adminId: string | undefined, qrCode?: string) {
  if (qrCode) {
    const res = await rpc("valider_ticket_scan", { qr_code: qrCode, admin_id: adminId ?? null });
    if (res) {
      const ok = res["success"] !== false;
      const message = String(res["message"] ?? (ok ? "Entrée validée." : "Validation refusée."));
      if (!ok) throw new Error(message);
      await logJournal({ userId: adminId, action: "ticket_valide", description: qrCode }).catch(() => undefined);
      return message;
    }
  }
  const { error } = await supabase
    .from("tickets_evenements")
    .update({ statut: "utilise", date_scan: new Date().toISOString(), scanne_par: adminId ?? null })
    .eq("id", ticketId);
  if (error) throw error;
  await logJournal({ userId: adminId, action: "ticket_valide", description: ticketId }).catch(() => undefined);
  return "Entrée validée.";
}

/* ---------------------------------- Reçu --------------------------------- */

export async function scanRecu(raw: string, adminId: string | undefined): Promise<ScanResult> {
  const token = extractToken(raw);
  const isUuid = UUID.test(token);
  let recu: Row | undefined;
  if (isUuid) {
    const { data } = await supabase
      .from("recus")
      .select("*")
      .or(`id.eq.${token},transaction_id.eq.${token}`)
      .maybeSingle();
    recu = (data as Row | null) ?? undefined;
  }

  let transaction: Row | undefined;
  const txId = recu?.["transaction_id"] ?? (isUuid ? token : undefined);
  if (txId) {
    const { data } = await supabase.from("transactions").select("*").eq("id", String(txId)).maybeSingle();
    transaction = (data as Row | null) ?? undefined;
  }

  const ok = Boolean(recu ?? transaction);
  const profile = await fetchProfile(recu?.["user_id"] ?? transaction?.["user_id"]);
  const outcome: ScanOutcome = ok ? "valide" : "invalide";
  await logScan({ kind: "recu", outcome, raw, adminId, userId: recu?.["user_id"] ?? transaction?.["user_id"] });

  return {
    kind: "recu",
    outcome,
    raw,
    title: ok ? "Reçu authentique" : "Reçu falsifié ou introuvable",
    message: ok ? "Le reçu correspond à une transaction enregistrée." : "Aucune correspondance en base ADS.",
    recu,
    transaction,
    profile,
  };
}

/* --------------------------------- Profil -------------------------------- */

export async function scanProfil(raw: string, adminId: string | undefined): Promise<ScanResult> {
  const token = extractToken(raw);

  const v = await rpc("verifier_qr_membre", { qr_code: token });
  if (v) {
    const statut = String(v["statut"] ?? "actif").toLowerCase();
    const outcome: ScanOutcome = statut === "actif" || statut === "" ? "valide" : "invalide";
    await logScan({ kind: "profil", outcome, raw, adminId, userId: v["user_id"] ?? v["id"] });
    return {
      kind: "profil",
      outcome,
      raw,
      title: outcome === "valide" ? "Membre vérifié ✅" : `Compte ${statut}`,
      message: outcome === "valide" ? "Identité confirmée sur la base ADS." : "Ce compte n'est pas actif.",
      photoUrl: (v["photo_url"] ?? v["photo"] ?? undefined) as string | undefined,
      profile: v,
    };
  }

  let profile = UUID.test(token) ? await fetchProfile(token) : undefined;
  if (!profile) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .or(`code_parrainage.eq.${token},numero_membre.eq.${token}`)
      .maybeSingle();
    profile = (data as Row | null) ?? undefined;
  }
  const outcome: ScanOutcome = profile ? "valide" : "invalide";
  await logScan({ kind: "profil", outcome, raw, adminId, userId: profile?.["id"] });
  return {
    kind: "profil",
    outcome,
    raw,
    title: profile ? "Membre vérifié ADS" : "Membre introuvable",
    message: profile
      ? `Compte ${String(profile["statut"] ?? "actif")}`
      : "Ce QR code ne correspond à aucun compte ADS.",
    profile,
  };
}

export async function runScan(kind: ScanKind, raw: string, adminId: string | undefined) {
  if (kind === "ticket") return scanTicket(raw, adminId);
  if (kind === "recu") return scanRecu(raw, adminId);
  return scanProfil(raw, adminId);
}