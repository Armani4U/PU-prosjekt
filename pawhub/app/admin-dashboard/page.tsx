"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types/auth";
import { isAdmin } from "@/lib/auth/permissions";

type ProfileRow = {
  role: "admin" | "user" | null;
};

type UserRow = {
  id: string;
  role: "admin" | "user" | null;
  email?: string | null;
  display_name?: string | null;
};

export default function AdminInsightsPage() {
  const router = useRouter();

  const [userRole, setUserRole] = useState<UserRole>("guest");
  const [loading, setLoading] = useState(true);

  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [totalPosts, setTotalPosts] = useState<number>(0);
  const [totalEvents, setTotalEvents] = useState<number>(0);

  const [usersList, setUsersList] = useState<UserRow[]>([]);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      const next = saved ? saved === "dark" : systemDark;
      setIsDark(next);
      document.documentElement.classList.toggle("dark", next);
  } catch {}
}, []);

  const loadUsers = async () => {
    const res = await supabase
      .from("profiles")
      .select("id, display_name, role, email")
      .order("role", { ascending: false });

    setUsersList(res.data ?? []);
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  };

  const deleteUser = async (userId: string) => {
    const sure = confirm("Delete this user permanently? This cannot be undone.");
    if (!sure) return;

    setBusyUserId(userId);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      alert("You are not logged in.");
      setBusyUserId(null);
      return;
    }

    const resp = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const json = await resp.json();

    if (!resp.ok) {
      alert(json.error ?? "Failed to delete user.");
      setBusyUserId(null);
      return;
    }

    await loadUsers();
    setBusyUserId(null);
  };

  useEffect(() => {
    let cancelled = false;

    const loadRoleAndStats = async () => {
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single<ProfileRow>();

      const role: UserRole = profile?.role === "admin" ? "admin" : "user";
      if (cancelled) return;

      setUserRole(role);

      if (!isAdmin(role)) {
        router.replace("/");
        return;
      }

      const [usersRes, postsRes, eventsRes] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("posts").select("id", { count: "exact", head: true }),
        supabase.from("events").select("id", { count: "exact", head: true }),
      ]);

      if (cancelled) return;

      setTotalUsers(usersRes.count ?? 0);
      setTotalPosts(postsRes.count ?? 0);
      setTotalEvents(eventsRes.count ?? 0);

      await loadUsers();

      setLoading(false);
    };

    loadRoleAndStats();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const canRender = useMemo(() => isAdmin(userRole), [userRole]);

  if (loading) {
    return (
      <div className={"min-h-screen" + (isDark ? " bg-zinc-900 text-shadow-zinc-900" : "bg-gray-50 text-gray-900")}>
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className={"border rounded-2xl p-6" + (isDark ? " bg-zinc-950 text-zinc-100" : "bg-white text-gray-700")}>
            Loading insights…
          </div>
        </div>
      </div>
    );
  }

  if (!canRender) return null;

  return (
    <div className={"min-h-screen " + (isDark ? "bg-zinc-900 text-zinc-100" : "bg-gray-50 text-gray-900")}>
      <button
        type="button"
        onClick={() => router.push("/")}
        className={"fixed left-4 top-4 z-20 inline-flex items-center justify-center rounded-full p-2 shadow-sm transition " + (isDark ? "bg-zinc-950/80 text-zinc-100 hover:bg-zinc-900" : "bg-white/90 text-gray-900 hover:bg-white")}
        aria-label="Back to home"
        title="Back"
      >
        <span className="text-lg leading-none px-1">←</span>
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className={"fixed right-4 top-4 z-20 inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold shadow-sm transition " +
          (isDark ? "bg-zinc-950/80 text-zinc-100 hover:bg-zinc-900" : "bg-white/90 text-gray-900 hover:bg-white")}
        aria-label="Toggle dark mode"
      >
        {isDark ? "☀️" : "🌙"}
      </button>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div>
          <h1 className={"text-2xl font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>
            Statistics & insights
          </h1>
          <p className={"text-sm " + (isDark ? "text-zinc-400" : "text-gray-600")}>
            Overview of application activity and usage.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className={"border rounded-2xl p-5 " + (isDark ? "bg-zinc-800 border-zinc-700 text-zinc-100" : "bg-white border-gray-200 text-gray-900")}>
          <div className="text-xs font-medium opacity-70">Total users</div>
          <div className="mt-2 text-2xl font-semibold">{totalUsers}</div>
        </div>

          <div className={"border rounded-2xl p-5 " + (isDark ? "bg-zinc-800 border-zinc-700 text-zinc-100" : "bg-white border-gray-200 text-gray-900")}>
            <div className="text-xs font-medium opacity-70">Total posts</div>
            <div className="mt-2 text-2xl font-semibold">{totalPosts}</div>
          </div>

          <div className={"border rounded-2xl p-5 " + (isDark ? "bg-zinc-800 border-zinc-700 text-zinc-100" : "bg-white border-gray-200 text-gray-900")}>
            <div className="text-xs font-medium opacity-70">Total events</div>
            <div className="mt-2 text-2xl font-semibold">{totalEvents}</div>
          </div>
        </section>

        <section className={"border rounded-2xl p-6 " + (isDark ? "bg-zinc-800 border-zinc-700 text-zinc-100" : "bg-white border-gray-200 text-gray-900")}>
          <h2 className="text-lg font-semibold">Next</h2>
          <p className={"mt-1 text-sm opacity-70"}>
            Add trends (last 7/30 days), funnels, and top active users/actions.
          </p>
        </section>

        <section className={"border rounded-2xl p-6 " + (isDark ? "bg-zinc-950 border-zinc-800 text-zinc-100" : "bg-white border-gray-200 text-gray-900")}>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm mt-1 opacity-70">
            Admin can remove users.
          </p>  

          <div className="mt-4 space-y-2">
            {usersList.map((u) => (
              <div
                key={u.id}
                className={"flex items-center justify-between gap-3 border rounded-lg p-3" + (isDark ? " bg-zinc-900 border-zinc-800" : " border-gray-200")}>
                <div className="min-w-0">
                  <div className={"text-sm font-medium truncate" + (isDark ? " text-zinc-100" : " text-gray-900")}>
                    {u.display_name ?? u.email ?? u.id}
                  </div>
                  <div className={"text-xs" + (isDark ? " text-zinc-400" : " text-gray-500")}>
                    Role: {u.role ?? "user"}
                  </div>
                </div>

                <button
                  onClick={() => deleteUser(u.id)}
                  disabled={busyUserId === u.id || u.role === "admin"}
                  className={"px-3 py-2 text-sm rounded-md border disable:opacity-50" + (isDark ? "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700" : "border-gray-300 bg-white hover:bg-gray-100")}>
                  {busyUserId === u.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}