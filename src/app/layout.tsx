import type { Metadata, Viewport } from "next";
import NextTopLoader from "nextjs-toploader";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Florence",
  description: "Faculty of Nursing records, events, payments, service and clearance.",
};

export const viewport: Viewport = {
  // Matches --background so the mobile browser bar blends with the page.
  themeColor: "#fff8f2",
  // Draw under the iPhone home indicator and notch; safe-area insets are padded in globals.css and fixed bars.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {/* Token-driven so the bar follows --primary; no spinner, the header already shows page context. */}
        <NextTopLoader color="var(--primary)" height={3} showSpinner={false} shadow={false} showForHashAnchor={false} />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
