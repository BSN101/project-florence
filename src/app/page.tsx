import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-8 px-6 py-12 sm:px-8 sm:py-20">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <span className="font-heading text-base font-medium">Project Florence</span>
        <nav className="flex items-center gap-4"><Link href="/forgot-password" className="text-muted-foreground hover:underline">Recover access</Link><Link href="/sign-in" className="font-medium text-primary hover:underline">Sign in →</Link></nav>
      </header>

      <div className="grid items-center gap-8 py-8 md:grid-cols-2 md:gap-16">
        <section className="flex flex-col items-start gap-6">
          <p className="font-medium text-primary">Faculty of Nursing · One place to begin</p>
          <h1 className="page-title">Project Florence</h1>
          <p className="max-w-md text-muted-foreground">
            A dedicated space for student records, Council events and payments,
            merits, demerits, service and clearance.
          </p>
          <div className="flex flex-col items-start gap-3">
            <Link href="/sign-in" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90">Sign in to Florence →</Link>
            <p className="text-muted-foreground">Need help accessing your account? <Link href="/forgot-password" className="text-primary underline">Request a recovery link</Link>.</p>
            <p className="text-sm text-muted-foreground">Expecting an invitation? <Link href="/invitation" className="text-primary underline">Check invitation availability</Link>.</p>

          </div>
        </section>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Built around student journeys</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Florence brings academic records, events, financial obligations and
            clearance into one application. Your workspace is determined by
            your active account and assignments; there is no public signup.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
