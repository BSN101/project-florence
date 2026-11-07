import Link from "next/link";

export default function FacultyPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="page-title">Faculty workspace</h1>
      <p className="text-muted-foreground">
        Not yet implemented. This public placeholder has no authentication or
        Faculty records.
      </p>
      <Link className="underline underline-offset-4" href="/">
        Back to Project Florence
      </Link>
    </main>
  );
}
