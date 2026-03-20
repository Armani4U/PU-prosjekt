"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import dynamic from "next/dynamic";

const Spline = dynamic(() => import("@splinetool/react-spline"), { ssr: false });

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      const next = saved ? saved === "dark" : systemDark;
      setIsDark(next);
      document.documentElement.classList.toggle("dark", next);
      const rawNext = new URLSearchParams(window.location.search).get("next") ?? "/";
      setNextPath(rawNext.startsWith("/") ? rawNext : "/");
  } catch {}
}, []);

  const continueAsGuest = () => {
    router.replace(nextPath);
  };

  const signIn = async () => {
    const emailClean = email.trim();
    if (!emailClean || !password || loading) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const {data, error: authError } =
        await supabase.auth.signInWithPassword({
          email: emailClean,
          password,
        });

      if (authError) {
        setError(authError.message);
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('deleted_at')
        .eq('id', data.user?.id)
        .single();

      if (profileError) {
        setError(profileError.message);
        return;
      }

      if (profile?.deleted_at) {
        await supabase.auth.signOut();
        setError("This account has been deleted.");
        return; // stopper redirect
      }

      setMessage(
        `Signed in${data.user?.email ? ` as ${data.user.email}` : ""}.`
      )
      router.replace(nextPath);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const signUp = async () => {

    const emailClean = email.trim();
    if (!emailClean || !password) {
      setError("Please enter email and password.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const {data, error: authError } =
        await supabase.auth.signUp({
          email: emailClean,
          password,
        });

      if (authError) {
        setError(authError.message);
        return;
      }

      setMessage(
        data.session
          ? "Account created and signed in."
          : "Account created. Check your email to confirm before signing in."

      )
      if (data.session) router.replace(nextPath);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={"relative min-h-screen flex items-center justify-center overflow-hidden" + (isDark ? " bg-zinc-900" : "bg-white")}>
      <div className="absolute inset-0 z-0">
        <Spline
          scene="https://prod.spline.design/4gYNTwbPcYYn0v4y/scene.splinecode"
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* Optional: light tint to keep the form readable */}
      <div className={"absolute inset-0 z-[1] pointer-events-none" + (isDark ? " bg-black/50" : "bg-white/50")} />

      <div className="relative z-10 flex flex-col items-center translate-x-12 md:translate-x-24">
        <img
          src="/pawhub-logo-trans.png"
          alt="PawHub Logo"
          className="mb-6 w-56 md:w-64 lg:w-72 select-none pointer-events-none drop-shadow"
        />
        <div className={"-mt-20 w-full max-w-sm backdrop-blur rounded-lg shadow-md p-6 " + (isDark ? "bg-zinc-950/95 text-zinc-100" : "bg-white/90 text-gray-900")}>
          <h1 className="text-2xl font-semibold text-center mb-6">Login</h1>

            <form className="space-y-4" onSubmit={(e) => {e.preventDefault(); signIn();}}>  
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className={"w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 " + (isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 focus:ring-zinc-400" : "border-gray-300 bg-white text-gray-900 focus:ring-black")}
              />

              <input
                type="password"
                placeholder="Password"
                className={"w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 " + (isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500 focus:ring-zinc-400" : "border-gray-300 bg-white text-gray-900 focus:ring-black")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              <p className="text-sm text-center mt-4">
                <Link href="/forgot-password" className={isDark ? "text-zinc-400 hover:underline" : "text-gray-600 hover:underline"}>
                  Forgot password?
                </Link>
              </p>

              {error && <p className="text-sm text-red-600 text-center">{error}</p>}
              {message && (
                <p className="text-sm text-green-700 text-center">{message}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-zinc-900 text-white rounded-md py-2 hover:bg-gray-800 transition disabled:opacity-50"
              >
                Sign in
              </button>

              <button
                type="button"
                onClick={signUp}
                disabled={loading}
                className={"w-full border rounded-md py-2 transition disabled:opacity-50 " + (isDark ? "border-zinc-600 text-zinc-100 hover:bg-zinc-800" : "border-black hover:bg-gray-100")}
              >
                Sign up
              </button>

              <div className="relative flex items-center">
                <div className="grow border-t border-gray-200"></div>
                <span className="mx-2 text-sm text-gray-400">or</span>
                <div className="grow border-t border-gray-200"></div>
              </div>

              <button
                type="button"
                onClick={continueAsGuest}
                disabled={loading}
                className={"w-full border rounded-md py-2 transition disabled:opacity-50" + (isDark ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "border-black-300 hover:bg-gray-50")}
              >
                Continue as guest
              </button>
            </form>
        </div>
      </div>
    </main>
  );
}