import { NextResponse, type NextRequest } from "next/server";
import { createUserClient } from "@/server/db/user-client";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const destination = new URL("/reset-password?status=invalid-link", request.url);
  if (!code && (!tokenHash || type !== "recovery")) return NextResponse.redirect(destination);

  const client = await createUserClient();
  const { error } = tokenHash && type === "recovery"
    ? await client.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
    : await client.auth.exchangeCodeForSession(code!);
  if (error) return NextResponse.redirect(destination);
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user || user.is_anonymous) return NextResponse.redirect(destination);

  return NextResponse.redirect(new URL("/reset-password", request.url));
}
