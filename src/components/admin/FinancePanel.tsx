import { useMemo, useState } from "react";
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
import { money, shortDate, shortId, useAdminTable } from "@/lib/admin-queries";
import { downloadCsv, useFinanceOverview } from "@/lib/security-queries";
import { Empty, Panel, Stat, StatusBadge } from "./ui";

type Row = Record<string, unknown>;

const PERIODS = { "7": "7 jours", "30": "30 jours", "90": "90 jours", all: "Tout" } as const;

export function FinancePanel() {
  const overview = useFinanceOverview();
  const deposits = useAdminTable<Row>("deposits");
  const withdrawals = useAdminTable<Row>("withdrawals");
  const transactions = useAdminTable<Row>("transactions", 500);
  const wallets = useAdminTable<Row>("wallets");
  const referrals = useAdminTable<Row>("referrals");

  const [period, setPeriod] = useState<keyof typeof PERIODS>("30");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");

  const inPeriod = (r: Row) => {
    if (period === "all") return true;
    const days = Number(period);
    return Date.now() - new Date(String(r["created_at"])).getTime() <= days * 86_400_000;
  };

  const filteredTx = useMemo(
    () =>
      (transactions.data ?? [])
        .filter(inPeriod)
        .filter((t) => type === "all" || String(t["type"]) === type)
        .filter((t) =>
          search.trim() === "" ? true : String(t["user_id"]).includes(search.trim()),
        ),
    [transactions.data, period, type, search],
  );

  const o = overview.data as Record<string, unknown> | null;
  const feeRate = 0.02;
  const withdrawVolume = Number(o?.["total_withdrawals"] ?? 0);

  /** Évolution : dépôts et retraits agrégés par jour sur la période. */
  const evolution = useMemo(() => {
    const map = new Map<string, { dep: number; wit: number }>();
    (deposits.data ?? []).filter(inPeriod).forEach((d) => {
      const k = String(d["created_at"]).slice(0, 10);
      const cur = map.get(k) ?? { dep: 0, wit: 0 };
      map.set(k, { ...cur, dep: cur.dep + Number(d["amount"] ?? 0) });
    });
    (withdrawals.data ?? []).filter(inPeriod).forEach((w) => {
      const k = String(w["created_at"]).slice(0, 10);
      const cur = map.get(k) ?? { dep: 0, wit: 0 };
      map.set(k, { ...cur, wit: cur.wit + Number(w["amount"] ?? 0) });
    });
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30);
  }, [deposits.data, withdrawals.data, period]);

  const maxDay = Math.max(1, ...evolution.map(([, v]) => Math.max(v.dep, v.wit)));

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Transactions totales" value={String(o?.["total_transactions"] ?? 0)} />
        <Stat label="Volume des dépôts" value={money(o?.["total_deposits"])} />
        <Stat label="Volume des retraits" value={money(withdrawVolume)} />
        <Stat label="Solde total des wallets" value={money(o?.["total_wallet_balance"])} />
        <Stat label="Commissions de parrainage" value={money(o?.["total_commissions"])} />
        <Stat
          label="Frais de retrait collectés"
          value={money(withdrawVolume * feeRate)}
          hint="Estimation à 2 % du volume retiré"
        />
        <Stat
          label="Revenus ADS"
          value={money(withdrawVolume * feeRate + Number(o?.["total_commissions"] ?? 0) * 0)}
          hint="Frais collectés nets des commissions distribuées"
        />
        <Stat label="Retraits en attente" value={String(o?.["pending_withdrawals"] ?? 0)} />
      </section>

      <Panel
        title="Rapports"
        description="Filtrez par période puis exportez les données au format CSV."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as keyof typeof PERIODS)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PERIODS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => downloadCsv("transactions.csv", filteredTx)}>
              Export transactions
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadCsv("depots.csv", (deposits.data ?? []).filter(inPeriod))}
            >
              Export dépôts
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadCsv("retraits.csv", (withdrawals.data ?? []).filter(inPeriod))}
            >
              Export retraits
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {evolution.length === 0 && (
            <p className="py-6 text-center text-muted-foreground">Aucun mouvement sur la période.</p>
          )}
          {evolution.map(([day, v]) => (
            <div key={day} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground">{day}</span>
              <div className="flex-1 space-y-1">
                <div className="h-2 rounded-full bg-success/70" style={{ width: `${(v.dep / maxDay) * 100}%` }} />
                <div className="h-2 rounded-full bg-warning/70" style={{ width: `${(v.wit / maxDay) * 100}%` }} />
              </div>
              <span className="w-56 shrink-0 text-right text-muted-foreground">
                +{money(v.dep)} / −{money(v.wit)}
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Dépôts" count={deposits.data?.length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Méthode</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Référence</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(deposits.data ?? []).length === 0 && <Empty cols={6} />}
            {(deposits.data ?? []).map((d) => (
              <TableRow key={String(d["id"])}>
                <TableCell className="font-mono text-xs">{shortId(d["user_id"])}</TableCell>
                <TableCell className="text-muted-foreground">{String(d["method"] ?? "—")}</TableCell>
                <TableCell>{money(d["amount"])}</TableCell>
                <TableCell className="font-mono text-xs">{String(d["reference"] ?? "—")}</TableCell>
                <TableCell><StatusBadge status={d["status"]} /></TableCell>
                <TableCell className="text-muted-foreground">{shortDate(d["created_at"])}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel
        title="Transactions"
        count={filteredTx.length}
        actions={
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un utilisateur…"
              className="h-9 w-52"
            />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["all", "depot", "retrait", "transfert", "achat", "commission"].map((t) => (
                  <SelectItem key={t} value={t}>{t === "all" ? "Tous types" : t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Réf.</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTx.length === 0 && <Empty cols={6} />}
            {filteredTx.map((t) => (
              <TableRow key={String(t["id"])}>
                <TableCell className="font-mono text-xs">{shortId(t["id"])}</TableCell>
                <TableCell className="font-mono text-xs">{shortId(t["user_id"])}</TableCell>
                <TableCell>{String(t["type"] ?? "—")}</TableCell>
                <TableCell>{money(t["amount"])}</TableCell>
                <TableCell><StatusBadge status={t["status"]} /></TableCell>
                <TableCell className="text-muted-foreground">{shortDate(t["created_at"])}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel
        title="Wallets"
        description="Lecture seule : aucune modification directe du solde n'est possible depuis l'interface."
        count={wallets.data?.length}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Solde</TableHead>
              <TableHead>Bloqué</TableHead>
              <TableHead>Mouvements</TableHead>
              <TableHead>Mis à jour</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(wallets.data ?? []).length === 0 && <Empty cols={5} />}
            {(wallets.data ?? []).map((w) => (
              <TableRow key={String(w["id"])}>
                <TableCell className="font-mono text-xs">{shortId(w["user_id"])}</TableCell>
                <TableCell>{money(w["balance"], String(w["currency"] ?? "XOF"))}</TableCell>
                <TableCell className="text-muted-foreground">{money(w["locked_balance"])}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(transactions.data ?? []).filter((t) => t["user_id"] === w["user_id"]).length}
                </TableCell>
                <TableCell className="text-muted-foreground">{shortDate(w["updated_at"])}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Commissions de parrainage" count={referrals.data?.length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Parrain</TableHead>
              <TableHead>Filleul</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(referrals.data ?? []).length === 0 && <Empty cols={5} />}
            {(referrals.data ?? []).map((r) => (
              <TableRow key={String(r["id"])}>
                <TableCell className="font-mono text-xs">{shortId(r["referrer_id"])}</TableCell>
                <TableCell className="font-mono text-xs">{shortId(r["referred_id"])}</TableCell>
                <TableCell>{String(r["code"] ?? "—")}</TableCell>
                <TableCell>{money(r["commission"])}</TableCell>
                <TableCell className="text-muted-foreground">{shortDate(r["created_at"])}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}