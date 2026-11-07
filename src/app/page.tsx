import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-8 px-6 py-12 sm:px-8 sm:py-20">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <span className="font-heading text-base font-medium">Project Florence</span>
        <span className="text-muted-foreground">Faculty of Nursing</span>
      </header>

      <div className="grid items-center gap-8 py-8 md:grid-cols-2 md:gap-16">
        <section className="flex flex-col items-start gap-6">
          <p className="font-medium text-primary">A home for nursing records</p>
          <h1 className="page-title">Project Florence</h1>
          <p className="max-w-md text-muted-foreground">
            A planned space for student records, Council events and payments,
            merits, demerits, service and clearance.
          </p>
          <div className="flex flex-col items-start gap-3">
            <button
              type="button"
              disabled
              className="min-h-11 rounded-lg bg-muted px-6 py-3 font-medium text-neutral"
            >
              Sign in unavailable
            </button>
            <p className="text-muted-foreground">
              Sign-in and workspace access are not yet implemented.
            </p>
          </div>
        </section>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Built around student journeys</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Florence is being prepared to bring academic records, events,
            financial obligations and clearance into one application. No
            student data or account features are available on this page.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
