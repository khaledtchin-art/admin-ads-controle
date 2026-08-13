import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { backend as supabase } from "@/integrations/firebase/client";
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
import { shortDate, shortId, useAdminTable } from "@/lib/admin-queries";
import { logSecurity } from "@/lib/security-queries";
import { Empty, Panel, StatusBadge } from "./ui";

type Row = Record<string, unknown>;

export function KycPanel({ adminId }: { adminId: string }) {
  const qc = useQueryClient();
  const kyc = useAdminTable<Row>("kyc_submissions");
  const profiles = useAdminTable<Row>("profiles");
  const [reject, setReject] = useState<Row | null>(null);
  const [docs, setDocs] = useState<Row | null>(null);
  const [reason, setReason] = useState("");

  const rows = kyc.data ?? [];
  const profile = (uid: unknown) => (profiles.data ?? []).find((p) => p["id"] === uid);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "kyc_submissions"] });
    qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
    qc.invalidateQueries({ queryKey: ["admin", "security_logs"] });
  };

  const decide = async (k: Row, approved: boolean, motif?: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("kyc_submissions")
      .update({
        status: approved ? "approved" : "rejected",
        rejection_reason: approved ? null : (motif ?? null),
        reviewed_by: adminId,
        reviewed_at: now,
      })
      .eq("id", String(k["id"]));
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase
      .from("profiles")
      .update({
        kyc_status: approved ? "approved" : "rejected",
        kyc_verified_at: approved ? now : null,
      })
      .eq("id", String(k["user_id"]));
    await supabase.from("notifications").insert({
      user_id: String(k["user_id"]),
      title: approved ? "KYC validé" : "KYC refusé",
      message: approved
        ? "Votre identité a été vérifiée. Les retraits sont maintenant disponibles."
        : `Votre vérification d'identité a été refusée. Motif : ${motif}`,
      type: approved ? "kyc_valide" : "kyc_refuse",
    });
    await logSecurity({
      adminId,
      userId: String(k["user_id"]),
      action: approved ? "kyc.approve" : "kyc.reject",
      type: "kyc",
      severity: approved ? "low" : "medium",
      details: { kyc_id: k["id"], reason: motif ?? null },
    });
    toast.success(approved ? "KYC validé" : "KYC refusé");
    refresh();
  };

  const confirmReject = async () => {
    if (!reject || reason.trim().length < 3) {
      toast.error("La raison du refus est obligatoire.");
      return;
    }
    await decide(reject, false, reason.trim());
    setReject(null);
    setReason("");
  };

  return (
    <>
      <Panel
        title="KYC Vérification"
        description="Les retraits restent bloqués tant que le KYC n'est pas validé."
        count={rows.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom complet</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Demande</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Validé le</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <Empty cols={7} />}
            {rows.map((k) => {
              const p = profile(k["user_id"]);
              const pending = String(k["status"]) === "pending";
              return (
                <TableRow key={String(k["id"])}>
                  <TableCell>{String(k["full_name"] ?? p?.["full_name"] ?? shortId(k["user_id"]))}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {String(k["phone"] ?? p?.["phone"] ?? "—")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{String(p?.["email"] ?? "—")}</TableCell>
                  <TableCell className="text-muted-foreground">{shortDate(k["created_at"])}</TableCell>
                  <TableCell><StatusBadge status={k["status"]} /></TableCell>
                  <TableCell className="text-muted-foreground">{shortDate(k["reviewed_at"])}</TableCell>
                  <TableCell className="space-x-2 whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setDocs(k)}>Documents</Button>
                    <Button size="sm" disabled={!pending} onClick={() => decide(k, true)}>Valider</Button>
                    <Button size="sm" variant="outline" disabled={!pending} onClick={() => setReject(k)}>
                      Refuser
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      <Dialog open={docs !== null} onOpenChange={(o) => !o && setDocs(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Documents KYC</DialogTitle>
            <DialogDescription>
              {String(docs?.["document_type"] ?? "—")} · n° {String(docs?.["document_number"] ?? "—")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["front_url", "back_url", "selfie_url"] as const).map((key) => {
              const url = docs?.[key] ? String(docs[key]) : null;
              const label = key === "front_url" ? "Recto" : key === "back_url" ? "Verso" : "Selfie";
              return (
                <div key={key} className="rounded-md border border-border p-2 text-center text-xs">
                  <p className="mb-2 text-muted-foreground">{label}</p>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
                      Ouvrir le document
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Non fourni</span>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reject !== null} onOpenChange={(o) => !o && setReject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser le KYC</DialogTitle>
            <DialogDescription>La raison est obligatoire et sera notifiée à l'utilisateur.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="Motif…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReject(null)}>Annuler</Button>
            <Button variant="destructive" onClick={confirmReject}>Confirmer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}