"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2, Keyboard, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordAttendanceByQr } from "../actions";
import type { AttendanceSummary, EventDTO } from "../contracts";
import { createScanGate } from "../scan-gate";

type Side = "time_in" | "time_out";
type Result = { id: string; ok: boolean; text: string };

const TOAST_MS = 1800;
// After a result, ignore the camera briefly so the next person's code isn't read early.
const PAUSE_MS = 1200;

function within(from: string | null, until: string | null, at: number) {
  return from !== null && until !== null && at >= Date.parse(from) && at <= Date.parse(until);
}

/** Short tones through Web Audio; the context is unlocked by the Start tap (iOS needs a gesture). */
function beep(audio: AudioContext | null, ok: boolean) {
  if (!audio) return;
  const tones = ok ? [[880, 0]] : [[220, 0], [220, 0.18]];
  for (const [frequency, offset] of tones) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = frequency;
    osc.type = ok ? "sine" : "square";
    gain.gain.value = 0.15;
    osc.connect(gain).connect(audio.destination);
    const start = audio.currentTime + offset;
    osc.start(start);
    osc.stop(start + 0.12);
  }
}

export function QrScanStation({ event, summary, initialSide, backHref, now: serverNow }: {
  event: EventDTO;
  summary: AttendanceSummary;
  initialSide: Side;
  backHref: string;
  /** Server render time; the client clock takes over after mount. The database enforces windows. */
  now: string;
}) {
  const [side, setSide] = useState<Side>(initialSide);
  const [started, setStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [toast, setToast] = useState<Result | null>(null);
  const [recent, setRecent] = useState<Result[]>([]);
  const [recorded, setRecorded] = useState({ time_in: 0, time_out: 0 });
  const [pending, setPending] = useState(0);
  const [code, setCode] = useState("");
  const [clock, setClock] = useState(() => Date.parse(serverNow));
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const pausedUntil = useRef(0);

  const open = side === "time_in"
    ? within(event.time_in_from, event.time_in_until, clock)
    : within(event.time_out_from, event.time_out_until, clock);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function chooseSide(next: Side) {
    setSide(next);
    // Keep the side in the URL so a reload or shared link opens the same station.
    const url = new URL(window.location.href);
    url.searchParams.set("side", next);
    window.history.replaceState(null, "", url);
  }

  function submit(raw: string) {
    const universityId = raw.trim();
    if (!universityId) return;
    const requestKey = crypto.randomUUID();
    const kind = side;
    pausedUntil.current = Number.POSITIVE_INFINITY;
    setPending((n) => n + 1);
    recordAttendanceByQr({ eventId: event.id, universityId, kind, requestKey })
      .then((r) => (r.success
        ? { id: requestKey, ok: true, text: r.message ?? "Recorded" }
        : { id: requestKey, ok: false, text: r.error }))
      .catch(() => ({ id: requestKey, ok: false, text: `${universityId}: could not reach the server` }))
      .then((result) => {
        beep(audioRef.current, result.ok);
        navigator.vibrate?.(result.ok ? 80 : [60, 60, 60]);
        if (result.ok) setRecorded((c) => ({ ...c, [kind]: c[kind] + 1 }));
        setToast(result);
        setRecent((list) => [result, ...list].slice(0, 10));
      })
      .finally(() => {
        setPending((n) => n - 1);
        pausedUntil.current = performance.now() + PAUSE_MS;
      });
  }
  const onScan = useEffectEvent((text: string) => submit(text));
  const scanningAllowed = useEffectEvent(() => open && performance.now() >= pausedUntil.current);

  function start() {
    try {
      audioRef.current ??= new AudioContext();
      void audioRef.current.resume();
    } catch { /* No Web Audio: scanning still works without the beep. */ }
    setCameraError(null);
    setStarted(true);
  }

  useEffect(() => {
    if (!started) return;
    let stream: MediaStream | null = null;
    let wakeLock: WakeLockSentinel | null = null;
    let frame = 0;
    let stopped = false;
    const pass = createScanGate(3000);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    // The screen would sleep mid-queue; re-request when the tab becomes visible again.
    const keepAwake = () => {
      if (document.visibilityState === "visible") {
        navigator.wakeLock?.request("screen").then((lock) => { wakeLock = lock; }).catch(() => {});
      }
    };
    keepAwake();
    document.addEventListener("visibilitychange", keepAwake);

    (async () => {
      try {
        const [{ default: jsQR }, media] = await Promise.all([
          import("jsqr"),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }),
        ]);
        stream = media;
        const video = videoRef.current;
        if (stopped || !video || !context) return;
        video.srcObject = media;
        await video.play();
        let lastDecode = 0;
        const tick = (t: number) => {
          if (stopped) return;
          if (t - lastDecode > 160 && video.readyState === video.HAVE_ENOUGH_DATA && scanningAllowed()) {
            lastDecode = t;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0);
            const found = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data,
              canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
            const text = found?.data.trim();
            if (text && pass(text, t)) onScan(text);
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (error) {
        if (stopped) return;
        setCameraError(error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera permission was denied. Allow it in the browser settings, or type numbers below."
          : "Camera is unavailable. It needs HTTPS and a camera; you can still type numbers below.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      document.removeEventListener("visibilitychange", keepAwake);
      void wakeLock?.release().catch(() => {});
    };
  }, [started]);

  const timedIn = summary.timedIn + recorded.time_in;
  const timedOut = summary.timedOut + recorded.time_out;

  return (
    <main className="fixed inset-0 flex flex-col bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] text-foreground">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="-ml-2 gap-1" nativeButton={false} render={<Link href={backHref} />}>
            <ArrowLeft className="size-4" /> Exit
          </Button>
          <h1 className="min-w-0 flex-1 truncate font-heading font-semibold">{event.name}</h1>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Recording side" className="inline-flex rounded-lg border border-border p-0.5">
            {(["time_in", "time_out"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={side === s} onClick={() => chooseSide(s)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${side === s
                  ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {s === "time_in" ? "Time in" : "Time out"}
              </button>
            ))}
          </div>
          <p className="text-sm tabular-nums text-muted-foreground" aria-label="Recorded so far">
            <span className="font-semibold text-foreground">{side === "time_in" ? timedIn : timedOut}</span>
            /{summary.participants}
          </p>
        </div>
      </header>

      <section className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {started && !cameraError && (
          <>
            <video ref={videoRef} muted playsInline aria-label="Camera preview for QR scanning"
              className="absolute inset-0 size-full object-cover" />
            <div aria-hidden="true" className="relative aspect-square w-3/5 max-w-72 rounded-2xl border-4 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.35)]" />
          </>
        )}
        {!started && (
          <Button size="lg" className="gap-2" onClick={start}>
            <Camera className="size-5" /> Start scanning
          </Button>
        )}
        {cameraError && <p role="alert" className="max-w-xs px-4 text-center text-sm text-white">{cameraError}</p>}

        {!open && (
          <p className="absolute inset-x-4 top-4 rounded-lg bg-amber-500 px-3 py-2 text-center text-sm font-medium text-black">
            The {side === "time_in" ? "time-in" : "time-out"} window is closed. Scanning is paused.
          </p>
        )}
        {pending > 0 && !toast && (
          <Loader2 aria-label="Recording" className="absolute bottom-6 size-8 animate-spin text-white" />
        )}
        <div aria-live="assertive" className="pointer-events-none absolute inset-x-4 bottom-6 flex justify-center">
          {toast && (
            <div key={toast.id} role="status"
              className={`flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-white shadow-lg [animation:fade-in_120ms_ease_both] ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
              {toast.ok ? <CheckCircle2 className="mt-0.5 size-6 shrink-0" /> : <XCircle className="mt-0.5 size-6 shrink-0" />}
              <p className="text-base font-semibold leading-snug">{toast.text}</p>
            </div>
          )}
        </div>
      </section>

      <footer className="space-y-2 border-t border-border px-4 py-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(code); setCode(""); }}>
          <div className="relative flex-1">
            <Keyboard aria-hidden="true" className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            {/* Handheld USB/Bluetooth scanners type here and press Enter. */}
            <Input aria-label="Type or scan a university number" placeholder="XX-1-XXXXX" autoComplete="off"
              inputMode="numeric" className="pl-8" value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} />
          </div>
          <Button type="submit" variant="outline" disabled={!code.trim() || !open}>Record</Button>
        </form>
        {recent.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Recent scans ({recent.length})</summary>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {recent.map((r) => (
                <li key={r.id} className={r.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>{r.text}</li>
              ))}
            </ul>
          </details>
        )}
      </footer>
    </main>
  );
}
