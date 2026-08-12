import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { shortDate, shortId, useAdminTable } from "@/lib/admin-queries";
import { useNotificationsAdmin, useSendNotification } from "@/lib/security-queries";
import { Empty, Panel, StatusBadge } from "./ui";

type Row = Record<string, unknown>;

const TYPES = [
  "kyc_valide",
  "kyc_refuse",
  "retrait_demande",
  "retrait_approuve",
  "retrait_refuse",
  "depot_confirme",
  "paiement_reussi",
  "achat_marketplace",
  "commission_recue",
  "securite_compte",
];

export function NotificationsPanel({ adminId }: { adminId: string }) {
  const notifications = useNotificationsAdmin();
  const profiles = useAdminTable<Row>("profiles");
  const send = useSendNotification(adminId);

  const [target, setTarget] = useState("all");
  const [type, setType] = useState("securite_compte");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");

  const rows = (notifications.data ?? []).filter((n: Row) => {
    const okType = filterType === "all" || String(n["type"]) === filterType;
    const okSearch = search.trim() === "" || String(n["user_id"]).includes(search.trim());
    return okType && okSearch;
  });

  const submit = () => {
    if (title.trim() === "" || message.trim() === "") {
      toast.error("Titre et message obligatoires.");
      return;
    }
    const ids =
      target === "all"
        ? (profiles.data ?? []).map((p) => String(p["id"]))
        : [target];
    send.mutate(
      { userIds: ids, title: title.trim(), message: message.trim(), type },
      {
        onSuccess: () => {
          toast.success(`Notification envoyée à ${ids.length} utilisateur(s)`);
          setTitle("");
          setMessage("");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur d'envoi"),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Panel title="Envoi manuel" description="Notification individuelle ou envoi à tous les utilisateurs.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger><SelectValue placeholder="Destinataire" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les utilisateurs</SelectItem>
              {(profiles.data ?? []).map((p) => (
                <SelectItem key={String(p["id"])} value={String(p["id"])}>
                  {String(p["full_name"] ?? p["email"] ?? shortId(p["id"]))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" />
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message"
            className="sm:col-span-2"
          />
          <Button className="sm:col-span-2" disabled={send.isPending} onClick={submit}>
            Envoyer
          </Button>
        </div>
      </Panel>

      <Panel
        title="Centre de notifications"
        count={rows.length}
        actions={
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Utilisateur…"
              className="h-9 w-44"
            />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Titre</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Lu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <Empty cols={5} />}
            {rows.map((n: Row) => (
              <TableRow key={String(n["id"])}>
                <TableCell className="text-muted-foreground">{shortDate(n["created_at"])}</TableCell>
                <TableCell className="font-mono text-xs">{shortId(n["user_id"])}</TableCell>
                <TableCell>{String(n["title"])}</TableCell>
                <TableCell className="text-muted-foreground">{String(n["type"])}</TableCell>
                <TableCell><StatusBadge status={n["is_read"] ? "lu" : "non lu"} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}