"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/types/auth";
import { hasPermission, isAdmin, isAuthenticated } from "@/lib/auth/permissions";
import PostLikeButton from "@/app/components/PostLikeButton";

type Post = {
  id: string;
  userId: string;
  author: string;
  authorAvatarUrl?: string | null;
  content: string;
  createdAt: string;
  likes: any[];
};

type EventItem = {
  id: string;
  creatorId: string;
  title: string;
  createdAt: string;
  startsAt: string;
  endsAt: string;
  startsAtIso: string;
  endsAtIso: string;
  capacity: number;
  status: string;
  creator: string;
  headerImageUrl?: string | null;
};

type ProfileRow = {
  display_name: string | null;
  role: "admin" | "user" | null;
  email: string | null;
  avatar_url: string | null;
  updated_at: string | null;
};

function resolveEventHeaderUrl(eventId: string, headerImageUrl: string | null | undefined) {
  if (headerImageUrl && /^https?:\/\//i.test(headerImageUrl)) return headerImageUrl;

  if (headerImageUrl && headerImageUrl.trim().length > 0) {
    const { data } = supabase.storage.from("event-headers").getPublicUrl(headerImageUrl);
    return data.publicUrl;
  }

  const fallbackKey = `${eventId}/header.jpg`;
  const { data } = supabase.storage.from("event-headers").getPublicUrl(fallbackKey);
  return data.publicUrl;
}


export default function HomeShell() {
  const router = useRouter();
  const toLocalDateTimeInput = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  };

  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [userRole, setUserRole] = useState<UserRole>("guest");

  const [loadingPosts, setLoadingPosts] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

  const [eventsError, setEventsError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [hideInactiveEvents, setHideInactiveEvents] = useState(false);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventStartsAt, setNewEventStartsAt] = useState("");
  const [newEventEndsAt, setNewEventEndsAt] = useState("");
  const [newEventCapacity, setNewEventCapacity] = useState<number>(20);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const isEditMode = editingEventId !== null;
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [createPostContent, setCreatePostContent] = useState("");
  const [showEditPostModal, setShowEditPostModal] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editPostContent, setEditPostContent] = useState("");
  const [showDeletePostModal, setShowDeletePostModal] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [showDeleteEventModal, setShowDeleteEventModal] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  const [isDark, setIsDark] = useState(false);

  const applyThemeClass = (dark: boolean) => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", dark);
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      const nextDark = saved ? saved === "dark" : systemDark;
      setIsDark(nextDark);
      applyThemeClass(nextDark);
      try {
        localStorage.setItem("theme", nextDark ? "dark" : "light");
      } catch {
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    applyThemeClass(isDark);
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("theme", next ? "dark" : "light");
      } catch {
      }
      return next;
    });
  };

  const loadProfile = async (uid: string) => {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("display_name, role, email, avatar_url, updated_at")
      .eq("id", uid)
      .single<ProfileRow>();

    if (!error && profile) {
      setDisplayName(profile.display_name ?? "New user");
      setAvatarUrl(profile.avatar_url ?? "");

      const validRole: UserRole =
        profile.role === "admin" || profile.role === "user" ? profile.role : "user";

      setUserRole(validRole);
      return;
    }

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: uid, display_name: "New user", role: "user" }, { onConflict: "id" });

    if (!upsertError) {
      setDisplayName("New user");
      setUserRole("user");
      setAvatarUrl("");
    }
  };

  const loadPosts = async () => {
    setLoadingPosts(true);
    setPostsError(null);

    const { data: rows, error } = await supabase
      .from("posts")
      .select("id, user_id, content, created_at, post_likes(user_id)")
      .order("created_at", { ascending: false });

    if (error) {
      setPostsError(error.message);
      console.error("Failed to load posts:", error);
      setPosts([]);
      setLoadingPosts(false);
      return;
    }

    const userIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean))
    );

    const nameById: Record<string, string> = {};
    const avatarById: Record<string, string> = {};

    if (userIds.length > 0) {
      const { data: profs, error: profErr } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .in("id", userIds);

      if (profErr) {
        console.error("Failed to load profiles for authors:", profErr);
      } else {
        (profs ?? []).forEach((p: any) => {
          nameById[p.id] = p.display_name;
          if (p.avatar_url) avatarById[p.id] = p.avatar_url;
        });
      }
    }

    const mapped: Post[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      author: nameById[r.user_id] ?? "Unknown",
      authorAvatarUrl: avatarById[r.user_id] ?? null,
      content: r.content,
      createdAt: new Date(r.created_at).toLocaleString(),
      likes: r.post_likes ?? [],
    }));

    setPosts(mapped);
    setLoadingPosts(false);
  };

  const loadEvents = async () => {
    setEventsError(null);

    const { data: rows, error } = await supabase
      .from("events")
      .select("id, creator_id, title, created_at, starts_at, ends_at, capacity, status, header_image_url")
      .order("created_at", { ascending: false });

    if (error) {
      setEventsError(error.message);
      console.error("Failed to load events:", error);
      setEvents([]);
      return;
    }

    const creatorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.creator_id).filter(Boolean))
    );

    const nameById: Record<string, string> = {};

    if (creatorIds.length > 0) {
      const { data: profs, error: profErr } = await supabase
        .from("public_profiles")
        .select("id, display_name")
        .in("id", creatorIds);

      if (profErr) {
        console.error("Failed to load profiles for event creators:", profErr);
      } else {
        (profs ?? []).forEach((p: any) => {
          nameById[p.id] = p.display_name;
        });
      }
    }

    /* Auto-mark events as inactive if now is outside the start/end interval */
    const now = Date.now();
    const toInactivate = (rows ?? [])
      .filter((r: any) => {
        const starts = new Date(r.starts_at).getTime();
        const ends = new Date(r.ends_at).getTime();
        const outside = now < starts || now > ends;
        return outside && (r.status ?? "active") !== "inactive";
      })
      .map((r: any) => r.id);

    if (toInactivate.length > 0 && isAdmin(userRole)) {
      const { error: updErr } = await supabase
        .from("events")
        .update({ status: "inactive" })
        .in("id", toInactivate);
      if (updErr) console.warn("Failed to auto-inactivate events:", updErr);
    }

    const mapped: EventItem[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      creatorId: r.creator_id,
      title: r.title,
      createdAt: new Date(r.created_at).toLocaleString(),
      startsAt: new Date(r.starts_at).toLocaleString(),
      endsAt: new Date(r.ends_at).toLocaleString(),
      startsAtIso: r.starts_at,
      endsAtIso: r.ends_at,
      capacity: Number(r.capacity ?? 0),
      status:
        now < new Date(r.starts_at).getTime() ||
        now > new Date(r.ends_at).getTime()
          ? "inactive"
          : (r.status ?? "active"),
      headerImageUrl: resolveEventHeaderUrl(r.id, r.header_image_url ?? null),
      creator: nameById[r.creator_id] ?? "Unknown",
    }));

    setEvents(mapped);
  };

  useEffect(() => {
    let cancelled = false;
    let applying = false;

    const applySession = async (session: any) => {
      if (cancelled) return;
      if (applying) return;
      applying = true;

      try {
        const u = session?.user;

        if (u) {
          setUserId(u.id);
          setUserEmail(u.email ?? "");

          if (u.is_anonymous) {
          setUserRole("guest");
          setDisplayName("Guest");
          await loadPosts();
          await loadEvents();
          return;
        }

          await loadProfile(u.id);
          await loadPosts();
          await loadEvents();
          return;
        }

        setUserRole("guest");
        setUserId(null);
        setUserEmail("");
        setDisplayName("");
        setAvatarUrl("");
        await loadPosts();
        await loadEvents();
      } finally {
        applying = false;
      }
    };

    const safe = async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          console.error(e);
        }
      }
    };

    safe(async () => {
      const { data } = await supabase.auth.getSession();
      await applySession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      safe(async () => {
        await applySession(session);
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(
      (p) => p.content.toLowerCase().includes(q) || p.author.toLowerCase().includes(q)
    );
  }, [posts, query]);

  const filteredEvents = useMemo(() => {
    const base = hideInactiveEvents ? events.filter((e) => e.status === "active") : events;
  
    const q = query.trim().toLowerCase();
    if (!q) return base;
  
    return base.filter(
      (ev) =>
        ev.title.toLowerCase().includes(q) ||
        ev.creator.toLowerCase().includes(q) ||
        ev.status.toLowerCase().includes(q)
    );
  }, [events, query, hideInactiveEvents]);

  const createPost = () => {
    if (!isAuthenticated(userRole)) {
      alert("Du må logge inn for å lage posts");
      return;
    }
    setCreatePostContent("");
    setShowCreatePostModal(true);
  };

  const editPost = (postId: string, currentContent: string) => {
    if (!isAuthenticated(userRole)) return;
      setEditingPostId(postId);
      setEditPostContent(currentContent);
      setShowEditPostModal(true);
    };
  
  const deletePost = (postId: string) => {
    if (!isAuthenticated(userRole)) return;
      setDeletingPostId(postId);
      setShowDeletePostModal(true);
    };

    const submitCreatePost = async () => {
  if (!createPostContent.trim() || !userId) return;
  const { error } = await supabase.from("posts").insert({ user_id: userId, content: createPostContent.trim() });
  if (error) { alert(error.message); return; }
  setShowCreatePostModal(false);
  setCreatePostContent("");
  await loadPosts();
};

    const submitEditPost = async () => {
      if (!editingPostId || !editPostContent.trim()) return;
      let q = supabase.from("posts").update({ content: editPostContent.trim() }).eq("id", editingPostId);
      if (!isAdmin(userRole)) { if (!userId) return; q = q.eq("user_id", userId); }
      const { error } = await q;
      if (error) { alert(error.message); return; }
      setShowEditPostModal(false);
      setEditingPostId(null);
      await loadPosts();
    };

    const confirmDeletePost = async () => {
      if (!deletingPostId) return;
      let q = supabase.from("posts").delete().eq("id", deletingPostId);
      if (!isAdmin(userRole)) { if (!userId) return; q = q.eq("user_id", userId); }
      const { error } = await q;
      if (error) { alert(error.message); return; }
      setShowDeletePostModal(false);
      setDeletingPostId(null);
      await loadPosts();
    };

  const openEditEvent = (ev: EventItem) => {
    if (!isAdmin(userRole)) return;
    setEditingEventId(ev.id);
    setNewEventTitle(ev.title);
    setNewEventStartsAt(toLocalDateTimeInput(ev.startsAtIso));
    setNewEventEndsAt(toLocalDateTimeInput(ev.endsAtIso));
    setNewEventCapacity(ev.capacity);
    setIsCreateEventOpen(true);
  };
  
  const deleteEvent = (eventId: string) => {
    if (!isAdmin(userRole)) {
      alert("Kun administratorer kan slette events");
      return;
    }
    setDeletingEventId(eventId);
    setShowDeleteEventModal(true);
  };

  const confirmDeleteEvent = async () => {
    if (!deletingEventId) return;
    const { error } = await supabase.from("events").delete().eq("id", deletingEventId);
    if (error) {
      alert(error.message);
      return;
    }
    setShowDeleteEventModal(false);
    setDeletingEventId(null);
    await loadEvents();
  };

  const createEvent = async () => {
    if (!isAuthenticated(userRole)) {
      alert("Du må logge inn for å lage events");
      return;
    }

    if (!hasPermission(userRole, "canCreateEvent")) {
      alert("Kun administratorer kan lage events");
      return;
    }
    setEditingEventId(null);
    setNewEventTitle("");
    setNewEventStartsAt("");
    setNewEventEndsAt("");
    setNewEventCapacity(20);
    setIsCreateEventOpen(true);
  };

  const submitCreateEvent = async () => {
    if (!userId) {
      alert("Ikke innlogget");
      return;
    }

    if (isEditMode && !isAdmin(userRole)) {
      alert("Kun administratorer kan endre events");
      return;
    }

    if (isEditMode && !editingEventId) {
      alert("No event selected for editing.");
      return;
    }

    const title = newEventTitle.trim();
    if (!title) {
      alert("Event må ha et navn.");
      return;
    }

    if (!newEventStartsAt || !newEventEndsAt) {
      alert("Velg start og slutt tidspunkt.");
      return;
    }

    const startsDate = new Date(newEventStartsAt);
    const endsDate = new Date(newEventEndsAt);

    if (Number.isNaN(startsDate.getTime()) || Number.isNaN(endsDate.getTime())) {
      alert("Ugyldig datoformat.");
      return;
    }

    if (endsDate <= startsDate) {
      alert("Sluttid må være etter starttid.");
      return;
    }

    const capacity = Number(newEventCapacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      alert("Kapasitet må være et positivt tall.");
      return;
    }

    setCreatingEvent(true);
    try {
      const startsIso = startsDate.toISOString();
      const endsIso = endsDate.toISOString();
      const nowMs = Date.now();
      const nextStatus = nowMs < startsDate.getTime() || nowMs > endsDate.getTime()
        ? "inactive"
        : "active";

      const { error } = isEditMode
        ? await supabase
            .from("events")
            .update({ title, starts_at: startsIso, ends_at: endsIso, capacity, status: nextStatus })
            .eq("id", editingEventId)
        : await supabase.from("events").insert({
            creator_id: userId,
            title,
            starts_at: startsIso,
            ends_at: endsIso,
            capacity,
            status: nextStatus,
          });

      if (error) {
        console.error("Failed to create event:", error);
        if ((error as any).code === "42501") {
          alert("Du har ikke tilgang til å lage events. Kun admins.");
        } else {
          alert(error.message);
        }
        return;
      }

      setEditingEventId(null);
      setIsCreateEventOpen(false);
      await loadEvents();
      alert(isEditMode ? "Event oppdatert!" : "Event opprettet!");
    } finally {
      setCreatingEvent(false);
    }
  };

  const handleSignOutClick = () => {
    setShowSignOutModal(true);
  }

  const confirmSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(error.message);
      return;
    }
    setShowSignOutModal(false);
    router.push("/login");
    router.refresh();
  };

  const initial = ((displayName || userEmail)?.[0] || "U").toUpperCase();

  const modalBackdrop = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4";
  const modalCard = "w-full max-w-sm rounded-2xl p-5 shadow-xl " + (isDark ? "bg-zinc-950 border border-zinc-800 text-zinc-100" : "bg-white text-gray-900");
  const modalTitle = "text-lg font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900");
  const btnCancel = "rounded-xl border px-4 py-2 text-sm font-medium transition " + (isDark ? "border-zinc-700 text-zinc-100 hover:bg-zinc-800" : "border-gray-300 text-gray-700 hover:bg-gray-100");
  const btnDanger = "rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-medium text-white transition";
  const btnPrimary = "rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50";

  return (
    <div
      className={
        "min-h-screen " +
        (isDark ? "bg-zinc-900 text-zinc-100" : "bg-[#FFF7ED] text-gray-900")
      }
    >
      <div className="flex min-h-screen">
        {/* Left sidebar */}
        <aside
          className={
            "hidden md:flex md:w-64 md:shrink-0 md:flex-col md:gap-6 px-4 py-8 sticky top-0 h-screen border-r " +
            (isDark ? "border-zinc-800 bg-zinc-950" : "border-amber-200 bg-white")
          }
        >
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="flex items-center gap-2 group">
              <img
                src="/pawhub-logo-trans.png"
                alt="PawHub logo"
                width={200}
                height={200}
                className="transition-transform duration-200 group-hover:scale-105"
              />
            </Link>
          </div>

          <nav className="flex flex-col gap-2">
            <Link
              href="/"
              className="w-full rounded-xl px-3 py-2 text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 shadow-sm transition text-left"
            >
              Home
            </Link>

            {isAuthenticated(userRole) && (
              <button
                onClick={createPost}
                className="w-full rounded-xl px-3 py-2 text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 shadow-sm transition text-left"
              >
                + Create post
              </button>
            )}

            {hasPermission(userRole, "canCreateEvent") && (
              <button
                onClick={createEvent}
                className="w-full rounded-xl px-3 py-2 text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 shadow-sm transition text-left"
              >
                + Create event
              </button>
            )}

            {isAdmin(userRole) && (
              <Link
                href="/admin-dashboard"
                className="w-full rounded-xl px-3 py-2 text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 shadow-sm transition text-left"
              >
                Statistics & insights
              </Link>
            )}
          </nav>
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full rounded-xl px-3 py-2 text-sm font-semibold border border-amber-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 hover:bg-amber-50 dark:hover:bg-zinc-800 transition"
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {isDark ? "☀️ Light mode" : "🌙 Dark mode"}
          </button>
          <div
            className={
              "mt-auto pt-4 border-t " +
              (isDark ? "border-zinc-800" : "border-gray-200")
            }
          >
            {isAuthenticated(userRole) ? (
              <>
                <div className="text-xs text-gray-500">Innlogget som</div>
                <div className="text-sm font-medium truncate">
                  {displayName || userEmail}
                  {isAdmin(userRole) && (
                    <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                      Admin
                    </span>
                  )}
                </div>
                <button
                  onClick={handleSignOutClick}
                  className="mt-3 w-full rounded-md px-3 py-2 text-sm border border-red-300 text-red-700 hover:bg-red-50"
                >
                  Log out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="block w-full rounded-md px-3 py-2 text-sm text-center bg-amber-600 text-white hover:bg-amber-700"
              >
                Log in
              </Link>
            )}
          </div>
        </aside>

        {/* Main */}
        <div className="relative flex-1 min-w-0">
          {/* Background behind Events/Feed */}
          <div
            className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center"
            style={{ backgroundImage: "url('/Dog_running_field.jpeg')" }}
            aria-hidden="true"
          />
          {/* Warm tint overlay for readability */}
          <div
            className={
              "pointer-events-none absolute inset-0 -z-10 " +
              (isDark ? "bg-black/35" : "bg-amber-50/55")
            }
            aria-hidden="true"
          />
          <header
            className={
              "sticky top-0 z-10 backdrop-blur border-b " +
              (isDark
                ? "bg-zinc-950/70 border-zinc-800"
                : "bg-white/80 border-amber-200")
            }
          >
            <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-4">
              <div className="md:hidden font-semibold">Group-21</div>

              <div className="flex-1">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search posts and events…"
                  className={
                    "w-full rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 " +
                    (isDark
                      ? "border border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500"
                      : "border border-amber-200 bg-white/80 text-gray-900 placeholder:text-gray-400")
                  }
                />
              </div>

              <Link
                href={userRole === "guest" ? "/login" : "/profile"}
                className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-zinc-800"
                title="Profile"
              >
                <div className="h-9 w-9 rounded-full bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 overflow-hidden flex items-center justify-center font-semibold text-gray-700 dark:text-zinc-100">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{initial}</span>
                  )}
                </div>
              </Link>
            </div>
          </header>

          <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className={"text-xl font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>Events</h1>
                <p className={"text-sm " + (isDark ? "text-zinc-300" : "text-gray-600")}>
                  Competitions and events from everyone will appear here.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHideInactiveEvents((v) => !v)}
                  className="rounded-md px-3 py-2 text-sm font-medium border border-amber-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-zinc-800 transition text-gray-900 dark:text-zinc-100"
                >
                  {hideInactiveEvents ? "Show inactive" : "Hide inactive"}
                </button>

                {hasPermission(userRole, "canCreateEvent") && (
                  <button
                    type="button"
                    onClick={createEvent}
                    className="rounded-md px-3 py-2 text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition shadow-sm"
                  >
                    + Event
                  </button>
                )}
              </div>
            </div>

            <section className="space-y-3">
              {eventsError ? (
                <div className="bg-white border border-red-200 rounded-lg p-4 text-red-700">
                  Failed to load events: {eventsError}
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="bg-white/80 backdrop-blur border border-amber-200 rounded-2xl p-5 text-gray-700 shadow-sm">
                  No events yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredEvents.map((ev) => (
                    <article
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/competition?id=${ev.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/competition?id=${ev.id}`);
                        }
                      }}
                      className={
                        "group relative overflow-hidden rounded-3xl backdrop-blur shadow-xl hover:shadow-2xl transition cursor-pointer border " +
                        (isDark
                          ? "border-zinc-800 bg-zinc-900/80"
                          : "border-amber-100 bg-white/85")
                      }
                      aria-label={`Open event ${ev.title}`}
                    >
                      {/* Image header */}
                      <div className="relative h-52 w-full overflow-hidden">
                        {ev.headerImageUrl ? (
                          <img
                            src={ev.headerImageUrl}
                            alt={ev.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-b from-amber-100 via-amber-50 to-gray-200" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                      </div>

                      <div className="p-5">
                        <div className={"text-lg font-semibold truncate" + (isDark ? " text-white" : " text-gray-900")}>
                          {ev.title}
                        </div>
                        <div className={"mt-1 text-xs" + (isDark ? " text-zinc-400" : " text-gray-500")}>
                          Created by <span className={"font-medium" + (isDark ? " text-zinc-200" : " text-gray-900")}>{ev.creator}</span> • {ev.createdAt}
                        </div>

                        <div className={"mt-4 grid gap-2 text-sm" + (isDark ? " text-white" : " text-gray-900")}>
                          <div className="flex items-center justify-between">
                            <span className={isDark ? "text-gray-400 dark:text-gray-500" : "text-gray-500"}>Starts</span>
                            <span className="font-medium">{ev.startsAt}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={isDark ? "text-gray-400 dark:text-gray-500" : "text-gray-500"}>Ends</span>
                            <span className="font-medium">{ev.endsAt}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={isDark ? "text-gray-400 dark:text-gray-500" : "text-gray-500"}>Capacity</span>
                            <span className="font-medium">{ev.capacity}</span>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between">
                          <span className={isDark ? "text-gray-400 dark:text-gray-500" : "text-gray-500"}>Status</span>
                          <span
                            className={
                              "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold " +
                              (ev.status === "active"
                                ? "bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30"
                                : "bg-gray-100 text-gray-700 border border-gray-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700")
                            }
                          >
                            {ev.status}
                          </span>
                        </div>

                        {isAdmin(userRole) && (
                          <div className="mt-4 flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditEvent(ev);
                              }}
                              className="rounded-md px-3 py-1 text-xs border border-amber-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-zinc-800 text-gray-900 dark:text-zinc-100"
                              title="Edit"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteEvent(ev.id);
                              }}
                              className="rounded-md px-3 py-1 text-xs border border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-300 bg-white dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-zinc-800"
                              title="Delete"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className={"text-xl font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>Feed</h2>
                <p className={"text-sm " + (isDark ? "text-zinc-300" : "text-gray-600")}>Posts from everyone will appear here.</p>
              </div>

              {isAuthenticated(userRole) && (
                <button
                  onClick={createPost}
                  className="rounded-md px-3 py-2 text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition shadow-sm"
                >
                  + Post
                </button>
              )}
            </div>

            {loadingPosts ? (
              <div className="bg-white/85 dark:bg-zinc-900/80 border border-gray-200 dark:border-zinc-800 rounded-lg p-6 text-gray-700 dark:text-zinc-200">
                Loading posts…
              </div>
            ) : postsError ? (
              <div className="bg-white/85 dark:bg-zinc-900/80 border border-red-200 dark:border-red-500/40 rounded-lg p-6 text-red-700 dark:text-red-300">
                Failed to load posts: {postsError}
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="bg-white/85 dark:bg-zinc-900/80 border border-gray-200 dark:border-zinc-800 rounded-lg p-6 text-gray-700 dark:text-zinc-200">
                No results.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredPosts.map((post) => (
                  <article
                    key={post.id}
                    className={
                      "group relative backdrop-blur rounded-2xl p-5 shadow-md hover:shadow-lg transition-shadow border " +
                      (isDark
                        ? "bg-zinc-900/80 border-zinc-800"
                        : "bg-white/85 border-amber-200")
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gray-100 border border-gray-300 overflow-hidden flex items-center justify-center font-semibold text-gray-700">
                        {post.authorAvatarUrl ? (
                          <img
                            src={post.authorAvatarUrl}
                            alt={post.author}
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span>{(post.author?.[0] || "U").toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          <Link href={`/profile/${post.userId}`}>{post.author}</Link>
                        </div>
                        <div className="text-xs text-gray-500">{post.createdAt}</div>
                      </div>
                    </div>

                    <p className={"mt-4 whitespace-pre-wrap leading-relaxed" + (isDark ? " text-white" : " text-gray-800")}>
                      {post.content}
                    </p>
                    
                    <div className="mt-4 flex items-center gap-4">
  {userRole === "guest" ? (
    <Link href="/login" className="text-sm text-gray-500 dark:text-zinc-300 hover:text-black dark:hover:text-white underline">
      Log in to like
    </Link>
   ) : (
    <PostLikeButton
    postId={post.id}
    initialLikes={post.likes?.length || 0}
    isLikedInitially={post.likes?.some((l: any) => l.user_id === userId) || false}
  />
   )}
</div>
                    

                    {isAuthenticated(userRole) && (post.userId === userId || isAdmin(userRole)) && (
                      <div className="absolute bottom-3 right-3 hidden group-hover:flex gap-2">
                        <button
                          onClick={() => editPost(post.id, post.content)}
                          className="rounded-md px-3 py-1 text-xs border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-900 dark:text-zinc-100"
                          title="Edit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deletePost(post.id)}
                          className="rounded-md px-3 py-1 text-xs border border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-300 bg-white dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-zinc-800"
                          title="Delete"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          {/* Create Event Modal */}
          {isCreateEventOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className={"w-full max-w-lg rounded-2xl p-5 shadow-xl" + (isDark ? " bg-zinc-950 border border-zinc-800" : " bg-white")}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                  <h3 className={"text-lg font-semibold" + (isDark ? " text-white" : " text-gray-900")}>
                    {isEditMode ? "Edit event" : "Create event"}
                  </h3>
                    <p className={"mt-1 text-sm" + (isDark ? " text-zinc-400" : " text-gray-600")}>
                      Choose start/end date and time, capacity, and a title.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setIsCreateEventOpen(false); setEditingEventId(null); }}
                    className={"rounded-lg px-2 py-1 text-sm" + (isDark ? " text-zinc-400 hover:bg-zinc-800" : " text-gray-700 hover:bg-gray-100")}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-4 grid gap-3">
                  <div>
                    <label className={"text-xs font-medium" + (isDark ? " text-zinc-400" : " text-gray-600")}>Title</label>
                    <input
                      value={newEventTitle}
                      onChange={(e) => setNewEventTitle(e.target.value)}
                      className={"mt-1 w-full rounded-xl border px-3 py-2 text-sm" + (isDark ? " bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500" : " bg-white border-gray-300 text-gray-900")}
                      placeholder="Competition / event navn"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={"text-xs font-medium" + (isDark ? " text-zinc-400" : " text-gray-600")}>Starts</label>
                      <input
                        type="datetime-local"
                        value={newEventStartsAt}
                        onChange={(e) => setNewEventStartsAt(e.target.value)}
                        className={"mt-1 w-full rounded-xl border px-3 py-2 text-sm" + (isDark ? " bg-zinc-900 border-zinc-700 text-white" : " bg-white border-gray-300 text-gray-900")}
                      />
                    </div>
                    <div>
                      <label className={"text-xs font-medium" + (isDark ? " text-zinc-400" : " text-gray-600")}>Ends</label>
                      <input
                        type="datetime-local"
                        value={newEventEndsAt}
                        onChange={(e) => setNewEventEndsAt(e.target.value)}
                        className={"mt-1 w-full rounded-xl border px-3 py-2 text-sm" + (isDark ? " bg-zinc-900 border-zinc-700 text-white" : " bg-white border-gray-300 text-gray-900")}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={"text-xs font-medium" + (isDark ? " text-zinc-400" : " text-gray-600")}>Capacity</label>
                    <input
                      type="number"
                      min={1}
                      value={newEventCapacity}
                      onChange={(e) => setNewEventCapacity(Number(e.target.value))}
                      className={"mt-1 w-full rounded-xl border px-3 py-2 text-sm" + (isDark ? " bg-zinc-700 border-zinc-700 text-white" : " bg-white border-gray-300 text-gray-900")}
                    />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setIsCreateEventOpen(false); setEditingEventId(null); }}
                    className={"rounded-xl border px-4 py-2 text-sm font-medium transition" + (isDark ? " border-zinc-700 text-zinc-100 hover:bg-zinc-800" : " border-gray-300 text-gray-600 hover:bg-gray-100")}
                    disabled={creatingEvent}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitCreateEvent}
                    className="rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={creatingEvent}
                  >
                    {creatingEvent ? (isEditMode ? "Saving…" : "Creating…") : (isEditMode ? "Save" : "Create")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {showSignOutModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-sm rounded-lg bg-white dark:bg-zinc-950 p-5 shadow-xl">
                      <h3 className="text-lg font-semibold">
                        Are you sure you want to log out?
                        </h3>
                      <div className="mt-4 flex justify-end gap-2">
                        <button
                          onClick={() => setShowSignOutModal(false)}
                          className="rounded-md px-3 py-2 text-sm font-medium border border-gray-300 bg-white hover:bg-gray-100 transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmSignOut}
                          className="rounded-md px-3 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition"
                        >
                          Confirm log out
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {showCreatePostModal && (
                  <div className={modalBackdrop}>
                    <div className={modalCard}>
                      <h3 className={modalTitle}>Create post</h3>
                      <textarea
                        value={createPostContent}
                        onChange={(e) => setCreatePostContent(e.target.value)}
                        placeholder="Skriv en post…"
                        rows={4}
                        className={"mt-3 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none " + (isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" : "bg-white border-gray-300 text-gray-900")}
                      />
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setShowCreatePostModal(false)} className={btnCancel}>Cancel</button>
                        <button onClick={submitCreatePost} className={btnPrimary} disabled={!createPostContent.trim()}>Post</button>
                      </div>
                    </div>
                  </div>
                )}

                {showEditPostModal && (
                  <div className={modalBackdrop}>
                    <div className={modalCard}>
                      <h3 className={modalTitle}>Edit post</h3>
                      <textarea
                        value={editPostContent}
                        onChange={(e) => setEditPostContent(e.target.value)}
                        rows={4}
                        className={"mt-3 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none " + (isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100" : "bg-white border-gray-300 text-gray-900")}
                      />
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setShowEditPostModal(false)} className={btnCancel}>Cancel</button>
                        <button onClick={submitEditPost} className={btnPrimary} disabled={!editPostContent.trim()}>Save</button>
                      </div>
                    </div>
                  </div>
                )}
                {showDeleteEventModal && (
                  <div className={modalBackdrop}>
                    <div className={modalCard}>
                      <h3 className={modalTitle}>Delete event</h3>
                      <p className={"mt-2 text-sm " + (isDark ? "text-zinc-400" : "text-gray-600")}>Er du sikker på at du vil slette dette eventet?</p>
                      <div className="mt-4 flex justify-end gap-2">
                        <button onClick={() => setShowDeleteEventModal(false)} className={btnCancel}>Cancel</button>
                        <button onClick={confirmDeleteEvent} className={btnDanger}>Delete</button>
                      </div>
                    </div>
                  </div>
                )} 
          </main>
        </div>
      </div>
    </div>
  );
}
