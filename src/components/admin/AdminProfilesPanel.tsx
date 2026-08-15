import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/ads/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { shortDate, shortId, useAdminTable } from "@/lib/admin-queries";
import { ROLE_LABELS, logSecurity, type AdminRoleType } from "@/lib/security-queries";
import { Empty, Panel, StatusBadge } from "./ui";

type Row = Record<string, unknown>;

function useAdminProfiles() {
  return useQuery({
    queryKey: ["admin", "admin_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

export function AdminProfilesPanel({ adminId }: { adminId: string }) {
  const qc = useQueryClient();
  const admins = useAdminProfiles();
  const profiles = useAdminTable<Row>("profiles");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRoleType>("super_admin");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "admin_profiles"] });

  const add = async () => {
    const value = email.trim().toLowerCase();
    const target = (profiles.data ?? []).find(
      (p) => String(p["email"] ?? "").toLowerCase() === value,
    );
    if (!target) {
      toast.error("Aucun compte trouvé avec cet email.");
      return;
    }
    setBusy("add");
    const { error } = await supabase
      .from("admin_profiles")
      .upsert(
        { user_id: String(target["id"]), email: value, role },
        { onConflict: "user_id" },
      );
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logSecurity({
      adminId,
      userId: String(target["id"]),
      action: "admin_profile.grant",
      type: "roles",
      severity: "high",
      details: { role, email: value },
    });
    toast.success(`${ROLE_LABELS[role]} attribué à ${value}`);
    setEmail("");
    refresh();
  };

  const changeRole = async (r: Row, next: AdminRoleType) => {
    if (String(r["user_id"]) === adminId && next !== "super_admin") {
      toast.error("Impossible de retirer ton propre rôle super administrateur.");
      return;
    }
    setBusy(String(r["id"]));
    const { error } = await supabase
      .from("admin_profiles")
      .update({ role: next })
      .eq("id", String(r["id"]));
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logSecurity({
      adminId,
      userId: String(r["user_id"]),
      action: next === "super_admin" ? "admin_profile.promote" : "admin_profile.demote",
      type: "roles",
      severity: "high",
      details: { from: r["role"], to: next },
    });
    toast.success("Rôle mis à jour");
    refresh();
  };

  const remove = async (r: Row) => {
    if (String(r["user_id"]) === adminId) {
      toast.error("Impossible de révoquer ton propre accès administrateur.");
      return;
    }
    setBusy(String(r["id"]));
    const { error } = await supabase.from("admin_profiles").delete().eq("id", String(r["id"]));
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logSecurity({
      adminId,
      userId: String(r["user_id"]),
      action: "admin_profile.revoke",
      type: "roles",
      severity: "high",
      details: { role: r["role"] },
    });
    toast.success("Accès administrateur révoqué");
    refresh();
  };

  return (
    <Panel
      title="Profils administrateurs (admin_profiles)"
      description="Promotion et démotion réservées aux super administrateurs — chaque modification est journalisée et contrôlée côté base."
      count={admins.data?.length}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@exemple.com"
            className="h-9 w-56"
          />
          <Select value={role} onValueChange={(v) => setRole(v as AdminRoleType)}>
            <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as AdminRoleType[]).map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={add} disabled={busy === "add"}>Attribuer</Button>
        </div>
      }
    >
      {admins.error && (
        <p className="mb-3 text-sm text-destructive">
          Lecture refusée : seuls les super administrateurs peuvent consulter cette liste.
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Utilisateur</TableHead>
            <TableHead>Rôle</TableHead>
            <TableHead>Créé le</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(admins.data ?? []).length === 0 && <Empty cols={5} />}
          {(admins.data ?? []).map((r) => {
            const isSelf = String(r["user_id"]) === adminId;
            const isSuper = r["role"] === "super_admin";
            const disabled = busy === String(r["id"]);
            return (
              <TableRow key={String(r["id"])}>
                <TableCell>
                  {String(r["email"] ?? "—")}
                  {isSelf && <span className="ml-2 text-xs text-muted-foreground">(toi)</span>}
                </TableCell>
                <TableCell className="font-mono text-xs">{shortId(r["user_id"])}</TableCell>
                <TableCell><StatusBadge status={r["role"]} /></TableCell>
                <TableCell className="text-muted-foreground">{shortDate(r["created_at"])}</TableCell>
                <TableCell className="space-x-2 text-right">
                  {isSuper ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled || isSelf}
                      onClick={() => changeRole(r, "support_admin")}
                    >
                      Rétrograder
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={disabled}
                      onClick={() => changeRole(r, "super_admin")}
                    >
                      Promouvoir super_admin
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={disabled || isSelf}
                    onClick={() => remove(r)}
                  >
                    Révoquer
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
