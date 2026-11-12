"use client";

import Image from "next/image";
import { Check, Copy, Download, QrCode, ShieldCheck, SunMedium } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useClipboard } from "@/hooks/use-clipboard";
import { AcademicStatusBadge } from "./academic-status-badge";

export function AttendanceQrCard({
  universityId,
  studentName,
  yearLevel,
  academicStatus,
  qrDataUrl,
}: {
  universityId: string;
  studentName: string;
  yearLevel?: number | null;
  academicStatus?: string | null;
  qrDataUrl: string;
}) {
  const { copy, isCopied } = useClipboard();

  return (
    <Card className="flex flex-col items-center gap-6 p-6 sm:p-8 text-center max-w-md mx-auto w-full shadow-sm">
      {/* Title block */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
          <QrCode className="size-4" />
          <span>Attendance QR</span>
        </div>
        <h2 className="font-heading text-xl font-bold text-foreground">
          {studentName}
        </h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-muted-foreground">
            {universityId}
          </span>
          <button
            type="button"
            onClick={() => copy(universityId)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Copy student number"
          >
            {isCopied() ? (
              <Check className="size-3.5 text-emerald-600" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
        {(yearLevel || academicStatus) && (
          <div className="flex items-center gap-2 mt-1">
            {yearLevel && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                Year {yearLevel}
              </span>
            )}
            {academicStatus && (
              <AcademicStatusBadge status={academicStatus} />
            )}
          </div>
        )}
      </div>

      {/* QR Code Container */}
      <div className="flex flex-col items-center gap-3">
        <div className="relative rounded-2xl border-2 border-border bg-white p-4 shadow-md">
          {/* Always rendered on pure white background for scanner contrast */}
          <Image
            src={qrDataUrl}
            alt={`Attendance QR code for ${universityId}`}
            width={240}
            height={240}
            priority
            unoptimized
            className="size-56 sm:size-60 rounded-lg select-none"
          />
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">
          {universityId}
        </span>
      </div>

      {/* Action: Download QR */}
      <div className="w-full flex flex-col gap-3">
        <Button
          render={
            <a
              href={qrDataUrl}
              download={`attendance-qr-${universityId}.png`}
            />
          }
          className="w-full gap-2 font-medium"
        >
          <Download className="size-4" />
          <span>Download QR Image</span>
        </Button>

        {/* Scanner clarity / Brightness Tip */}
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-left text-xs text-amber-900 dark:text-amber-200">
          <SunMedium className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-amber-950 dark:text-amber-100">
              Scanner Clarity Tip
            </span>
            <span className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
              Increase your device screen brightness and hold your screen 4–6 inches away from the scanner for instant check-in.
            </span>
          </div>
        </div>

        {/* Security invariant note */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
          <ShieldCheck className="size-3.5 text-muted-foreground shrink-0" />
          <span>Identifier-only QR. Not a login credential.</span>
        </div>
      </div>
    </Card>
  );
}
