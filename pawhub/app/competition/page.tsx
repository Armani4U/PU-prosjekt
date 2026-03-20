"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventRow = {
  id: string;
  creator_id: string;
  title: string;
  created_at: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: string;
  header_image_url?: string | null;
  description?: string | null;
};

type PublicProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  updated_at: string;
};

// shorthand used everywhere we don't need updated_at
type PublicProfilePartial = Pick<PublicProfile, "id" | "display_name" | "avatar_url">;

type DogRow = {
  id: string;
  name: string;
  breed: string | null;
  owner_id: string;
  photo_urls: string[] | null;
  is_public: boolean | null;
  updated_at: string | null;
  age_years: string | null;
  created_at: string;
  dob: string | null;
};

type Comment = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_profile: PublicProfilePartial | null;
};

type Entry = {
  id: string;
  event_id: string;
  dog_id: string;
  added_by: string | null;
  created_at: string;
  dog: DogRow;
  owner_profile: PublicProfilePartial | null;
  like_count: number;
  liked_by_me: boolean;
  comments: Comment[];
};

type RegisteredUser = {
  user_id: string;
  profile: PublicProfilePartial | null;
};

// these match what supabase actually returns before we map them
type RawEntryRow = {
  id: string;
  event_id: string;
  dog_id: string;
  added_by: string | null;
  created_at: string;
  dogs: DogRow | DogRow[] | null;
};

type RawSignupRow = {
  user_id: string;
  public_profiles: PublicProfilePartial | PublicProfilePartial[] | null;
};

type RawLikeRow = {
  dog_id: string;
  user_id: string;
};

