import { Skeleton } from "@/components/ui/skeleton";

export function PortalLoading() {
  return (
    <main className="flex min-h-svh w-full" aria-busy="true" role="status">
      <span className="sr-only">Loading page</span>
      <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar p-4 md:flex md:flex-col">
        <Skeleton className="h-10 w-44" />
        <div className="mt-10 flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-9 w-full" />)}
        </div>
        <Skeleton className="mt-auto h-12 w-full" />
      </aside>
      <section className="min-w-0 flex-1">
        <header className="flex min-h-16 items-center gap-4 border-b border-border px-5 sm:px-8">
          <Skeleton className="size-8" />
          <Skeleton className="h-5 w-40" />
        </header>
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
          <div className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-72 max-w-full" />
            <Skeleton className="h-5 w-96 max-w-full" />
          </div>
          <Skeleton className="h-16 w-full" />
          <div className="grid gap-5 md:grid-cols-2">
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-44 w-full" />
            <Skeleton className="h-32 w-full md:col-span-2" />
          </div>
        </div>
      </section>
    </main>
  );
}
