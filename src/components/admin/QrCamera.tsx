import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Loader2 } from "lucide-react";

/** Lecteur caméra plein cadre. Appelle onResult une seule fois par lecture. */
export function QrCamera({ active, onResult }: { active: boolean; onResult: (text: string) => void }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const cbRef = useRef(onResult);
  cbRef.current = onResult;

  useEffect(() => {
    if (!active || !holder.current) return;
    const el = holder.current;
    el.id ||= `qr-${Math.random().toString(36).slice(2)}`;
    const scanner = new Html5Qrcode(el.id, { verbose: false });
    let stopped = false;
    setStarting(true);
    setError(null);

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 12, qrbox: { width: 240, height: 240 } },
        (text) => cbRef.current(text),
        () => undefined,
      )
      .then(
        () => setStarting(false),
        (e: unknown) => {
          setStarting(false);
          setError(
            e instanceof Error && /permission|denied/i.test(e.message)
              ? "Accès caméra refusé. Autorise la caméra dans le navigateur."
              : "Impossible de démarrer la caméra sur cet appareil.",
          );
        },
      );

    return () => {
      stopped = true;
      void scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => undefined);
      void stopped;
    };
  }, [active]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-black">
      <div ref={holder} className="[&_video]:!w-full [&_video]:!object-cover min-h-56 w-full" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="size-56 max-w-[70%] rounded-2xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      {starting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-primary-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Démarrage de la caméra…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

/** Vibration + bip court de confirmation. */
export function scanFeedback(ok: boolean) {
  try {
    navigator.vibrate?.(ok ? 80 : [60, 60, 60]);
  } catch {
    /* ignore */
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.14 : 0.4));
    osc.onended = () => void ctx.close().catch(() => undefined);
  } catch {
    /* ignore */
  }
}