import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./server/db/database.types";

function csvTextResponse(
  body: string,
  status: number,
  sourceCookies?: ReturnType<NextResponse["cookies"]["getAll"]>
) {
  const res = new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
  sourceCookies?.forEach((cookie) => res.cookies.set(cookie));
  return res;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const protectedPath = /^\/(student|council|faculty|admin|account)(\/|$)/.test(request.nextUrl.pathname);
  const isCsvDownload = protectedPath && request.nextUrl.pathname.endsWith(".csv");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (protectedPath) {
      if (isCsvDownload) {
        return csvTextResponse("Unable to verify access. Try again later.", 503);
      }
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
  if (protectedPath && error && error.name !== "AuthSessionMissingError" && error.status !== 401 && error.status !== 403) {
    if (isCsvDownload) {
      return csvTextResponse(
        "Unable to verify access. Try again later.",
        503,
        response.cookies.getAll()
      );
    }
    response.headers.set("Cache-Control", "private, no-store");
    return new NextResponse(null, { status: 503, headers: response.headers });
  }
  if (protectedPath && (!data?.claims || data.claims.is_anonymous)) {
    if (isCsvDownload) {
      return csvTextResponse("Authentication required.", 401, response.cookies.getAll());
    }
    const destination = new URL("/sign-in", request.url);
    if (["/student", "/council", "/faculty", "/admin", "/account"].includes(request.nextUrl.pathname)) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mediapipe/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
