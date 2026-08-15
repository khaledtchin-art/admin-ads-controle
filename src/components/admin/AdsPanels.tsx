import { useState } from "react";
import { Panel, Empty, StatusBadge } from "./ui";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { money, shortDate, shortId, useAdsTable, useAdsUpdate, type Row } from "@/lib/ads-queries";

function Refresh({ q }: { q: { refetch: () => unknown; isFetching: boolean } }) {
  return (
    <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
      {q.isFetching ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
    </Button>
  );
}

function Err({ e }: { e: unknown }) {
  if (!e) return null;
  return <p className="mb-3 text-sm text-destructive">{(e as Error).message}</p>;
}

/* ------------------------------- Utilisateurs ------------------------------ */

export function UsersPanel({ adminId }: { adminId: string | undefined }) {
  const q = useAdsTable("profiles", 300);
  const update = useAdsUpdate(adminId);
  const [search, setSearch] = useState("");
  const rows = (q.data ?? []).filter((r) =>
    search
      ? JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
      : true,
  );

  async function toggle(r: Row) {
    const next = String(r["statut"] ?? "") === "suspendu" ? "actif" : "suspendu";
    try {
      await update.mutateAsync({
        table: "profiles",
        id: String(r["id"]),
        values: { statut: next },
        action: `profil_${next}`,
        description: String(r["email"] ?? r["id"]),
      });
      toast.success(`Compte ${next}.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Panel
      title="Utilisateurs — table profiles"
      description="Comptes de la plateforme ADS : nom, email, rôle, niveau, solde."
      count={rows.length}
      actions={
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="h-9 w-40 rounded-md border border-border bg-background px-3 text-sm"
          />
          <Refresh q={q} />
        </div>
      }
    >
      <Err e={q.error} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rôle</TableHead>
            <TableHead>Niveau</TableHead>
            <TableHead>Solde</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Inscrit le</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((r) => (
              <TableRow key={String(r["id"])}>
                <TableCell className="font-medium">{String(r["nom"] ?? "—")}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {String(r["email"] ?? "—")}
                </TableCell>
                <TableCell className="text-xs">{String(r["role"] ?? "—")}</TableCell>
                <TableCell className="text-xs">{String(r["niveau"] ?? "—")}</TableCell>
                <TableCell>{money(r["solde"])}</TableCell>
                <TableCell>
                  <StatusBadge status={r["statut"]} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {shortDate(r["created_at"])}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => toggle(r)}>
                    {String(r["statut"] ?? "") === "suspendu" ? "Réactiver" : "Suspendre"}
                  </Button>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <Empty cols={8} />
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}

/* --------------------------------- Retraits -------------------------------- */

export function RetraitsPanel({ adminId }: { adminId: string | undefined }) {
  const q = useAdsTable("retraits", 300);
  const update = useAdsUpdate(adminId);
  const rows = q.data ?? [];

  async function setStatut(r: Row, statut: string) {
    try {
      await update.mutateAsync({
        table: "retraits",
        id: String(r["id"]),
        values: { statut, updated_at: new Date().toISOString() },
        action: `retrait_${statut}`,
        description: `${money(r["montant"])} · ${String(r["methode"] ?? "")}`,
      });
      toast.success(`Retrait ${statut}.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Panel
      title="Retraits — table retraits"
      description="Demandes de retrait ADS : montant, méthode, numéro, statut."
      count={rows.length}
      actions={<Refresh q={q} />}
    >
      <Err e={q.error} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Utilisateur</TableHead>
            <TableHead>Montant</TableHead>
            <TableHead>Méthode</TableHead>
            <TableHead>Numéro</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Demandé le</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((r) => (
              <TableRow key={String(r["id"])}>
                <TableCell className="font-mono text-xs">{shortId(r["user_id"])}</TableCell>
                <TableCell className="font-medium">{money(r["montant"])}</TableCell>
                <TableCell className="text-sm">{String(r["methode"] ?? "—")}</TableCell>
                <TableCell className="text-sm">{String(r["numero"] ?? "—")}</TableCell>
                <TableCell>
                  <StatusBadge status={r["statut"]} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">
                  {shortDate(r["created_at"])}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" disabled={update.isPending} onClick={() => setStatut(r, "paye")}>
                      <Check className="mr-1 size-3.5" /> Payer
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() => setStatut(r, "rejete")}
                    >
                      <X className="mr-1 size-3.5" /> Rejeter
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <Empty cols={7} />
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}

/* ------------------------------- Transactions ------------------------------ */

export function TransactionsPanel() {
  const q = useAdsTable("transactions", 300);
  const rows = q.data ?? [];
  return (
    <Panel
      title="Transactions — table transactions"
      description="Flux financiers ADS (lecture seule ici)."
      count={rows.length}
      actions={<Refresh q={q} />}
    >
      <Err e={q.error} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Utilisateur</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Montant</TableHead>
            <TableHead>Référence</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((r) => (
              <TableRow key={String(r["id"])}>
                <TableCell className="whitespace-nowrap text-xs">
                  {shortDate(r["created_at"])}
                </TableCell>
                <TableCell className="font-mono text-xs">{shortId(r["user_id"])}</TableCell>
                <TableCell className="text-sm">{String(r["type"] ?? "—")}</TableCell>
                <TableCell className="font-medium">{money(r["montant"])}</TableCell>
                <TableCell className="font-mono text-xs">{String(r["reference"] ?? "—")}</TableCell>
                <TableCell>
                  <StatusBadge status={r["statut"]} />
                </TableCell>
                <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                  {String(r["description"] ?? "—")}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <Empty cols={7} />
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}

/* --------------------------------- Boutique -------------------------------- */

export function BoutiquePanel({ adminId }: { adminId: string | undefined }) {
  const produits = useAdsTable("produits", 200);
  const achats = useAdsTable("achats", 200);
  const avis = useAdsTable("avis", 200);
  const update = useAdsUpdate(adminId);

  async function setStatut(r: Row, statut: string) {
    try {
      await update.mutateAsync({
        table: "produits",
        id: String(r["id"]),
        values: { statut, updated_at: new Date().toISOString() },
        action: `produit_${statut}`,
        description: String(r["titre"] ?? r["id"]),
      });
      toast.success(`Produit ${statut}.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Produits — table produits"
        count={produits.data?.length}
        actions={<Refresh q={produits} />}
      >
        <Err e={produits.error} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Titre</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Prix</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Créé le</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produits.data?.length ? (
              produits.data.map((r) => (
                <TableRow key={String(r["id"])}>
                  <TableCell className="font-medium">{String(r["titre"] ?? "—")}</TableCell>
                  <TableCell className="text-sm">{String(r["categorie"] ?? "—")}</TableCell>
                  <TableCell>{money(r["prix"])}</TableCell>
                  <TableCell>
                    <StatusBadge status={r["statut"]} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {shortDate(r["created_at"])}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => setStatut(r, "approuve")}>
                        Approuver
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setStatut(r, "suspendu")}>
                        Suspendre
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <Empty cols={6} />
            )}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Achats — table achats" count={achats.data?.length} actions={<Refresh q={achats} />}>
        <Err e={achats.error} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Acheteur</TableHead>
              <TableHead>Produit</TableHead>
              <TableHead>Montant</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {achats.data?.length ? (
              achats.data.map((r) => (
                <TableRow key={String(r["id"])}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {shortDate(r["created_at"])}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{shortId(r["acheteur_id"])}</TableCell>
                  <TableCell className="font-mono text-xs">{shortId(r["produit_id"])}</TableCell>
                  <TableCell>{money(r["montant"])}</TableCell>
                  <TableCell>
                    <StatusBadge status={r["statut"]} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <Empty cols={5} />
            )}
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Avis — table avis" count={avis.data?.length} actions={<Refresh q={avis} />}>
        <Err e={avis.error} />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Achat</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Photo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {avis.data?.length ? (
              avis.data.map((r) => (
                <TableRow key={String(r["id"])}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {shortDate(r["created_at"])}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{shortId(r["achat_id"])}</TableCell>
                  <TableCell>{String(r["note"] ?? "—")}/5</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {String(r["photo_url"] ?? "—")}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <Empty cols={4} />
            )}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

/* -------------------------------- Parrainage ------------------------------- */

export function ParrainagesPanel() {
  const q = useAdsTable("parrainages", 300);
  const rows = q.data ?? [];
  return (
    <Panel
      title="Parrainage — table parrainages"
      description="Relations parrain / filleul enregistrées sur ADS."
      count={rows.length}
      actions={<Refresh q={q} />}
    >
      <Err e={q.error} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Parrain</TableHead>
            <TableHead>Filleul</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((r) => (
              <TableRow key={String(r["id"])}>
                <TableCell className="whitespace-nowrap text-xs">
                  {shortDate(r["created_at"])}
                </TableCell>
                <TableCell className="font-mono text-xs">{shortId(r["parrain_id"])}</TableCell>
                <TableCell className="font-mono text-xs">{shortId(r["filleul_id"])}</TableCell>
                <TableCell>
                  <StatusBadge status={r["statut"]} />
                </TableCell>
              </TableRow>
            ))
          ) : (
            <Empty cols={4} />
          )}
        </TableBody>
      </Table>
    </Panel>
  );
}
