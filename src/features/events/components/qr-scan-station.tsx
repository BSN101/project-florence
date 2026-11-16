"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { OTPField } from "@base-ui/react/otp-field";
import { ArrowLeft, Camera, CheckCircle2, Keyboard, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { recordAttendanceByQr } from "../actions";
import type { AttendanceSummary, EventDTO } from "../contracts";
import { within } from "../event-state";
import { createScanGate } from "../scan-gate";

type Side = "time_in" | "time_out";
type Mode = "qr" | "manual";

// University numbers are NN-1-NNNNN. All 8 digits are real slots (the 1 included) so a handheld
// scanner typing "21-1-00001" fills them exactly: the hyphens are dropped by numeric filtering.
const DIGITS = 8;
const GROUPS = [[0, 1], [2], [3, 4, 5, 6, 7]];
const slotClass = "h-11 w-8 rounded-md border border-input bg-background text-center text-lg font-semibold tabular-nums shadow-xs outline-none transition-[border-color,box-shadow] focus:border-ring focus:ring-3 focus:ring-ring/50 disabled:opacity-50 sm:h-13 sm:w-11 sm:text-xl";
type Result = { id: string; ok: boolean; text: string };

const TOAST_MS = 1800;
// After a result, ignore the camera briefly so the next person's code isn't read early.
const PAUSE_MS = 1200;

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

export function QrScanStation({ event, summary, initialSide, initialMode, backHref, now: serverNow }: {
  event: EventDTO;
  summary: AttendanceSummary;
  initialSide: Side;
  initialMode: Mode;
  backHref: string;
  /** Server render time; the client clock takes over after mount. The database enforces windows. */
  now: string;
}) {
  const [side, setSide] = useState<Side>(initialSide);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [started, setStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [toast, setToast] = useState<Result | null>(null);
  const [recent, setRecent] = useState<Result[]>([]);
  const [recorded, setRecorded] = useState({ time_in: 0, time_out: 0 });
  const [pending, setPending] = useState(0);
  const [code, setCode] = useState("");
  const [clock, setClock] = useState(() => Date.parse(serverNow));
  const videoRef = useRef<HTMLVideoElement>(null);
  const firstSlotRef = useRef<HTMLInputElement>(null);
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

  // Keep side and mode in the URL so a reload or shared link opens the same station.
  function remember(key: "side" | "mode", value: string) {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    window.history.replaceState(null, "", url);
  }
  function chooseSide(next: Side) {
    setSide(next);
    remember("side", next);
  }
  function chooseMode(next: Mode) {
    setMode(next);
    remember("mode", next);
  }

  /** The audio context must be created from a tap or key press (iOS); both modes call this from one. */
  function unlockAudio() {
    try {
      audioRef.current ??= new AudioContext();
      void audioRef.current.resume();
    } catch { /* No Web Audio: recording still works without the beep. */ }
  }

  function submitTyped() {
    if (code.length !== DIGITS) return;
    unlockAudio();
    submit(`${code.slice(0, 2)}-${code[2]}-${code.slice(3)}`);
    setCode("");
    firstSlotRef.current?.focus();
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
    unlockAudio();
    setCameraError(null);
    setStarted(true);
  }

  // The camera runs only on the QR tab; switching back restarts it without another tap.
  const scanning = started && mode === "qr";
  useEffect(() => {
    if (!scanning) return;
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
          ? "Camera permission was denied. Allow it in the browser settings, or use the Manual tab."
          : "Camera is unavailable. It needs HTTPS and a camera; you can still use the Manual tab.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      document.removeEventListener("visibilitychange", keepAwake);
      void wakeLock?.release().catch(() => {});
    };
  }, [scanning]);

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
        <div role="tablist" aria-label="Recording method" className="mx-auto inline-flex rounded-lg bg-muted p-0.5">
          {([["qr", "QR scan", Camera], ["manual", "Manual", Keyboard]] as const).map(([m, text, Icon]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => chooseMode(m)}
              className={`flex min-h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium transition-colors ${mode === m
                ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon aria-hidden="true" className="size-4" /> {text}
            </button>
          ))}
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

      <section className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden ${mode === "qr" ? "bg-black" : "bg-background"}`}>
        {mode === "qr" ? (
          <>
            {scanning && !cameraError && (
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
          </>
        ) : (
          <form className="flex flex-col items-center gap-4 px-4" onSubmit={(e) => { e.preventDefault(); submitTyped(); }}>
            <label htmlFor="university-number" className="text-sm font-medium text-foreground">University number</label>
            <OTPField.Root id="university-number" length={DIGITS} value={code} onValueChange={setCode} disabled={!open}
              autoComplete="off" aria-describedby="university-number-hint" className="flex items-center gap-1.5 sm:gap-2">
              {GROUPS.map((group, g) => (
                <div key={g} className="contents">
                  {g > 0 && <OTPField.Separator className="w-2.5 text-center text-lg text-muted-foreground sm:w-3">–</OTPField.Separator>}
                  <div className="flex gap-1.5">
                    {group.map((index) => (
                      <OTPField.Input key={index} ref={index === 0 ? firstSlotRef : undefined} className={slotClass}
                        aria-label={index === 0 ? undefined : `Digit ${index + 1} of ${DIGITS}`} />
                    ))}
                  </div>
                </div>
              ))}
            </OTPField.Root>
            {/* Handheld USB/Bluetooth scanners type here too; their hyphens are ignored and Enter records. */}
            <p id="university-number-hint" className="text-center text-xs text-muted-foreground">
              Type all 8 digits, then press Record or Enter. Handheld scanners work here too.
            </p>
            <Button type="submit" size="lg" className="min-w-40 gap-2" disabled={code.length !== DIGITS || !open}>
              {pending > 0 && <Loader2 className="size-4 animate-spin" />} Record
            </Button>
          </form>
        )}

        <div aria-live="assertive" className="pointer-events-none absolute inset-x-4 top-4 flex flex-col items-center gap-2">
          {!open && (
            <p className="w-full max-w-sm rounded-lg bg-amber-500 px-3 py-2 text-center text-sm font-medium text-black">
              The {side === "time_in" ? "time-in" : "time-out"} window is closed. Recording is paused.
            </p>
          )}
          {toast && (
            <div key={toast.id} role="status"
              className={`flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-white shadow-lg [animation:fade-in_120ms_ease_both] ${toast.ok ? "bg-emerald-600" : "bg-red-600"}`}>
              {toast.ok ? <CheckCircle2 className="mt-0.5 size-6 shrink-0" /> : <XCircle className="mt-0.5 size-6 shrink-0" />}
              <p className="text-base font-semibold leading-snug">{toast.text}</p>
            </div>
          )}
          {mode === "qr" && pending > 0 && !toast && <Loader2 aria-label="Recording" className="size-8 animate-spin text-white" />}
        </div>
      </section>

      {recent.length > 0 && (
        <footer className="border-t border-border px-4 py-3">
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Recent ({recent.length})</summary>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {recent.map((r) => (
                <li key={r.id} className={r.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>{r.text}</li>
              ))}
            </ul>
          </details>
        </footer>
      )}
    </main>
  );
}
