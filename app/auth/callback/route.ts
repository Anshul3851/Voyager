import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/login?error=Missing+OAuth+code", requestUrl.origin),
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/auth/login?error=${encodeURIComponent(error.message)}`,
        requestUrl.origin,
      ),
    );
  }

  return NextResponse.redirect(
    new URL(next, requestUrl.origin),
  );
}