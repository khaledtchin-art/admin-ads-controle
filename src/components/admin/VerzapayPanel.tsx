import { useState } from "react";
import { Panel, StatusBadge } from "./ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { money, shortDate } from "@/lib/ads-queries";
import {
  createVerzapayPayment,
  createVerzapayPayout,
  goToCheckout,
  useVerzapayTransaction,
} from "@/lib/verzapay";

const rid = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;

export function VerzapayPanel() {
  return (
    <Panel title="Paiements Verzapay" description="Paiement (checkout) et retrait (payout) via les fonctions Verzapay, suivi temps réel.">
      <Tabs defaultValue="payment">
        <TabsList>
          <TabsTrigger value="payment">Encaisser</TabsTrigger>
          <TabsTrigger value="payout">Payer un retrait</TabsTrigger>
        </TabsList>
        <TabsContent value="payment" className="mt-4">
          <PaymentForm />
        </TabsContent>
        <TabsContent value="payout" className="mt-4">
          <PayoutForm />
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

function PaymentForm() {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Commande ADS");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | undefined>();
  const [checkoutUrl, setCheckoutUrl] = useState<string | undefined>();
  const tx = useVerzapayTransaction({ orderId });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const order_id = rid("ORD");
    try {
      const res = await createVerzapayPayment({
        amount: Number(amount),
        description,
        customer_name: name,
        customer_phone: phone,
        order_id,
      });
      setOrderId(order_id);
      setCheckoutUrl(res.checkout_url);
      toast.success("Paiement créé, redirection vers Verzapay…");
      goToCheckout(res.checkout_url);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={1} required placeholder="Montant (FCFA)" />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="Description" />
      <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nom du client" />
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="Téléphone du client" />
      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Payer
        </Button>
        {checkoutUrl && (
          <a className="inline-flex items-center gap-1 text-sm underline" href={checkoutUrl} target="_blank" rel="noreferrer">
            Ouvrir le checkout <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
      {orderId && <TxStatus label={`Commande ${orderId}`} state={tx} />}
    </form>
  );
}

function PayoutForm() {
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [retraitId, setRetraitId] = useState<string | undefined>();
  const tx = useVerzapayTransaction({ retraitId });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const retrait_id = rid("WTD");
    try {
      const res = await createVerzapayPayout({
        amount: Number(amount),
        recipient_name: name,
        recipient_phone: phone,
        retrait_id,
      });
      setRetraitId(retrait_id);
      toast.success(`Retrait envoyé (${res.status ?? "pending"}).`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
      <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={1} required placeholder="Montant (FCFA)" />
      <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nom du bénéficiaire" />
      <Input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="Téléphone du bénéficiaire" />
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />} Envoyer le retrait
        </Button>
      </div>
      {retraitId && <TxStatus label={`Retrait ${retraitId}`} state={tx} />}
    </form>
  );
}

function TxStatus({
  label,
  state,
}: {
  label: string;
  state: ReturnType<typeof useVerzapayTransaction>;
}) {
  return (
    <div className="sm:col-span-2 rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{label}</span>
        <StatusBadge status={state.status ?? "pending"} />
        {state.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {state.isCompleted && <CheckCircle2 className="size-4 text-success" />}
        {state.isFailed && <XCircle className="size-4 text-destructive" />}
      </div>
      <p className="mt-1 text-muted-foreground">
        {state.isPending
          ? "Paiement en attente de confirmation Verzapay…"
          : state.isCompleted
            ? "Paiement confirmé par le webhook."
            : "Paiement échoué."}
      </p>
      {state.transaction && (
        <p className="mt-1 text-muted-foreground">
          {money(state.transaction["amount"])} · {String(state.transaction["provider"] ?? "verzapay")} ·{" "}
          {shortDate(state.transaction["updated_at"] ?? state.transaction["created_at"])}
        </p>
      )}
    </div>
  );
}
