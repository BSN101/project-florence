import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Inter } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Florence",
  description: "Faculty of Nursing records, events, payments, service and clearance.",
};

// Self-hosted at build (no runtime request to Google). latin-ext carries the peso sign; browsers fetch it only when used.
const body = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-body", fallback: ["system-ui", "-apple-system", "Segoe UI", "Arial", "sans-serif"] });
const display = Be_Vietnam_Pro({ subsets: ["latin", "latin-ext"], weight: ["500", "600"], variable: "--font-display", fallback: ["system-ui", "-apple-system", "Segoe UI", "Arial", "sans-serif"] });

export const viewport: Viewport = {
  // Matches --background so the mobile browser bar blends with the page.
  themeColor: "#fff8f2",
  // Draw under the iPhone home indicator and notch; safe-area insets are padded in globals.css and fixed bars.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Token-driven so the bar follows --primary; no spinner, the header already shows page context. */}
        <NextTopLoader color="var(--primary)" height={3} showSpinner={false} shadow={false} showForHashAnchor={false} />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
