import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";

export function StatusBadge({ status }: { status: unknown }) {
  const s = String(status ?? "—");
  const tone =
    ["approved", "completed", "active", "verified", "envoye", "low"].includes(s)
      ? "border-success/40 bg-success/10 text-success"
      : ["rejected", "failed", "suspended", "high", "erreur"].includes(s)
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-warning/40 bg-warning/10 text-warning";
  return (
    <Badge variant="outline" className={tone}>
      {s}
    </Badge>
  );
}

export function Panel({
  title,
  description,
  actions,
  count,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  count?: number | undefined;
  children: ReactNode;
}) {
  return (
    <Card className="border-border bg-card shadow-[var(--shadow-panel)]">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {count !== undefined && (
            <span className="text-sm text-muted-foreground">{count} entrées</span>
          )}
          {actions}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

export function Empty({ cols }: { cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="py-10 text-center text-muted-foreground">
        Aucune donnée pour le moment.
      </TableCell>
    </TableRow>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <p className="text-xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {hint && <p className="mt-1 text-[11px] text-muted-foreground/70">{hint}</p>}
      </CardContent>
    </Card>
  );
}