import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./server/db/database.types";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (/^\/(student|council|faculty|admin)(\/|$)/.test(request.nextUrl.pathname)) {
      return new NextResponse(null, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    return response;
  }

  const client = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        for (const [name, value] of Object.entries(cacheHeaders)) response.headers.set(name, value);
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });

  const { data, error } = await client.auth.getClaims();
  const protectedPath = /^\/(student|council|faculty|admin)(\/|$)/.test(request.nextUrl.pathname);
  if (protectedPath && error && error.name !== "AuthSessionMissingError" && error.status !== 401 && error.status !== 403) {
    response.headers.set("Cache-Control", "private, no-store");
    return new NextResponse(null, { status: 503, headers: response.headers });
  }
  if (protectedPath && (!data?.claims || data.claims.is_anonymous)) {
    const destination = new URL("/sign-in", request.url);
    if (["/student", "/council", "/faculty", "/admin"].includes(request.nextUrl.pathname)) {
      destination.searchParams.set("next", request.nextUrl.pathname);
    }
    const redirect = NextResponse.redirect(destination);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    for (const name of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(name);
      if (value) redirect.headers.set(name, value);
    }
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
