import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  logSecurity,
  useAdminRoles,
  useSecurityLogs,
  type AdminRoleType,
} from "@/lib/security-queries";
import { Empty, Panel } from "./ui";

type Row = Record<string, unknown>;

export function RolesPanel({ adminId }: { adminId: string }) {
  const qc = useQueryClient();
  const roles = useAdminRoles();
  const profiles = useAdminTable<Row>("profiles");
  const logs = useSecurityLogs();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRoleType>("support_admin");

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "admin_roles"] });

  const add = async () => {
    const target = (profiles.data ?? []).find(
      (p) => String(p["email"] ?? "").toLowerCase() === email.trim().toLowerCase(),
    );
    if (!target) {
      toast.error("Aucun utilisateur avec cet email.");
      return;
    }
    const { error } = await supabase.from("admin_roles").insert({
      user_id: String(target["id"]),
      role,
      permissions: { allowed: ROLE_PERMISSIONS[role] } as never,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await logSecurity({
      adminId,
      userId: String(target["id"]),
      action: "admin_role.grant",
      type: "roles",
      severity: "high",
      details: { role, email: email.trim() },
    });
    toast.success(`${ROLE_LABELS[role]} attribué`);
    setEmail("");
    refresh();
  };

  const revoke = async (r: Row) => {
    const { error } = await supabase.from("admin_roles").delete().eq("id", String(r["id"]));
    if (error) {
      toast.error(error.message);
      return;
    }
    await logSecurity({
      adminId,
      userId: String(r["user_id"]),
      action: "admin_role.revoke",
      type: "roles",
      severity: "high",
      details: { role: r["role"] },
    });
    toast.success("Accès retiré");
    refresh();
  };

  const roleLogs = (logs.data ?? []).filter((l: Row) => String(l["type"]) === "roles");

  return (
    <div className="space-y-4">
      <Panel
        title="Gestion des administrateurs"
        description="Réservé au super administrateur : lui seul peut attribuer ou retirer un rôle."
        count={roles.data?.length}
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
            <Button size="sm" onClick={add}>Ajouter</Button>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Administrateur</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Ajouté le</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(roles.data ?? []).length === 0 && <Empty cols={5} />}
            {(roles.data ?? []).map((r: Row) => {
              const p = (profiles.data ?? []).find((x) => x["id"] === r["user_id"]);
              const perms = ROLE_PERMISSIONS[r["role"] as AdminRoleType] ?? [];
              return (
                <TableRow key={String(r["id"])}>
                  <TableCell>{String(p?.["email"] ?? shortId(r["user_id"]))}</TableCell>
                  <TableCell>{ROLE_LABELS[r["role"] as AdminRoleType] ?? String(r["role"])}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{perms.join(", ")}</TableCell>
                  <TableCell className="text-muted-foreground">{shortDate(r["created_at"])}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="destructive" onClick={() => revoke(r)}>Retirer</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Historique des actions sur les rôles" count={roleLogs.length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Cible</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roleLogs.length === 0 && <Empty cols={3} />}
            {roleLogs.map((l: Row) => (
              <TableRow key={String(l["id"])}>
                <TableCell className="text-muted-foreground">{shortDate(l["created_at"])}</TableCell>
                <TableCell>{String(l["action"])}</TableCell>
                <TableCell className="font-mono text-xs">{shortId(l["user_id"])}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}