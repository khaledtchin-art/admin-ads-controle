import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Wallet, BadgeCheck, Store } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ADS — Plateforme financière et marketplace" },
      {
        name: "description",
        content:
          "ADS : portefeuilles, transactions, KYC, dépôts et retraits, marketplace ADS Store et programme de parrainage.",
      },
      { property: "og:title", content: "ADS — Plateforme financière et marketplace" },
      {
        property: "og:description",
        content: "Portefeuilles, transactions, KYC, marketplace ADS Store et parrainage.",
      },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Wallet, title: "Wallets & transactions", text: "Soldes, dépôts et retraits suivis en temps réel." },
  { icon: BadgeCheck, title: "KYC vérifié", text: "Validation des documents par l'équipe ADS." },
  { icon: Store, title: "ADS Store", text: "Marketplace intégrée et programme de parrainage." },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-6 py-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" /> Plateforme ADS
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          Vos finances ADS,{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--gradient-brand)" }}
          >
            sous contrôle
          </span>
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Portefeuilles, transactions, vérification KYC, marketplace et parrainage — le tout
          administré depuis une console sécurisée.
        </p>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link to="/admin">Accéder à l'espace admin</Link>
          </Button>
        </div>
        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-5">
              <f.icon className="size-5 text-primary" />
              <h2 className="mt-3 font-medium">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
