import { useCallback, useRef, useState } from "react";
import { Panel } from "./ui";
import { QrCamera, scanFeedback } from "./QrCamera";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, CameraOff, CheckCircle2, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { money, shortDate, shortId, useAdsTable, type Row } from "@/lib/ads-queries";
import { runScan, validerEntree, type ScanKind, type ScanResult } from "@/lib/qr-scan";

const LABELS: Record<ScanKind, { title: string; hint: string }> = {
  ticket: { title: "Tickets d'événement", hint: "Scanne le QR du ticket pour contrôler l'entrée." },
  recu: { title: "Vérifier un reçu", hint: "Scanne le QR d'un reçu pour détecter une falsification." },
  profil: { title: "Vérifier un compte", hint: "Scanne le QR d'un membre pour confirmer son identité." },
};

export function ScannerPanel({ adminId }: { adminId: string | undefined }) {
  const [kind, setKind] = useState<ScanKind>("ticket");
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<{ at: string; kind: ScanKind; title: string; ok: boolean }[]>([]);
  const [showSolde, setShowSolde] = useState(false);
  const lock = useRef(false);

  const tickets = useAdsTable("tickets_evenements", 1000, "date_achat");
  const scannedCount = (tickets.data ?? []).filter(
    (t) => String(t["statut"] ?? "").toLowerCase() === "utilise",
  ).length;

  const handle = useCallback(
    async (raw: string) => {
      if (!raw.trim() || lock.current) return;
      lock.current = true;
      setBusy(true);
      setShowSolde(false);
      try {
        const res = await runScan(kind, raw, adminId);
        setResult(res);
        scanFeedback(res.outcome === "valide");
        setHistory((h) =>
          [{ at: new Date().toLocaleTimeString("fr-FR"), kind, title: res.title, ok: res.outcome === "valide" }, ...h].slice(0, 10),
        );
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
        setTimeout(() => (lock.current = false), 1200);
      }
    },
    [kind, adminId],
  );

  async function valider() {
    const id = result?.ticket?.["id"];
    if (!id) return;
    try {
      await validerEntree(String(id), adminId);
      toast.success("Entrée validée.");
      setResult({ ...result!, outcome: "deja_utilise", title: "Entrée validée", message: "Ticket marqué comme utilisé." });
      void tickets.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const tone =
    result?.outcome === "valide"
      ? "border-success/40 bg-success/10 text-success"
      : result?.outcome === "deja_utilise"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-destructive/40 bg-destructive/10 text-destructive";

  return (
    <Panel title="Scanner QR ADS" description={LABELS[kind].hint}>
      <div className="space-y-4">
        <Tabs value={kind} onValueChange={(v) => { setKind(v as ScanKind); setResult(null); }}>
          <TabsList className="flex w-full flex-wrap justify-start">
            <TabsTrigger value="ticket">🎫 Tickets</TabsTrigger>
            <TabsTrigger value="recu">🧾 Reçus</TabsTrigger>
            <TabsTrigger value="profil">👤 Comptes</TabsTrigger>
          </TabsList>
        </Tabs>

        {kind === "ticket" && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{scannedCount}</span> participants sur{" "}
            <span className="font-semibold text-foreground">{tickets.data?.length ?? 0}</span> ont scanné leur entrée.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant={camera ? "secondary" : "default"} onClick={() => setCamera((c) => !c)}>
            {camera ? <CameraOff className="mr-2 size-4" /> : <Camera className="mr-2 size-4" />}
            {camera ? "Arrêter la caméra" : "Ouvrir la caméra"}
          </Button>
          <form
            className="flex flex-1 min-w-52 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handle(manual);
            }}
          >
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ou saisir le code manuellement"
            />
            <Button type="submit" variant="outline" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Vérifier"}
            </Button>
          </form>
        </div>

        {camera && <QrCamera active={camera} onResult={(t) => void handle(t)} />}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Vérification en cours…
          </div>
        )}

        {result && !busy && (
          <div className={`rounded-xl border p-4 ${tone}`}>
            <div className="flex items-center gap-2">
              {result.outcome === "valide" ? (
                <CheckCircle2 className="size-6" />
              ) : (
                <ShieldAlert className="size-6" />
              )}
              <h3 className="text-lg font-semibold">{result.title}</h3>
            </div>
            <p className="mt-1 text-sm opacity-90">{result.message}</p>

            <div className="mt-4 grid gap-2 text-sm text-foreground sm:grid-cols-2">
              {result.profile && (
                <>
                  <Field label="Nom" value={result.profile["nom"]} />
                  <Field label="Email" value={result.profile["email"]} />
                  <Field label="N° membre" value={result.profile["numero_membre"]} />
                  <Field label="Niveau" value={result.profile["niveau"]} />
                  <Field label="Statut compte" value={result.profile["statut"]} />
                  <Field label="Inscription" value={shortDate(result.profile["created_at"])} />
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Solde :</span>
                    <span>{showSolde ? money(result.profile["solde"]) : "••••••"}</span>
                    <Button size="sm" variant="ghost" onClick={() => setShowSolde((s) => !s)}>
                      {showSolde ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                </>
              )}
              {result.evenement && <Field label="Événement" value={result.evenement["titre"]} />}
              {result.evenement && <Field label="Lieu" value={result.evenement["lieu"]} />}
              {result.ticket && <Field label="Prix payé" value={money(result.ticket["prix_paye"])} />}
              {result.ticket && <Field label="Ticket" value={shortId(result.ticket["id"])} />}
              {result.recu && <Field label="Reçu" value={shortId(result.recu["id"])} />}
              {result.transaction && (
                <>
                  <Field label="Montant" value={money(result.transaction["montant"])} />
                  <Field label="Type" value={result.transaction["type"]} />
                  <Field label="Statut" value={result.transaction["statut"]} />
                  <Field label="Date" value={shortDate(result.transaction["created_at"])} />
                </>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {result.kind === "ticket" && result.outcome === "valide" && (
                <Button onClick={() => void valider()}>Valider l'entrée</Button>
              )}
              <Button variant="outline" onClick={() => { setResult(null); setManual(""); }}>
                Scanner un autre
              </Button>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              10 derniers scans
            </h4>
            <ul className="space-y-1 text-sm">
              {history.map((h, i) => (
                <li key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5">
                  <span className="text-muted-foreground">{h.at} · {h.kind}</span>
                  <Badge
                    variant="outline"
                    className={h.ok ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"}
                  >
                    {h.title}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <span className="text-muted-foreground">{label} : </span>
      <span>{value === null || value === undefined || value === "" ? "—" : String(value)}</span>
    </div>
  );
}

export type { Row };