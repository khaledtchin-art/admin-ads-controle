import { useCallback, useRef, useState } from "react";
import { Panel } from "./ui";
import { QrCamera, scanFeedback } from "./QrCamera";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { money, shortDate } from "@/lib/ads-queries";
import { confirmerDepot, confirmerRetrait, readAgentToken, type AgentMode, type AgentToken } from "@/lib/agent-ops";

const MODES: Record<AgentMode, { label: string; icon: string; hint: string; ring: string; chip: string }> = {
  depot: {
    label: "Recevoir un dépôt",
    icon: "📥",
    hint: "Le membre vous remet de l'argent : vérifiez sa pièce d'identité.",
    ring: "border-success/40 bg-success/10 text-success",
    chip: "bg-success text-success-foreground",
  },
  retrait: {
    label: "Payer un retrait",
    icon: "📤",
    hint: "Vous remettez de l'argent au membre après vérification.",
    ring: "border-warning/40 bg-warning/10 text-warning",
    chip: "bg-warning text-warning-foreground",
  },
};

export function AgentPanel({ adminId }: { adminId: string | undefined }) {
  const [mode, setMode] = useState<AgentMode>("retrait");
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState("");
  const [piece, setPiece] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AgentToken | null>(null);
  const lock = useRef(false);

  const handle = useCallback(
    async (raw: string) => {
      if (!raw.trim() || lock.current) return;
      lock.current = true;
      setBusy(true);
      try {
        const res = await readAgentToken(mode, raw);
        setResult(res);
        scanFeedback(res.ok);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBusy(false);
        setTimeout(() => (lock.current = false), 1200);
      }
    },
    [mode],
  );

  async function confirmer() {
    if (!result) return;
    if (piece.trim().length < 4) {
      toast.error("Saisis le numéro de la pièce d'identité.");
      return;
    }
    setBusy(true);
    try {
      const msg =
        mode === "depot"
          ? await confirmerDepot(result.code, adminId, piece.trim())
          : await confirmerRetrait(result.code, adminId, piece.trim());
      toast.success(msg);
      setResult(null);
      setPiece("");
      setManual("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const conf = MODES[mode];

  return (
    <Panel title="Espace Agent" description={conf.hint}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MODES) as AgentMode[]).map((m) => (
            <Button
              key={m}
              variant={mode === m ? "default" : "outline"}
              className={mode === m ? MODES[m].chip : ""}
              onClick={() => {
                setMode(m);
                setResult(null);
                setPiece("");
              }}
            >
              {MODES[m].icon} {MODES[m].label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant={camera ? "secondary" : "default"} onClick={() => setCamera((c) => !c)}>
            {camera ? <CameraOff className="mr-2 size-4" /> : <Camera className="mr-2 size-4" />}
            {camera ? "Arrêter la caméra" : "Ouvrir la caméra"}
          </Button>
          <form
            className="flex min-w-52 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handle(manual);
            }}
          >
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Code WTD-XXXXXX" />
            <Button type="submit" variant="outline" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Vérifier"}
            </Button>
          </form>
        </div>

        {camera && <QrCamera active={camera} onResult={(t) => void handle(t)} />}

        {result && (
          <div className={`rounded-xl border p-4 ${result.ok ? conf.ring : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
            {result.ok ? (
              <p className="text-2xl font-bold">
                {mode === "depot"
                  ? `💰 CE MEMBRE VOUS DONNE ${money(result.amount)}`
                  : `💸 VOUS REMETTEZ ${money(result.amount)}`}
              </p>
            ) : (
              <p className="text-lg font-semibold">{result.title}</p>
            )}
            <p className="mt-1 text-sm opacity-90">{result.message}</p>

            <div className="mt-3 grid gap-1 text-sm text-foreground sm:grid-cols-2">
              <span>Membre : {String(result.profile?.["nom"] ?? "—")}</span>
              <span>N° membre : {String(result.profile?.["numero_membre"] ?? "—")}</span>
              <span>Téléphone : {String(result.profile?.["telephone"] ?? "—")}</span>
              <span>Créé : {shortDate(result.token?.["created_at"])}</span>
            </div>

            {result.ok && (
              <div className="mt-4 space-y-2">
                <Input
                  value={piece}
                  onChange={(e) => setPiece(e.target.value)}
                  placeholder="Numéro de la pièce d'identité (obligatoire)"
                />
                <div className="flex flex-wrap gap-2">
                  <Button className={conf.chip} disabled={busy} onClick={() => void confirmer()}>
                    {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {mode === "depot" ? "Confirmer la réception" : "Confirmer la remise"}
                  </Button>
                  <Button variant="outline" onClick={() => { setResult(null); setPiece(""); }}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
