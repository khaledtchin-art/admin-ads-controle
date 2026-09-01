import { Bell, AlertTriangle, Info, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shortDate } from "@/lib/ads-queries";
import type { AdsAlert } from "@/lib/ads-alerts";

export function AlertsBell({
  alerts,
  unread,
  onOpen,
  onClear,
}: {
  alerts: AdsAlert[];
  unread: number;
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <Popover onOpenChange={(o) => o && onOpen()}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Alertes temps réel</p>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={alerts.length === 0}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {alerts.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              Aucune alerte. Les événements critiques du journal et les changements de statut KYC
              s'afficheront ici.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((a) => (
                <li key={a.id} className="flex gap-2 px-3 py-2">
                  {a.level === "critique" ? (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  ) : (
                    <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70">{shortDate(a.at)}</p>
                  </div>
                  <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
                    {a.kind === "kyc" ? "KYC" : "journal"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
