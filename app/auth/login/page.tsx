"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  function getNextPath() {
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "/";
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Important:
    // If the user came from an invite link, send them back there.
    const next = getNextPath();

    router.push(next);
    router.refresh();
  }

  async function handleGoogleLogin() {
    setError("");
    setGoogleLoading(true);

    const next = getNextPath();

    const redirectTo =
      `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f6f2] px-5 py-10 text-[#171717]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center">
        <div className="w-full rounded-[32px] border border-black/10 bg-white p-7 shadow-[0_20px_70px_rgba(0,0,0,0.06)] md:p-9">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-lg font-bold text-white"
          >
            V
          </button>

          <h1 className="mt-8 text-3xl font-semibold tracking-[-0.03em] text-[#171717]">
            Welcome back
          </h1>

          <p className="mt-2 text-sm leading-6 text-[#555555]">
            Sign in to continue planning with Voyager.
          </p>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="mt-7 flex w-full items-center justify-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3.5 text-sm font-semibold text-[#171717] transition hover:bg-black/[0.03] disabled:opacity-50"
          >
            <span className="flex h-5 w-5 items-center justify-center text-sm font-bold">
              G
            </span>

            {googleLoading
              ? "Connecting..."
              : "Continue with Google"}
          </button>

          <div className="my-7 flex items-center gap-4">
            <div className="h-px flex-1 bg-black/10" />

            <span className="text-[10px] font-semibold tracking-[0.12em] text-black/35">
              OR CONTINUE WITH EMAIL
            </span>

            <div className="h-px flex-1 bg-black/10" />
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-[#555555]">
                Email
              </span>

              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-2xl border border-black/15 bg-white px-4 py-3.5 text-sm text-[#171717] outline-none placeholder:text-[#777777] focus:border-black/40 focus:ring-2 focus:ring-black/5"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-[#555555]">
                Password
              </span>

              <input
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-2xl border border-black/15 bg-white px-4 py-3.5 text-sm text-[#171717] outline-none placeholder:text-[#777777] focus:border-black/40 focus:ring-2 focus:ring-black/5"
              />
            </label>

            {error && (
              <div className="rounded-2xl bg-[#fff3f1] p-4 text-sm leading-6 text-[#a43827]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full rounded-full bg-black py-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in →"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#555555]">
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => {
                const next = getNextPath();

                router.push(
                  `/auth/signup?next=${encodeURIComponent(next)}`,
                );
              }}
              className="font-semibold text-black hover:underline"
            >
              Create one
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}