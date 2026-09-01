import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/ads/client";
import { Panel, Empty } from "./ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { shortDate, shortId, type Row } from "@/lib/ads-queries";

const PAGE_SIZE = 25;

type Filters = { q: string; action: string; userId: string; from: string; to: string };

const EMPTY_FILTERS: Filters = { q: "", action: "", userId: "", from: "", to: "" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Échappe les caractères spéciaux du filtre `or=` de PostgREST. */
const esc = (v: string) => v.replace(/[(),*]/g, " ").trim();

export function JournalPanel() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(filters);
  const [page, setPage] = useState(0);

  const logs = useQuery({
    queryKey: ["ads", "journal", applied, page],
    queryFn: async () => {
      let q = supabase
        .from("journal")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const term = esc(applied.q);
      if (term) {
        const ors = [`action.ilike.%${term}%`, `description.ilike.%${term}%`];
        if (UUID_RE.test(term)) ors.push(`user_id.eq.${term}`);
        q = q.or(ors.join(","));
      }
      if (applied.action.trim()) q = q.ilike("action", `%${applied.action.trim()}%`);
      if (applied.userId.trim()) q = q.eq("user_id", applied.userId.trim());
      if (applied.from) q = q.gte("created_at", new Date(applied.from).toISOString());
      if (applied.to) q = q.lte("created_at", new Date(`${applied.to}T23:59:59`).toISOString());
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as Row[], total: count ?? 0 };
    },
  });

  const messages = useQuery({
    queryKey: ["ads", "messages_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages_admin")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const total = logs.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const msgCols = useMemo(
    () => (messages.data?.[0] ? Object.keys(messages.data[0]) : []),
    [messages.data],
  );

  function apply() {
    setPage(0);
    setApplied(filters);
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Logs admin — table journal"
        description="Historique des actions enregistrées dans la table `journal` de la base ADS."
        count={total}
        actions={
          <Button variant="outline" size="sm" onClick={() => logs.refetch()} disabled={logs.isFetching}>
            {logs.isFetching ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Actualiser
          </Button>
        }
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Action">
            <Input
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              placeholder="connexion, validation…"
            />
          </Field>
          <Field label="User ID">
            <Input
              value={filters.userId}
              onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
              placeholder="uuid exact"
            />
          </Field>
          <Field label="Du">
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </Field>
          <Field label="Au">
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </Field>
          <div className="flex items-end gap-2">
            <Button className="flex-1" onClick={apply}>
              Filtrer
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const empty = { action: "", userId: "", from: "", to: "" };
                setFilters(empty);
                setApplied(empty);
                setPage(0);
              }}
            >
              Réinit.
            </Button>
          </div>
        </div>

        {logs.error && (
          <p className="mb-3 text-sm text-destructive">{(logs.error as Error).message}</p>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Appareil</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Chargement…
                </TableCell>
              </TableRow>
            ) : logs.data?.rows.length ? (
              logs.data.rows.map((r) => (
                <TableRow key={String(r["id"])}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {shortDate(r["created_at"])}
                  </TableCell>
                  <TableCell className="font-medium">{String(r["action"] ?? "—")}</TableCell>
                  <TableCell className="font-mono text-xs">{shortId(r["user_id"])}</TableCell>
                  <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground">
                    {String(r["description"] ?? "—")}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {String(r["appareil"] ?? "—")}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <Empty cols={5} />
            )}
          </TableBody>
        </Table>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} / {pages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" /> Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </Panel>

      <Panel
        title="Messages admin"
        description="20 dernières entrées de `messages_admin`."
        count={messages.data?.length}
      >
        {messages.error ? (
          <p className="text-sm text-destructive">{(messages.error as Error).message}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {msgCols.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
                {msgCols.length === 0 && <TableHead>Contenu</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.data?.length ? (
                messages.data.map((r, i) => (
                  <TableRow key={String(r["id"] ?? i)}>
                    {msgCols.map((c) => (
                      <TableCell key={c} className="max-w-[240px] truncate text-sm">
                        {c.includes("_at") ? shortDate(r[c]) : String(r[c] ?? "—")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <Empty cols={Math.max(1, msgCols.length)} />
              )}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
