import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, shortDate, shortId, useAdminTable } from "@/lib/admin-queries";
import { logSecurity, useDuplicateAccounts, useSecurityLogs } from "@/lib/security-queries";
import { Empty, Panel, Stat, StatusBadge } from "./ui";

type Row = Record<string, unknown>;

const KIND_LABEL: Record<string, string> = {
  phone: "Même numéro de téléphone",
  device: "Même appareil",
  ip: "Même adresse IP",
};

export function SecurityPanel({ adminId }: { adminId: string }) {
  const qc = useQueryClient();
  const profiles = useAdminTable<Row>("profiles");
  const withdrawals = useAdminTable<Row>("withdrawals");
  const logs = useSecurityLogs();
  const duplicates = useDuplicateAccounts();
  const [noteFor, setNoteFor] = useState<Row | null>(null);
  const [note, setNote] = useState("");

  const allProfiles = profiles.data ?? [];

  /** Créations massives : > 5 comptes sur une même journée. */
  const massSignups = useMemo(() => {
    const byDay = new Map<string, number>();
    allProfiles.forEach((p) => {
      const d = String(p["created_at"] ?? "").slice(0, 10);
      if (d) byDay.set(d, (byDay.get(d) ?? 0) + 1);
    });
    return [...byDay.entries()].filter(([, n]) => n > 5).sort((a, b) => b[1] - a[1]);
  }, [allProfiles]);

  /** Retraits répétés : 3 demandes ou plus sur 24 h pour un même utilisateur. */
  const repeatedWithdrawals = useMemo(() => {
    const by = new Map<string, Row[]>();
    (withdrawals.data ?? []).forEach((w) => {
      if (Date.now() - new Date(String(w["created_at"])).getTime() > 86_400_000) return;
      const k = String(w["user_id"]);
      by.set(k, [...(by.get(k) ?? []), w]);
    });
    return [...by.entries()].filter(([, list]) => list.length >= 3);
  }, [withdrawals.data]);

  const riskyWithdrawals = (withdrawals.data ?? []).filter((w) => {
    if (String(w["status"]) !== "pending") return false;
    const p = allProfiles.find((x) => x["id"] === w["user_id"]);
    return String(p?.["kyc_status"] ?? "pending") !== "approved" || Number(w["amount"] ?? 0) > 500_000;
  });

  const failedLogins = (logs.data ?? []).filter((l) => String(l["type"]) === "login_failed");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
    qc.invalidateQueries({ queryKey: ["admin", "security_logs"] });
  };

  const act = async (
    p: Row,
    values: Record<string, unknown>,
    action: string,
    severity: "low" | "medium" | "high",
  ) => {
    const { error } = await supabase.from("profiles").update(values as never).eq("id", String(p["id"]));
    if (error) {
      toast.error(error.message);
      return;
    }
    await logSecurity({ adminId, userId: String(p["id"]), action, type: "account", severity, details: values });
    toast.success("Action enregistrée");
    refresh();
  };

  const saveNote = async () => {
    if (!noteFor) return;
    await act(noteFor, { internal_note: note }, "account.note", "low");
    setNoteFor(null);
    setNote("");
  };

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Groupes de comptes suspects" value={String(duplicates.data?.length ?? 0)} />
        <Stat label="Retraits à risque" value={String(riskyWithdrawals.length)} />
        <Stat label="Connexions échouées" value={String(failedLogins.length)} />
        <Stat label="Journées de création massive" value={String(massSignups.length)} />
      </section>

      <Panel
        title="Comptes suspects"
        description="Comptes partageant un même téléphone, appareil ou adresse IP."
        count={duplicates.data?.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Valeur</TableHead>
              <TableHead>Comptes</TableHead>
              <TableHead>Identifiants</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(duplicates.data ?? []).length === 0 && <Empty cols={4} />}
            {(duplicates.data ?? []).map((d: Row, i: number) => (
              <TableRow key={`${String(d["kind"])}-${i}`}>
                <TableCell>{KIND_LABEL[String(d["kind"])] ?? String(d["kind"])}</TableCell>
                <TableCell className="font-mono text-xs">{String(d["value"])}</TableCell>
                <TableCell><StatusBadge status={`${String(d["account_count"])} comptes`} /></TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">
                  {(d["user_ids"] as string[] | null)?.map((u) => shortId(u)).join(", ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Retraits à risque" count={riskyWithdrawals.length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Motif d'alerte</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {riskyWithdrawals.length === 0 && <Empty cols={4} />}
            {riskyWithdrawals.map((w) => {
              const p = allProfiles.find((x) => x["id"] === w["user_id"]);
              return (
                <TableRow key={String(w["id"])}>
                  <TableCell>{String(p?.["full_name"] ?? shortId(w["user_id"]))}</TableCell>
                  <TableCell>{money(w["amount"])}</TableCell>
                  <TableCell className="text-xs text-warning">
                    {String(p?.["kyc_status"] ?? "pending") !== "approved" ? "KYC non validé" : "Montant élevé"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{shortDate(w["created_at"])}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      <Panel
        title="Activités inhabituelles"
        description="Créations massives de comptes et demandes de retrait répétées."
      >
        <ul className="space-y-2 text-sm">
          {massSignups.length === 0 && repeatedWithdrawals.length === 0 && (
            <li className="py-6 text-center text-muted-foreground">Aucune activité inhabituelle détectée.</li>
          )}
          {massSignups.map(([day, n]) => (
            <li key={day} className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
              {n} comptes créés le {day}
            </li>
          ))}
          {repeatedWithdrawals.map(([uid, list]) => (
            <li key={uid} className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
              {list.length} demandes de retrait en 24 h — utilisateur {shortId(uid)}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Actions sur les comptes" count={allProfiles.length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Retraits</TableHead>
              <TableHead>Note interne</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allProfiles.length === 0 && <Empty cols={5} />}
            {allProfiles.map((p) => {
              const suspended = String(p["status"]) === "suspended";
              const blocked = p["withdrawals_blocked"] === true;
              return (
                <TableRow key={String(p["id"])}>
                  <TableCell>{String(p["full_name"] ?? p["email"] ?? shortId(p["id"]))}</TableCell>
                  <TableCell><StatusBadge status={p["status"]} /></TableCell>
                  <TableCell><StatusBadge status={blocked ? "bloqués" : "autorisés"} /></TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {String(p["internal_note"] ?? "—")}
                  </TableCell>
                  <TableCell className="space-x-2 whitespace-nowrap text-right">
                    <Button
                      size="sm"
                      variant={suspended ? "outline" : "destructive"}
                      onClick={() =>
                        act(
                          p,
                          { status: suspended ? "active" : "suspended" },
                          suspended ? "account.reactivate" : "account.suspend",
                          suspended ? "low" : "high",
                        )
                      }
                    >
                      {suspended ? "Réactiver" : "Suspendre"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        act(
                          p,
                          { withdrawals_blocked: !blocked },
                          blocked ? "account.unblock_withdrawals" : "account.block_withdrawals",
                          "medium",
                        )
                      }
                    >
                      {blocked ? "Débloquer retraits" : "Bloquer retraits"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNoteFor(p);
                        setNote(String(p["internal_note"] ?? ""));
                      }}
                    >
                      Note
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Journal de sécurité (non supprimable)" count={logs.data?.length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Gravité</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Appareil</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(logs.data ?? []).length === 0 && <Empty cols={6} />}
            {(logs.data ?? []).map((l: Row) => (
              <TableRow key={String(l["id"])}>
                <TableCell className="text-muted-foreground">{shortDate(l["created_at"])}</TableCell>
                <TableCell>{String(l["action"])}</TableCell>
                <TableCell className="text-muted-foreground">{String(l["type"])}</TableCell>
                <TableCell><StatusBadge status={l["severity"]} /></TableCell>
                <TableCell className="font-mono text-xs">{shortId(l["user_id"])}</TableCell>
                <TableCell className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                  {String(l["device_info"] ?? "—")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Dialog open={noteFor !== null} onOpenChange={(o) => !o && setNoteFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Note interne</DialogTitle>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteFor(null)}>Annuler</Button>
            <Button onClick={saveNote}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}