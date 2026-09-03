import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, Empty, StatusBadge } from "./ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/ads/client";
import { logJournal, money, shortDate, shortId, type Row } from "@/lib/ads-queries";

function useOptionalTable(table: string) {
  return useQuery({
    queryKey: ["ads-optional", table],
    queryFn: async (): Promise<{ rows: Row[]; missing: boolean }> => {
      const { data, error } = await supabase.from(table).select("*").limit(200);
      if (error) return { rows: [], missing: true };
      return { rows: (data ?? []) as Row[], missing: false };
    },
  });
}

function randomKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `ads_live_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function sha256(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function PartenairesApiPanel({ adminId }: { adminId: string | undefined }) {
  const partenaires = useOptionalTable("api_partenaires");
  const logs = useOptionalTable("api_logs");
  const croisees = useOptionalTable("transactions_croisees");
  const qc = useQueryClient();

  const [nom, setNom] = useState("");
  const [plainKey, setPlainKey] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const key = randomKey();
      const { error } = await supabase.from("api_partenaires").insert({
        nom,
        cle_hash: await sha256(key),
        prefixe: key.slice(0, 16),
        permissions: { lecture: true, paiement: true },
        actif: true,
      });
      if (error) throw error;
      await logJournal({ userId: adminId, action: "api_partenaire_cree", description: nom }).catch(() => undefined);
      return key;
    },
    onSuccess: (key) => {
      setPlainKey(key);
      setNom("");
      qc.invalidateQueries({ queryKey: ["ads-optional", "api_partenaires"] });
      toast.success("Clé API générée — copie-la maintenant, elle ne sera plus affichée.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const missing = partenaires.data?.missing;

  return (
    <Panel
      title="Partenaires API"
      description="Clés d'accès pour les plateformes externes (SBC…) et suivi des paiements croisés."
      count={partenaires.data?.rows.length}
    >
      {missing && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Les tables <code>api_partenaires</code>, <code>api_logs</code> et <code>transactions_croisees</code> n'existent
          pas encore côté ADS. Applique le script <code>docs/ads-migration.sql</code> puis recharge ce panneau.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Input
          className="max-w-64"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom du partenaire (ex. SBC)"
        />
        <Button disabled={!nom.trim() || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <KeyRound className="mr-2 size-4" />}
          Générer une clé API
        </Button>
        {plainKey && (
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(plainKey);
              toast.success("Clé copiée");
            }}
          >
            <Copy className="mr-2 size-4" /> {plainKey.slice(0, 20)}…
          </Button>
        )}
      </div>

      <Tabs defaultValue="partenaires">
        <TabsList>
          <TabsTrigger value="partenaires">Partenaires</TabsTrigger>
          <TabsTrigger value="croisees">Transactions croisées</TabsTrigger>
          <TabsTrigger value="logs">Logs API</TabsTrigger>
        </TabsList>

        <TabsContent value="partenaires" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Préfixe</TableHead>
                <TableHead>Actif</TableHead>
                <TableHead>Créé</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(partenaires.data?.rows ?? []).map((r) => (
                <TableRow key={String(r["id"])}>
                  <TableCell>{String(r["nom"] ?? "—")}</TableCell>
                  <TableCell className="font-mono text-xs">{String(r["prefixe"] ?? "—")}</TableCell>
                  <TableCell>
                    <StatusBadge status={r["actif"] ? "active" : "suspended"} />
                  </TableCell>
                  <TableCell>{shortDate(r["created_at"])}</TableCell>
                </TableRow>
              ))}
              {!partenaires.data?.rows.length && <Empty cols={4} />}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="croisees" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Partenaire</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(croisees.data?.rows ?? []).map((r) => (
                <TableRow key={String(r["id"])}>
                  <TableCell className="font-mono text-xs">{shortId(r["id"])}</TableCell>
                  <TableCell>{shortId(r["partenaire_id"])}</TableCell>
                  <TableCell>{money(r["montant"] ?? r["amount"])}</TableCell>
                  <TableCell>
                    <StatusBadge status={r["statut"] ?? r["status"]} />
                  </TableCell>
                  <TableCell>{shortDate(r["created_at"])}</TableCell>
                </TableRow>
              ))}
              {!croisees.data?.rows.length && <Empty cols={5} />}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Partenaire</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs.data?.rows ?? []).map((r) => (
                <TableRow key={String(r["id"])}>
                  <TableCell className="font-mono text-xs">{String(r["endpoint"] ?? "—")}</TableCell>
                  <TableCell>{String(r["status_code"] ?? "—")}</TableCell>
                  <TableCell>{shortId(r["partenaire_id"])}</TableCell>
                  <TableCell>{shortDate(r["created_at"])}</TableCell>
                </TableRow>
              ))}
              {!logs.data?.rows.length && <Empty cols={4} />}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </Panel>
  );
}
