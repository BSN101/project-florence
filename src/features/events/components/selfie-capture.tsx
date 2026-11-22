"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

type Detector = { detectForVideo(video: HTMLVideoElement, timestamp: number): { detections: unknown[] } };

// Loaded on first use and kept for retakes. Model and WASM are self-hosted (public/mediapipe).
let detectorPromise: Promise<Detector> | null = null;
function loadDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    return FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite", delegate: "CPU" },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.6,
    });
  })().catch((error) => { detectorPromise = null; throw error; });
  return detectorPromise;
}

const longEdge = 800;

/**
 * Front-camera selfie with a face gate (FL-049). The shutter works only while exactly one
 * face is in view. This is a convenience check in the browser; the reviewer is the control.
 * There is deliberately no file picker. The camera stops on capture, unmount and page hide.
 */
export function SelfieCapture({ photo, onChange }: { photo: Blob | null; onChange: (photo: Blob | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [faces, setFaces] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = photo === null;
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (!live) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    (async () => {
      try {
        const [detector, media] = await Promise.all([
          loadDetector(),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false }),
        ]);
        stream = media;
        const video = videoRef.current;
        if (stopped || !video) { media.getTracks().forEach((track) => track.stop()); return; }
        video.srcObject = media;
        await video.play();
        let last = 0;
        const tick = (t: number) => {
          if (stopped) return;
          if (t - last > 200 && video.readyState >= video.HAVE_CURRENT_DATA) {
            last = t;
            setFaces(detector.detectForVideo(video, t).detections.length);
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (err) {
        if (stopped) return;
        setError(err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission was denied. Allow it in your browser settings, or ask Council to record you by QR."
          : "The camera or face check couldn't start on this device. Ask Council to record you by QR or manual entry.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [live]);

  function capture() {
    const video = videoRef.current;
    if (!video || faces !== 1) return;
    const scale = Math.min(1, longEdge / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    // JPEG everywhere: iOS Safari can't encode WebP from a canvas. The server re-encodes to WebP.
    canvas.toBlob((blob) => { if (blob) onChange(blob); }, "image/jpeg", 0.8);
  }

  const hint = error ?? (faces === null ? "Starting camera…"
    : faces === 0 ? "Center your face in the frame."
    : faces > 1 ? "Only you should be in the photo."
    : "Ready.");

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl bg-muted">
        {live ? (
          // Mirrored like a mirror; the saved photo is not mirrored.
          <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" />
        ) : (
          // A local blob URL: next/image has nothing to optimize.
          // eslint-disable-next-line @next/next/no-img-element
          preview && <img src={preview} alt="Your selfie" className="size-full object-cover" />
        )}
        {live && faces === null && !error && (
          <Loader2 className="absolute inset-0 m-auto size-6 animate-spin text-muted-foreground" aria-hidden />
        )}
      </div>
      {live ? (
        <>
          <p role="status" className={`text-center text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}>{hint}</p>
          <Button type="button" variant="outline" className="h-11 w-full gap-2" disabled={faces !== 1} onClick={capture}>
            <Camera className="size-4" /> Take photo
          </Button>
        </>
      ) : (
        <Button type="button" variant="ghost" className="h-11 w-full gap-2"
          onClick={() => { setFaces(null); setError(null); onChange(null); }}>
          <RotateCcw className="size-4" /> Retake
        </Button>
      )}
    </div>
  );
}
