import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, shortDate, shortId, useAdminTable } from "@/lib/admin-queries";
import { logSecurity } from "@/lib/security-queries";
import { Empty, Panel, StatusBadge } from "./ui";

type Row = Record<string, unknown>;

/** Contrôles de protection financière avant approbation d'un retrait. */
export function withdrawalRisk(w: Row, profile: Row | undefined, wallet: Row | undefined, history: Row[]) {
  const amount = Number(w["amount"] ?? 0);
  const balance = Number(wallet?.["balance"] ?? 0);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (String(profile?.["kyc_status"] ?? "pending") !== "approved") blockers.push("KYC non validé");
  if (profile?.["withdrawals_blocked"] === true) blockers.push("Retraits bloqués par un admin");
  if (String(profile?.["status"] ?? "active") === "suspended") blockers.push("Compte suspendu");
  if (amount > balance) blockers.push(`Montant supérieur au solde (${money(balance)})`);

  const created = profile?.["created_at"] ? new Date(String(profile["created_at"])).getTime() : 0;
  const ageDays = created ? (Date.now() - created) / 86_400_000 : 0;
  if (created && ageDays < 3) warnings.push(`Compte récent (${Math.floor(ageDays)} j)`);

  const mine = history.filter((h) => h["user_id"] === w["user_id"]);
  const past = mine.filter((h) => h["id"] !== w["id"]).map((h) => Number(h["amount"] ?? 0));
  const avg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0;
  if (avg > 0 && amount > avg * 3) warnings.push("Montant inhabituel (>3× la moyenne)");

  const last24h = mine.filter(
    (h) => Date.now() - new Date(String(h["created_at"])).getTime() < 86_400_000,
  ).length;
  if (last24h >= 3) warnings.push(`${last24h} demandes en 24 h`);

  return { blockers, warnings, amount, balance };
}

export function WithdrawalsPanel({ adminId }: { adminId: string }) {
  const qc = useQueryClient();
  const withdrawals = useAdminTable<Row>("withdrawals");
  const profiles = useAdminTable<Row>("profiles");
  const wallets = useAdminTable<Row>("wallets");
  const [reject, setReject] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = withdrawals.data ?? [];
  const byUser = useMemo(() => {
    const p = new Map<string, Row>();
    (profiles.data ?? []).forEach((r) => p.set(String(r["id"]), r));
    const w = new Map<string, Row>();
    (wallets.data ?? []).forEach((r) => w.set(String(r["user_id"]), r));
    return { p, w };
  }, [profiles.data, wallets.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "withdrawals"] });
    qc.invalidateQueries({ queryKey: ["admin", "security_logs"] });
    qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
  };

  const notify = (userId: string, title: string, message: string, type: string) =>
    supabase.from("notifications").insert({ user_id: userId, title, message, type });

  const approve = async (w: Row) => {
    const risk = withdrawalRisk(w, byUser.p.get(String(w["user_id"])), byUser.w.get(String(w["user_id"])), rows);
    if (risk.blockers.length > 0) {
      toast.error(`Approbation impossible : ${risk.blockers.join(" · ")}`);
      await logSecurity({
        adminId,
        userId: String(w["user_id"]),
        action: "withdrawal.approve_blocked",
        type: "withdrawal",
        severity: "high",
        details: { withdrawal_id: w["id"], blockers: risk.blockers },
      });
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("withdrawals")
      .update({ status: "approved", processed_by: adminId, processed_at: new Date().toISOString() })
      .eq("id", String(w["id"]));
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logSecurity({
      adminId,
      userId: String(w["user_id"]),
      action: "withdrawal.approve",
      type: "withdrawal",
      severity: risk.warnings.length ? "medium" : "low",
      details: { withdrawal_id: w["id"], amount: w["amount"], warnings: risk.warnings },
    });
    await notify(
      String(w["user_id"]),
      "Retrait approuvé",
      `Votre retrait de ${money(w["amount"])} a été approuvé.`,
      "retrait_approuve",
    );
    toast.success("Retrait approuvé");
    refresh();
  };

  const confirmReject = async () => {
    if (!reject || reason.trim().length < 3) {
      toast.error("Indiquez une raison.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("withdrawals")
      .update({
        status: "rejected",
        rejection_reason: reason.trim(),
        processed_by: adminId,
        processed_at: new Date().toISOString(),
      })
      .eq("id", String(reject["id"]));
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logSecurity({
      adminId,
      userId: String(reject["user_id"]),
      action: "withdrawal.reject",
      type: "withdrawal",
      severity: "medium",
      details: { withdrawal_id: reject["id"], reason: reason.trim() },
    });
    await notify(
      String(reject["user_id"]),
      "Retrait refusé",
      `Votre retrait de ${money(reject["amount"])} a été refusé. Motif : ${reason.trim()}`,
      "retrait_refuse",
    );
    toast.success("Retrait refusé");
    setReject(null);
    setReason("");
    refresh();
  };

  return (
    <>
      <Panel
        title="Gestion des retraits"
        description="Approbation contrôlée : KYC validé, solde suffisant, âge du compte et montants inhabituels."
        count={rows.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Mobile money</TableHead>
              <TableHead>Méthode</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Risque</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <Empty cols={8} />}
            {rows.map((w) => {
              const profile = byUser.p.get(String(w["user_id"]));
              const risk = withdrawalRisk(w, profile, byUser.w.get(String(w["user_id"])), rows);
              const pending = String(w["status"]) === "pending";
              return (
                <TableRow key={String(w["id"])}>
                  <TableCell>{String(profile?.["full_name"] ?? shortId(w["user_id"]))}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {String(w["phone"] ?? w["destination"] ?? profile?.["phone"] ?? "—")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{String(w["method"] ?? "—")}</TableCell>
                  <TableCell>{money(w["amount"])}</TableCell>
                  <TableCell className="text-muted-foreground">{shortDate(w["created_at"])}</TableCell>
                  <TableCell><StatusBadge status={w["status"]} /></TableCell>
                  <TableCell className="max-w-[220px] text-xs">
                    {risk.blockers.length > 0 ? (
                      <span className="text-destructive">{risk.blockers.join(" · ")}</span>
                    ) : risk.warnings.length > 0 ? (
                      <span className="text-warning">{risk.warnings.join(" · ")}</span>
                    ) : (
                      <span className="text-success">OK</span>
                    )}
                  </TableCell>
                  <TableCell className="space-x-2 whitespace-nowrap text-right">
                    <Button size="sm" disabled={!pending || busy} onClick={() => approve(w)}>
                      Approuver
                    </Button>
                    <Button size="sm" variant="outline" disabled={!pending || busy} onClick={() => setReject(w)}>
                      Refuser
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDetail(w)}>
                      Détails
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      <Dialog open={reject !== null} onOpenChange={(o) => !o && setReject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser le retrait</DialogTitle>
            <DialogDescription>La raison est obligatoire et sera transmise à l'utilisateur.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motif du refus…"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReject(null)}>Annuler</Button>
            <Button variant="destructive" disabled={busy} onClick={confirmReject}>Confirmer le refus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Détails du retrait</DialogTitle>
          </DialogHeader>
          <pre className="max-h-80 overflow-auto rounded-md bg-secondary p-3 text-xs">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}