type RawCommentRow = {
  id: string;
  dog_id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type RawProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type RawRoleRow = {
  role: string;
};

const HEART_EMPTY = "🤍";
const HEART_FILLED = "❤️";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

// falls back to "User" if the profile is missing or display_name is blank
function displayName(
  p: Pick<PublicProfile, "display_name"> | null | undefined,
  fallback = "User"
) {
  return p?.display_name?.trim() ? p.display_name : fallback;
}

// reads from localStorage/system pref after mount
function getPreferredTheme(): boolean {
  try {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  } catch {
    return false;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompetitionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const eventId = searchParams.get("id") ?? undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [me, setMe] = useState<{ id: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [event, setEvent] = useState<EventRow | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  // dogs owned by the logged in user, used to populate the "enter a dog" dropdown
  const [myDogs, setMyDogs] = useState<DogRow[]>([]);
  const [selectedDogId, setSelectedDogId] = useState("");
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [carouselIdx, setCarouselIdx] = useState<Record<string, number>>({});
  const [isDark, setIsDark] = useState(false);
  const [themeResolved, setThemeResolved] = useState(false);

  useEffect(() => {
    setIsDark(getPreferredTheme());
    setThemeResolved(true);
  }, []);

  useEffect(() => {
    if (!themeResolved) return;
    document.documentElement.classList.toggle("dark", isDark);
    try { localStorage.setItem("theme", isDark ? "dark" : "light"); } catch {}
  }, [isDark, themeResolved]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const isRegistered = useMemo(
    () => (me ? registeredUsers.some((u) => u.user_id === me.id) : false),
    [registeredUsers, me]
  );

  // tick every 30s so isActiveWindow stays fresh without a full reload
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { spotsTaken, spotsLeft, isFull, effectiveStatus, isActiveWindow } = useMemo(() => {
    const taken = registeredUsers.length;
    const cap = event?.capacity ?? 0;
    const s = event?.starts_at ? new Date(event.starts_at).getTime() : null;
    const e = event?.ends_at ? new Date(event.ends_at).getTime() : null;
    const afterEnd = e !== null && now > e;
    const beforeStart = s !== null && now < s;
    return {
      spotsTaken: taken,
      spotsLeft: Math.max(cap - taken, 0),
      isFull: cap > 0 && taken >= cap,
      effectiveStatus: afterEnd ? ("ended" as const) : beforeStart ? ("upcoming" as const) : ("active" as const),
      isActiveWindow: s !== null && e !== null && now >= s && now <= e,
    };
  }, [registeredUsers, event, now]);

  const leaderboard = useMemo(
    () => [...entries].sort((a, b) => b.like_count - a.like_count).slice(0, 10),
    [entries]
  );

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function loadEntries(pEventId: string, myUserId: string | null) {
    const { data: entryRows, error: entriesErr } = await supabase
      .from("event_entries")
      .select(
        "id, event_id, dog_id, added_by, created_at, dogs(id, name, breed, owner_id, photo_urls, is_public, updated_at, age_years, created_at, dob)"
      )
      .eq("event_id", pEventId)
      .order("created_at", { ascending: false });

    if (entriesErr) {
      console.warn(entriesErr);
      setEntries([]);
      return;
    }

    const baseEntries = ((entryRows ?? []) as RawEntryRow[])
      .map((r) => {
        const dog = Array.isArray(r.dogs) ? r.dogs[0] : r.dogs;
        if (!dog) return null;
        return {
          id: r.id,
          event_id: r.event_id,
          dog_id: r.dog_id,
          added_by: r.added_by ?? null,
          created_at: r.created_at,
          dog,
        };
      })
      .filter((e): e is {
        id: string;
        event_id: string;
        dog_id: string;
        added_by: string | null;
        created_at: string;
        dog: DogRow;
      } => e !== null);

    if (baseEntries.length === 0) {
      setEntries([]);
      return;
    }

    const dogOwnerIds = Array.from(new Set(baseEntries.map((e) => e.dog.owner_id)));
    const dogIds = baseEntries.map((e) => e.dog_id);

    // fetch owner profiles, likes and comments in parallel instead of 3 sequential round trips
    const [ownersRes, likesRes, commentsRes] = await Promise.all([
      supabase.from("public_profiles").select("id, display_name, avatar_url").in("id", dogOwnerIds),
      supabase.from("event_entry_likes").select("dog_id, user_id").eq("event_id", pEventId).in("dog_id", dogIds),
      supabase.from("event_entry_comments")
        .select("id, dog_id, user_id, content, created_at")
        .eq("event_id", pEventId)
        .in("dog_id", dogIds)
        .order("created_at", { ascending: false }),
    ]);

    const ownerProfilesById: Record<string, PublicProfilePartial> = {};
    (ownersRes.data as RawProfileRow[] ?? []).forEach((p) => {
      ownerProfilesById[p.id] = p;
    });

    const likesByDog: Record<string, { count: number; likedByMe: boolean }> = {};
    (likesRes.data as RawLikeRow[] ?? []).forEach((l) => {
      if (!likesByDog[l.dog_id]) likesByDog[l.dog_id] = { count: 0, likedByMe: false };
      likesByDog[l.dog_id].count += 1;
      if (myUserId && l.user_id === myUserId) likesByDog[l.dog_id].likedByMe = true;
    });

    // need a second profile lookup for comment authors — could be optimised later
    const commenterIds = Array.from(new Set((commentsRes.data as RawCommentRow[] ?? []).map((c) => c.user_id)));
    const commentersById: Record<string, PublicProfilePartial> = {};
    if (commenterIds.length > 0) {
      const { data: commenters } = await supabase
        .from("public_profiles").select("id, display_name, avatar_url").in("id", commenterIds);
      (commenters as RawProfileRow[] ?? []).forEach((p) => { commentersById[p.id] = p; });
    }

    const commentsByDog: Record<string, Comment[]> = {};
    (commentsRes.data as RawCommentRow[] ?? []).forEach((c) => {
      if (!commentsByDog[c.dog_id]) commentsByDog[c.dog_id] = [];
      commentsByDog[c.dog_id].push({
        id: c.id,
        user_id: c.user_id,
        content: c.content,
        created_at: c.created_at,
        user_profile: commentersById[c.user_id] ?? null,
      });
    });

    setEntries(baseEntries.map((e) => ({
      ...e,
      owner_profile: ownerProfilesById[e.dog.owner_id] ?? null,
      like_count: likesByDog[e.dog_id]?.count ?? 0,
      liked_by_me: likesByDog[e.dog_id]?.likedByMe ?? false,
      comments: commentsByDog[e.dog_id] ?? [],
    })));
  }

  // loads everything needed for the page — session, event, signups, dogs
  async function loadAll() {
    if (!eventId) {
      setError("Missing event id. Open this page as /competition?id=<event_uuid>.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // session + event can go in parallel
    const [userRes, eventRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("events")
        .select("id, creator_id, title, created_at, starts_at, ends_at, capacity, status, header_image_url, description")
        .eq("id", eventId).single(),
    ]);

    const user = userRes.data?.user ?? null;
    setMe(user ? { id: user.id } : null);

    if (eventRes.error) {
      setError(eventRes.error.message);
      setLoading(false);
      return;
    }
    const eventRow = eventRes.data as EventRow;
    setEvent(eventRow);

    const signupsPromise = supabase
      .from("event_signups")
      .select("user_id, public_profiles(id, display_name, avatar_url)")
      .eq("event_id", eventId);

    const profilePromise = user
      ? supabase.from("profiles").select("role").eq("id", user.id).single()
      : Promise.resolve(null);

    const dogsPromise = user
      ? supabase
          .from("dogs")
          .select("id, name, breed, owner_id, photo_urls, is_public, updated_at, age_years, created_at, dob")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false })
      : Promise.resolve(null);

    const [signupsRes, profileRes, dogsRes] = await Promise.all([
      signupsPromise,
      profilePromise,
      dogsPromise,
    ]);

    setRegisteredUsers((((signupsRes.data ?? []) as RawSignupRow[]).map((s) => ({
      user_id: s.user_id,
      profile: Array.isArray(s.public_profiles)
        ? (s.public_profiles[0] ?? null)
        : (s.public_profiles ?? null),
    }))));
    if (profileRes) setIsAdmin((profileRes.data as RawRoleRow | null)?.role === "admin");
    if (dogsRes) setMyDogs((dogsRes.data as DogRow[]) ?? []);

    // fire-and-forget status sync — we don't block on this
    try {
      const nowMs = Date.now();
      const s = new Date(eventRow.starts_at).getTime();
      const e = new Date(eventRow.ends_at).getTime();
      if ((nowMs < s || nowMs > e) && eventRow.status !== "inactive") {
        supabase.from("events").update({ status: "inactive" }).eq("id", eventId).then(() => {});
      }
    } catch {}

    await loadEntries(eventId, user?.id ?? null);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ──────────────────────────────────────────────────────────────

  async function joinEvent() {
    if (!eventId) return;
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) { setError("You must be logged in to join."); return; }
    if (effectiveStatus === "ended") { setError("This event has ended."); return; }
    const { error: rpcErr } = await supabase.rpc("join_event", { p_event_id: eventId });
    if (rpcErr) { setError(rpcErr.message); return; }
    await loadAll();
  }

  async function leaveEvent() {
    if (!eventId) return;
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) { setError("You must be logged in to leave."); return; }
    const { error: rpcErr } = await supabase.rpc("leave_event", { p_event_id: eventId });
    if (rpcErr) { setError(rpcErr.message); return; }
    await loadAll();
  }

  // admin only — also removes their dog entries first to avoid orphaned rows
  async function adminRemoveUser(userId: string) {
    if (!eventId || !isAdmin) { setError("Only admins can remove participants."); return; }
    const { data: dogs } = await supabase.from("dogs").select("id").eq("owner_id", userId);
    const dogIds = ((dogs as { id: string }[]) ?? []).map((d) => d.id);
    if (dogIds.length > 0) {
      await supabase.from("event_entries").delete().eq("event_id", eventId).in("dog_id", dogIds);
    }
    const { error } = await supabase.from("event_signups").delete().eq("event_id", eventId).eq("user_id", userId);
    if (error) { setError(error.message); return; }
    await loadAll();
  }

  async function addDogToEvent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!eventId) return;
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) { setError("You must be logged in to enter a dog."); return; }
    if (!isRegistered) { setError("You must join the event before adding a dog."); return; }
    if (!isActiveWindow) { setError("Dogs can only be entered while the event is active."); return; }
    if (!selectedDogId) { setError("Select a dog first."); return; }
    const { error: insErr } = await supabase.from("event_entries").insert({
      event_id: eventId, dog_id: selectedDogId, added_by: user.id,
    });
    if (insErr) { setError(insErr.message); return; }
    setSelectedDogId("");
    await loadEntries(eventId, user.id);
  }

  // removes a dog entry — owner can remove their own, admin can remove any
  async function removeEntry(entry: Entry) {
    setError(null);
    if (!eventId || !me) { setError("You must be logged in to remove an entry."); return; }
    const isOwner = entry.dog.owner_id === me.id;
    if (!isOwner && !isAdmin) { setError("You can only remove your own entries."); return; }
    const ok = typeof window !== "undefined" ? window.confirm(`Remove ${entry.dog.name} from this event?`) : true;
    if (!ok) return;
    const { error: delErr } = await supabase
      .from("event_entries")
      .delete()
      .eq("id", entry.id)
      .eq("event_id", eventId);
    if (delErr) { setError(delErr.message); return; }
    await loadEntries(eventId, me.id);
  }

  // optimistic update so the like button feels instant
  async function toggleLike(dogId: string, likedByMe: boolean) {
    setError(null);
    if (!eventId) return;
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) { setError("You must be logged in to like."); return; }
    if (!isRegistered) { setError("Join the event to like dogs."); return; }
    if (!isActiveWindow) { setError("Likes are only available while the event is active."); return; }

    const nextLiked = !likedByMe;
    setEntries((prev) => prev.map((e) =>
      e.dog_id !== dogId ? e : {
        ...e,
        liked_by_me: nextLiked,
        like_count: Math.max(0, e.like_count + (nextLiked ? 1 : -1)),
      }
    ));

    const op = nextLiked
      ? supabase.from("event_entry_likes").insert({ event_id: eventId, dog_id: dogId, user_id: user.id })
      : supabase.from("event_entry_likes").delete().eq("event_id", eventId).eq("dog_id", dogId).eq("user_id", user.id);

    const { error: opErr } = await op;
    if (opErr) {
      // roll back on failure
      setEntries((prev) => prev.map((e) =>
        e.dog_id !== dogId ? e : {
          ...e,
          liked_by_me: likedByMe,
          like_count: Math.max(0, e.like_count + (likedByMe ? 1 : -1)),
        }
      ));
      setError(opErr.message);
    }
  }

  async function postComment(dogId: string) {
    setError(null);
    if (!eventId) return;
    const text = (commentDraft[dogId] ?? "").trim();
    if (!text) return;
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) { setError("You must be logged in to comment."); return; }
    if (!isRegistered) { setError("Join the event to comment."); return; }
    if (!isActiveWindow) { setError("Comments are only available while the event is active."); return; }
    const { error: insErr } = await supabase.from("event_entry_comments").insert({
      event_id: eventId, dog_id: dogId, user_id: user.id, content: text,
    });
    if (insErr) { setError(insErr.message); return; }
    setCommentDraft((p) => ({ ...p, [dogId]: "" }));
    await loadEntries(eventId, user.id);
  }

  async function deleteComment(commentId: string, dogId: string, commentUserId: string) {
    setError(null);
    const isOwn = me?.id === commentUserId;
    if (!eventId || (!isAdmin && !isOwn)) { setError("You can only delete your own comments."); return; }
    const ok = typeof window !== "undefined" ? window.confirm("Delete this comment?") : true;
    if (!ok) return;
    const { error: delErr } = await supabase.from("event_entry_comments").delete()
      .eq("event_id", eventId).eq("dog_id", dogId).eq("id", commentId);
    if (delErr) { setError(delErr.message); return; }
    const { data: userRes } = await supabase.auth.getUser();
    await loadEntries(eventId, userRes?.user?.id ?? null);
  }
  async function editComment(commentId: string, dogId: string) {
      setError(null);
      if (!eventId || !me) { setError("You must be logged in."); return; }
      const text = (editDraft[commentId] ?? "").trim();
      if (!text) return;
      const { error: updErr } = await supabase
        .from("event_entry_comments")
        .update({ content: text })
        .eq("id", commentId)
        .eq("user_id", me.id); // row-level: can only update own comments
      if (updErr) { setError(updErr.message); return; }
      setEditingCommentId(null);
      setEditDraft((p) => { const n = { ...p }; delete n[commentId]; return n; });
      const { data: userRes } = await supabase.auth.getUser();
      await loadEntries(eventId, userRes?.user?.id ?? null);
    }
  async function uploadHeader(file: File) {
    if (!eventId || !event) return;
    setError(null);
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) { setError("You must be logged in."); return; }
    if (user.id !== event.creator_id) { setError("Only the event creator can change the header image."); return; }
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${eventId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("event-headers").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadErr) { setError(uploadErr.message); return; }
    const { data } = supabase.storage.from("event-headers").getPublicUrl(path);
    const publicUrl = data.publicUrl;
    // append cache-busting param so Next/Image picks up the new file right away
    const displayUrl = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
    const { error: updateErr } = await supabase.from("events")
      .update({ header_image_url: publicUrl }).eq("id", eventId).eq("creator_id", user.id);
    if (updateErr) { setError(updateErr.message); return; }
    setEvent((prev) => prev ? { ...prev, header_image_url: displayUrl } : prev);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={"min-h-screen " + (isDark ? "bg-zinc-900 text-zinc-100" : "bg-[#FFF7ED] text-gray-900")}>
        <div className="mx-auto max-w-5xl p-6">
          <p className={"text-sm " + (isDark ? "text-zinc-300" : "text-gray-600")}>Loading event…</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className={"min-h-screen " + (isDark ? "bg-zinc-900 text-zinc-100" : "bg-[#FFF7ED] text-gray-900")}>
        <div className="mx-auto max-w-5xl p-6">
          <p className={"text-sm " + (isDark ? "text-red-300" : "text-red-600")}>{error ?? "Event not found."}</p>
        </div>
      </div>
    );
  }

  const bgBase = isDark ? "bg-zinc-900 text-zinc-100" : "bg-[#FFF7ED] text-gray-900";
  const cardCls = "rounded-2xl border p-4 sm:p-5 backdrop-blur " + (isDark ? "border-zinc-800 bg-zinc-950/60" : "border-amber-200 bg-white/85");

  return (
    <div className={"min-h-screen " + bgBase}>

      {/* ── Hero / header image ── */}
      <div className="relative h-56 w-full sm:h-72 md:h-96">
        <Link href="/" className="fixed left-4 z-20 flex items-center gap-2 group">
          <img
            src="/pawhub-logo-trans.png"
            alt="PawHub logo"
            width={175}
            height={175}
            className="transition-transform duration-200 group-hover:scale-105"
          />
        </Link>

        <button
          type="button"
          onClick={() => setIsDark((p) => !p)}
          className={"fixed right-4 top-4 z-20 inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold shadow-sm transition "
            + (isDark ? "bg-zinc-950/80 text-zinc-100 hover:bg-zinc-900" : "bg-white/90 text-gray-900 hover:bg-white")}
          aria-label="Toggle dark mode"
        >
          {isDark ? "☀️" : "🌙"}
        </button>

        {event.header_image_url ? (
          <Image src={event.header_image_url} alt={event.title} fill className="object-cover" priority sizes="100vw" />
        ) : (
          <div className={"h-full w-full " + (isDark ? "bg-zinc-800" : "bg-gray-200")} />
        )}
        <div className="absolute inset-0 bg-black/35" />

        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 md:p-10">
          <div className="mx-auto max-w-5xl">
            <h1 className="text-2xl font-semibold text-white sm:text-3xl md:text-4xl">{event.title}</h1>
            {/* only show upload button to the creator */}
            {me?.id === event.creator_id && (
              <div className="mt-3">
                <label className={"inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition "
                  + (isDark ? "bg-zinc-950/70 text-zinc-100 hover:bg-zinc-900" : "bg-white/90 text-gray-900 hover:bg-white")}>
                  Change header image
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadHeader(file); }} />
                </label>
              </div>
            )}
            {event.description && (
              <p className="mt-2 max-w-2xl text-sm text-white/90">{event.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="mx-auto max-w-5xl p-4 sm:p-6">

        {error && (
          <div className={"mb-4 rounded-2xl border p-4 text-sm "
            + (isDark ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-700")}>
            {error}
          </div>
        )}

        {!me && (
          <div className={"mb-4 rounded-2xl border p-4 text-sm "
            + (isDark ? "border-zinc-800 bg-zinc-950/50 text-zinc-200" : "border-amber-200 bg-white/80 text-gray-700")}>
            You are viewing this event as a guest.{" "}
            <a href="/login" className={"font-medium underline " + (isDark ? "text-white" : "text-gray-900")}>Log in</a>
            {" "}to join the fun and interact with the event!
          </div>
        )}

        {/* info + enter-dog side by side on md+ */}
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">

          {/* Event info card */}
          <div className={cardCls}>
            <h2 className={"text-lg font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>Event info</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className={"text-xs font-medium " + (isDark ? "text-zinc-400" : "text-gray-500")}>Starts</dt>
                <dd className={"text-sm " + (isDark ? "text-zinc-100" : "text-gray-900")}>{formatDateTime(event.starts_at)}</dd>
              </div>
              <div>
                <dt className={"text-xs font-medium " + (isDark ? "text-zinc-400" : "text-gray-500")}>Ends</dt>
                <dd className={"text-sm " + (isDark ? "text-zinc-100" : "text-gray-900")}>{formatDateTime(event.ends_at)}</dd>
              </div>
              <div>
                <dt className={"text-xs font-medium " + (isDark ? "text-zinc-400" : "text-gray-500")}>Capacity</dt>
                <dd className={"text-sm " + (isDark ? "text-zinc-100" : "text-gray-900")}>
                  {spotsTaken}/{event.capacity} ({spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left)
                </dd>
              </div>
              <div>
                <dt className={"text-xs font-medium " + (isDark ? "text-zinc-400" : "text-gray-500")}>Status</dt>
                <dd className={"text-sm " + (isDark ? "text-zinc-100" : "text-gray-900")}>
                  {effectiveStatus === "active" ? "active" : "inactive"}
                  <span className={"ml-2 text-xs " + (isDark ? "text-zinc-400" : "text-gray-500")}>
                    ({effectiveStatus === "upcoming" ? "upcoming" : effectiveStatus === "ended" ? "ended" : "in progress"})
                  </span>
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!isRegistered ? (
                <button
                  onClick={joinEvent}
                  disabled={isFull || effectiveStatus === "ended"}
                  className={"rounded-xl px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 transition "
                    + (isDark ? "bg-zinc-800 hover:bg-zinc-700" : "bg-amber-600 hover:bg-amber-700")}
                >
                  Join event
                </button>
              ) : (
                <button
                  onClick={leaveEvent}
                  className={"rounded-xl border px-4 py-2 text-sm font-medium transition "
                    + (isDark ? "border-zinc-700 text-zinc-100 hover:bg-zinc-800" : "border-amber-200 text-gray-900 hover:bg-amber-50")}
                >
                  Leave event
                </button>
              )}
              <div className={"text-sm " + (isDark ? "text-zinc-300" : "text-gray-600")}>
                {!me
                  ? "Log in to join."
                  : effectiveStatus === "ended"
                    ? "This event has ended."
                    : isRegistered
                      ? "You are registered."
                      : "You are not registered."}
              </div>
            </div>

            {/* participant list */}
            <div className="mt-5">
              <h3 className={"text-sm font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>Registered users</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {registeredUsers.map((u) => (
                  <div
                    key={u.user_id}
                    className={`relative flex items-center rounded-full px-3 py-1 text-xs font-medium ${u.user_id === me?.id
                      ? isDark ? "bg-zinc-800 text-white" : "bg-amber-600 text-white"
                      : isDark ? "bg-zinc-800/60 text-zinc-100" : "bg-amber-50 text-gray-800"
                    }`}
                  >
                    <span>{displayName(u.profile, "User")}</span>
                    {isAdmin && u.user_id !== me?.id && (
                      <button
                        type="button"
                        onClick={() => adminRemoveUser(u.user_id)}
                        className={"ml-2 text-xs font-bold " + (isDark ? "text-red-300 hover:text-red-200" : "text-red-600 hover:text-red-800")}
                        aria-label="Remove user"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Enter a dog card */}
          <div className={cardCls}>
            <h2 className={"text-lg font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>Enter a dog</h2>
            <p className={"mt-1 text-sm " + (isDark ? "text-zinc-300" : "text-gray-600")}>
              You can only enter dogs after you've joined, and only while the event is active.
            </p>
            <form onSubmit={addDogToEvent} className="mt-4 grid gap-3">
              <select
                value={selectedDogId}
                onChange={(e) => setSelectedDogId(e.target.value)}
                disabled={!isRegistered || !me || !isActiveWindow}
                className={"w-full rounded-xl border px-3 py-2 text-sm "
                  + (isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-amber-200 bg-white text-gray-900")}
              >
                <option value="">Select one of your dogs…</option>
                {myDogs.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.breed ? ` (${d.breed})` : ""}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!isRegistered || !me || !isActiveWindow}
                className={"rounded-xl px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 transition "
                  + (isDark ? "bg-zinc-800 hover:bg-zinc-700" : "bg-amber-600 hover:bg-amber-700")}
              >
                Add dog to event
              </button>
              {!me ? (
                <p className={"text-xs " + (isDark ? "text-zinc-400" : "text-gray-500")}>Log in to enter a dog.</p>
              ) : myDogs.length === 0 ? (
                <p className={"text-xs " + (isDark ? "text-zinc-400" : "text-gray-500")}>
                  You don&apos;t have any dogs yet. Create one on your profile first.
                </p>
              ) : null}
            </form>
          </div>
        </div>

        {/* ── Leaderboard ── */}
        <div className={"mt-6 " + cardCls}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className={"text-lg font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>Leaderboard</h2>
            <p className={"text-sm " + (isDark ? "text-zinc-300" : "text-gray-700")}>Top dogs by likes</p>
          </div>
          {entries.length === 0 ? (
            <p className={"mt-3 text-sm " + (isDark ? "text-zinc-300" : "text-gray-600")}>No entries yet.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {leaderboard.map((e, idx) => (
                <li key={e.id} className={"flex items-center justify-between rounded-xl px-3 py-2 " + (isDark ? "bg-zinc-900/60" : "bg-amber-50")}>
                  <div className="min-w-0">
                    <p className={"truncate text-sm font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>
                      {idx + 1}. {e.dog.name}
                    </p>
                    <p className={"truncate text-xs " + (isDark ? "text-zinc-400" : "text-gray-500")}>
                      Owner:{" "}
                      <Link href={`/profile/${e.owner_profile?.id ?? ""}`} className={"underline " + (isDark ? "text-zinc-100" : "text-gray-900")}>
                        {displayName(e.owner_profile, "User")}
                      </Link>
                    </p>
                  </div>
                  <div className={"text-sm font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>{e.like_count}</div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── Dog entry cards ── */}
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className={"text-lg font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>Dogs in this event</h2>
            <p className={"text-sm " + (isDark ? "text-zinc-300" : "text-gray-600")}>{entries.length} total</p>
          </div>

          {entries.length === 0 ? (
            <div className={"mt-3 rounded-2xl border border-dashed p-6 text-sm "
              + (isDark ? "border-zinc-700 text-zinc-300" : "border-amber-200 text-gray-700")}>
              No dogs have been entered yet.
            </div>
          ) : (
            // 3-column grid, collapses to 1 on mobile via the parent padding
            <div className="mt-3 grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {entries.map((entry) => {
                const urls = entry.dog.photo_urls ?? [];
                const currentIdx = carouselIdx[entry.id] ?? 0;
                const goTo = (i: number) =>
                  setCarouselIdx((p) => ({ ...p, [entry.id]: (i + urls.length) % urls.length }));

                const canRemove = me && (entry.dog.owner_id === me.id || isAdmin);

                return (
                  <div
                    key={entry.id}
                    className={"overflow-hidden rounded-2xl border backdrop-blur "
                      + (isDark ? "border-zinc-800 bg-zinc-950/60" : "border-amber-200 bg-white/85")}
                  >
                    {/* photo + remove button share a relative container */}
                    <div className="relative">
                      {urls.length > 0 ? (
                        <div className={"relative aspect-[4/3] w-full overflow-hidden " + (isDark ? "bg-zinc-900" : "bg-amber-50")}>
                          <Image
                            src={urls[currentIdx]}
                            alt={`${entry.dog.name} photo ${currentIdx + 1}`}
                            fill
                            className="object-cover transition-opacity duration-300"
                            sizes="(max-width: 640px) 100vw, 33vw"
                          />
                          {urls.length > 1 && (
                            <>
                              <button type="button" onClick={() => goTo(currentIdx - 1)}
                                className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/50"
                                aria-label="Previous photo">‹</button>
                              <button type="button" onClick={() => goTo(currentIdx + 1)}
                                className="absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/50"
                                aria-label="Next photo">›</button>
                              <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                                {urls.map((_, i) => (
                                  <button key={i} type="button" onClick={() => goTo(i)}
                                    className={`h-1.5 rounded-full transition-all ${i === currentIdx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
                                    aria-label={`Go to photo ${i + 1}`} />
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className={"flex h-44 items-center justify-center text-sm "
                          + (isDark ? "bg-zinc-900 text-zinc-400" : "bg-amber-50 text-gray-500")}>
                          No photo
                        </div>
                      )}

                      {/* remove button — floats top-right over the image */}
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => removeEntry(entry)}
                          aria-label={`Remove ${entry.dog.name} from event`}
                          style={{
                            position: "absolute",
                            top: "10px",
                            right: "10px",
                            zIndex: 20,
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            border: "2px solid rgba(255,255,255,0.7)",
                            background: "rgba(0,0,0,0.15)",
                            backdropFilter: "blur(4px)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            transition: "transform 0.15s ease, background 0.15s ease, border-color 0.15s ease",
                            color: "rgba(255,255,255,0.85)",
                          }}
                          onMouseEnter={(e) => {
                            const btn = e.currentTarget;
                            btn.style.transform = "scale(1.2)";
                            btn.style.background = "rgba(220,38,38,0.85)";
                            btn.style.borderColor = "rgba(220,38,38,0.9)";
                            btn.style.color = "white";
                          }}
                          onMouseLeave={(e) => {
                            const btn = e.currentTarget;
                            btn.style.transform = "scale(1)";
                            btn.style.background = "rgba(0,0,0,0.15)";
                            btn.style.borderColor = "rgba(255,255,255,0.7)";
                            btn.style.color = "rgba(255,255,255,0.85)";
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="2" y1="2" x2="12" y2="12" />
                            <line x1="12" y1="2" x2="2" y2="12" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className={"text-base font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>{entry.dog.name}</h3>
                          <p className={"text-xs " + (isDark ? "text-zinc-400" : "text-gray-500")}>
                            Owner:{" "}
                            <Link href={`/profile/${entry.owner_profile?.id ?? ""}`} className="underline">
                              {displayName(entry.owner_profile, "User")}
                            </Link>
                          </p>
                        </div>
                        <button
                          onClick={() => toggleLike(entry.dog_id, entry.liked_by_me)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold shadow-sm ring-1 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 ${isDark
                            ? "bg-zinc-800 text-zinc-100 ring-zinc-500"
                            : "bg-amber-100 text-gray-900 ring-amber-300"
                          }`}
                          aria-label={entry.liked_by_me ? "Unlike" : "Like"}
                          disabled={!me || !isActiveWindow}
                          title={!me ? "Log in to like" : ""}
                        >
                          <span className="text-base leading-none">{entry.liked_by_me ? HEART_FILLED : HEART_EMPTY}</span>
                          <span>{entry.like_count}</span>
                        </button>
                      </div>

                      <div className={"mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs " + (isDark ? "text-zinc-300" : "text-gray-600")}>
                        {entry.dog.breed && <span>Breed: {entry.dog.breed}</span>}
                        {entry.dog.dob && <span>DOB: {formatDateTime(entry.dog.dob)}</span>}
                      </div>

                      {/* comments section */}
                      <div className="mt-4">
                        <div className="flex items-baseline justify-between">
                          <p className={"text-sm font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>Comments</p>
                          <p className={"text-xs " + (isDark ? "text-zinc-400" : "text-gray-500")}>{entry.comments.length}</p>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <input
                            value={commentDraft[entry.dog_id] ?? ""}
                            onChange={(e) => setCommentDraft((p) => ({ ...p, [entry.dog_id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && postComment(entry.dog_id)}
                            placeholder="Write a comment…"
                            className={"flex-1 rounded-xl border px-3 py-2 text-sm "
                              + (isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500" : "border-amber-200 bg-white text-gray-900 placeholder:text-gray-400")}
                            disabled={!me || !isActiveWindow}
                          />
                          <button
                            type="button"
                            onClick={() => postComment(entry.dog_id)}
                            className={"rounded-xl px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 transition "
                              + (isDark ? "bg-zinc-800 hover:bg-zinc-700" : "bg-amber-600 hover:bg-amber-700")}
                            disabled={!me || !isActiveWindow}
                          >
                            Post
                          </button>
                        </div>
                        <div className="mt-3 max-h-48 space-y-3 overflow-y-auto pr-1">
                          {entry.comments.slice(0, 5).map((c) => (
                            <div key={c.id} className={"rounded-lg p-2 " + (isDark ? "bg-zinc-900/60" : "bg-amber-50")}>
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex min-w-0 items-baseline gap-1.5">
                                  <p className={"truncate text-[11px] font-semibold " + (isDark ? "text-zinc-100" : "text-gray-900")}>
                                    <Link href={`/profile/${c.user_profile?.id ?? ""}`} className="underline">
                                      {displayName(c.user_profile, "User")}
                                    </Link>
                                  </p>
                                  <p className={"shrink-0 text-[10px] " + (isDark ? "text-zinc-500" : "text-gray-400")}>
                                    {formatDateTime(c.created_at)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  {/* edit button — only own comments */}
                                  {me?.id === c.user_id && editingCommentId !== c.id && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCommentId(c.id);
                                        setEditDraft((p) => ({ ...p, [c.id]: c.content }));
                                      }}
                                      className={"rounded px-1.5 py-0.5 text-[10px] font-semibold "
                                        + (isDark ? "text-zinc-400 hover:text-zinc-200" : "text-gray-400 hover:text-gray-700")}
                                      aria-label="Edit comment"
                                    >
                                      Edit
                                    </button>
                                  )}
                                  {(isAdmin || me?.id === c.user_id) && (
                                    <button
                                      type="button"
                                      onClick={() => deleteComment(c.id, entry.dog_id, c.user_id)}
                                      className={"rounded px-1.5 py-0.5 text-[10px] font-semibold "
                                        + (isDark ? "text-red-300 hover:text-red-200" : "text-red-600 hover:text-red-800")}
                                      aria-label="Delete comment"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* inline edit form or comment text */}
                              {editingCommentId === c.id ? (
                                <div className="mt-1 flex gap-1.5">
                                  <input
                                    value={editDraft[c.id] ?? ""}
                                    onChange={(e) => setEditDraft((p) => ({ ...p, [c.id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") void editComment(c.id, entry.dog_id);
                                      if (e.key === "Escape") setEditingCommentId(null);
                                    }}
                                    autoFocus
                                    className={"flex-1 rounded-lg border px-2 py-1 text-[11px] "
                                      + (isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-amber-200 bg-white text-gray-900")}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void editComment(c.id, entry.dog_id)}
                                    className={"rounded px-2 py-1 text-[10px] font-semibold text-white transition "
                                      + (isDark ? "bg-zinc-700 hover:bg-zinc-600" : "bg-amber-600 hover:bg-amber-700")}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingCommentId(null)}
                                    className={"rounded px-2 py-1 text-[10px] font-semibold transition "
                                      + (isDark ? "text-zinc-400 hover:text-zinc-200" : "text-gray-500 hover:text-gray-700")}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <p className={"mt-0.5 text-[11px] leading-snug " + (isDark ? "text-zinc-100" : "text-gray-800")}>
                                  {c.content}
                                </p>
                              )}
                            </div>
                          ))}
                          {entry.comments.length > 5 && (
                            <p className={"text-xs " + (isDark ? "text-zinc-400" : "text-gray-500")}>
                              Showing latest 5 comments.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}