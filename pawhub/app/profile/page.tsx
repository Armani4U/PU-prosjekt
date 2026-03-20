'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

type Profile = {
  id: string;
  display_name: string | null;
  role: string | null;
  avatar_url: string | null;
  updated_at: string | null;
  deleted_at?: string | null;
  is_public?: boolean | null;
};

type Dog = {
  id: string;
  owner_id: string;
  name: string;
  breed: string | null;
  dob: string | null;
  age_years: number | null;
  photo_urls: string[] | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

function isValidDob(dob: string) {
  if (dob.trim() === '') return true;
  // Expect YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const dt = new Date(dob + 'T00:00:00Z');
  if (Number.isNaN(dt.getTime())) return false;
  // Reject impossible dates like 2026-02-31 by roundtrip check
  const [y, m, d] = dob.split('-').map((x) => Number(x));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return false;
  // Must not be in the future
  const now = new Date();
  if (dt.getTime() > now.getTime()) return false;
  return true;
}

function dogToAgeYears(dob: string): number | null {
  if (dob.trim() === '') return null;
  const dt = new Date(dob + 'T00:00:00Z');
  if (Number.isNaN(dt.getTime())) return null;
  const now = new Date();
  // Compute full years
  let years = now.getUTCFullYear() - dt.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const nowDay = now.getUTCDate();
  const dobMonth = dt.getUTCMonth() + 1;
  const dobDay = dt.getUTCDate();
  if (nowMonth < dobMonth || (nowMonth === dobMonth && nowDay < dobDay)) years -= 1;
  // Clamp to a reasonable range
  if (years < 0) years = 0;
  if (years > 100) years = 100;
  return years;
}

function getStorageObjectPath(bucket: string, publicUrl: string | null | undefined) {
  if (!publicUrl) return null;

  try {
    const url = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex !== -1) {
      const path = url.pathname.slice(markerIndex + marker.length);
      return path ? decodeURIComponent(path) : null;
    }

    const fallbackParts = url.pathname.split(`/${bucket}/`);
    if (fallbackParts.length >= 2) {
      const path = fallbackParts.slice(1).join(`/${bucket}/`);
      return path ? decodeURIComponent(path) : null;
    }
  } catch {
    return null;
  }

  return null;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isPublic, setIsPublic] = useState<boolean>(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');

  const [dogs, setDogs] = useState<Dog[]>([]);
  const [dogDraft, setDogDraft] = useState({
    id: '' as string | '',
    name: '',
    breed: '',
    dob: '',
    is_public: false,
  });
  const [dogFiles, setDogFiles] = useState<File[]>([]);
  const [dogSaving, setDogSaving] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isDark, setIsDark] = useState(false);

  const applyThemeClass = (dark: boolean) => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", dark);
  };

  useEffect(() => {
    // Initial theme: localStorage override, otherwise system preference.
    try {
      const saved = localStorage.getItem("theme");
      const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      const nextDark = saved ? saved === "dark" : systemDark;
      setIsDark(nextDark);
      applyThemeClass(nextDark);
      try {
        localStorage.setItem("theme", nextDark ? "dark" : "light");
      } catch {
        // ignore
      }
    } catch {
      // ignore
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
        // ignore
      }
      return next;
    });
  };

  async function refresh() {
    setError(null);
    setMessage(null);

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    setAuthEmail(auth.user?.email ?? null);

    if (!uid) {
      setProfile(null);
      setDogs([]);
      setLoading(false);
      return;
    }

    const { data: p, error: pErr } = await supabase
      .from('profiles')
      .select('id, display_name, role, avatar_url, updated_at, deleted_at, is_public')
      .eq('id', uid)
      .single();

    if (p) setIsPublic(!!(p as any).is_public);

    if (pErr) {
      await supabase.auth.signOut();
      window.location.href = '/';
      return;
    }

    setProfile(p as Profile);
    setDisplayName((p?.display_name ?? '') as string);

    const { data: d, error: dErr } = await supabase
      .from('dogs')
      .select('*')
      .eq('owner_id', uid)
      .order('created_at', { ascending: false });

    if (dErr) {
      // If RLS is correct, this will only ever return your dogs.
      setError(dErr.message);
      setLoading(false);
      return;
    }

    setDogs((d ?? []) as Dog[]);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile() {
    if (!userId) return;
    setError(null);
    setMessage(null);

    const { error: upErr } = await supabase
      .from('profiles')
      .update({ display_name: displayName, is_public: isPublic })
      .eq('id', userId);

    if (upErr) return setError(upErr.message);

    // Keep public view in sync (used on the main page for posts/events)
    const { error: pubErr } = await supabase
      .from('profiles')
      .update({ display_name: displayName, is_public: isPublic })
      .eq('id', userId);

    if (pubErr) return setError(pubErr.message);

    setMessage('Profile updated.');
    await refresh();
  }

  async function uploadAvatar() {
    if (!userId || !avatarFile) return;

    setError(null);
    setMessage(null);
    setAvatarUploading(true);

    try {
      const ext = avatarFile.name.split('.').pop() || 'png';
      const path = `${userId}/avatar-${Date.now()}.${ext}`;

      // 🔹 1. Upload ny fil
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, avatarFile, {
          upsert: false,
          contentType: avatarFile.type,
        });

      if (uploadError) throw uploadError;

      // 🔹 2. Hent public URL
      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      const newPublicUrl = data.publicUrl;

      // 🔹 3. Hent gammel avatar path (hvis finnes)
      const oldPath = getStorageObjectPath('avatars', profile?.avatar_url);

      // 🔹 4. Oppdater profil med ny URL (private)
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: newPublicUrl })
        .eq('id', userId);

      if (profileError) throw profileError;

      // 🔹 4b. Oppdater public profile (used across the app)
      const { error: pubProfileError } = await supabase
        .from('profiles')
        .update({ avatar_url: newPublicUrl })
        .eq('id', userId);

      if (pubProfileError) throw pubProfileError;

      // 🔹 5. Slett gammel fil (hvis den finnes og ikke er samme som ny)
      if (oldPath && oldPath !== path) {
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      setMessage('Avatar updated.');
      setAvatarFile(null);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to upload avatar.');
    } finally {
      setAvatarUploading(false);
    }
  }


  async function changePassword() {
    setError(null);
    setMessage(null);

    if (!newPassword || newPassword.length < 8) {
      return setError('Password must be at least 8 characters.');
    }
    if (newPassword !== newPassword2) {
      return setError('Passwords do not match.');
    }

    const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword });
    if (pwErr) return setError(pwErr.message);

    setMessage('Password changed.');
    setNewPassword('');
    setNewPassword2('');
  }

  async function deleteAccount() {
    if (!userId) return;

    const ok = confirm(
      "This will mark your account as deleted and remove your active entries/likes/comments. Continue?"
    );
    if (!ok) return;

    setError(null);
    setMessage(null);

    try {
      // 🔹 1. Soft-delete profile
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", userId);
      if (profErr) throw profErr;

      // 🔹 2. Remove active user relations
      const tablesToDelete = [
        "event_signups",
        "event_entry_likes",
        "event_entry_comments",
        "post_likes",
        "posts",
      ];

      for (const table of tablesToDelete) {
        const { error: delErr } = await supabase
          .from(table)
          .delete()
          .eq("user_id", userId);
        if (delErr) throw delErr;
      }
      
      // 🔹 3. Remove user's event_entries
      const { error: entryErr } = await supabase
        .from("event_entries")
        .delete()
        .eq("added_by", userId);
      if (entryErr) throw entryErr;

      setMessage("Your account has been deleted.");
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete account.");
    }
  }

  function resetDogDraft() {
    setDogDraft({ id: '', name: '', breed: '', dob: '', is_public: false });
    setDogFiles([]);
  }

  async function startEditDog(d: Dog) {
    setDogDraft({
      id: d.id,
      name: d.name,
      breed: d.breed ?? '',
      dob: d.dob ?? '',
      is_public: !!d.is_public,
    });
    setDogFiles([]);
    setMessage(null);
    setError(null);
  }

  async function saveDog() {
    if (!userId) return;

    setError(null);
    setMessage(null);

    if (!dogDraft.name.trim()) return setError('Dog name is required.');
    if (!isValidDob(dogDraft.dob)) return setError('Date of birth must be in YYYY-MM-DD format and not in the future.');

    // Require DOB when creating a new dog
    if (!dogDraft.id && dogDraft.dob.trim() === '') {
      return setError('Please provide date of birth (YYYY-MM-DD) when adding a new dog.');
    }

    // Require at least 1 photo when creating a new dog
    if (!dogDraft.id && dogFiles.length === 0) {
      return setError('Please upload at least 1 photo when adding a new dog.');
    }

    // Enforce max 3 photos total (existing + new)
    const existingPhotos = dogDraft.id ? (dogs.find((d) => d.id === dogDraft.id)?.photo_urls ?? []) : [];
    if (existingPhotos.length + dogFiles.length > 3) {
      return setError(
        `This dog already has ${existingPhotos.length} photo(s). You can add at most ${3 - existingPhotos.length} more.`
      );
    }

    setDogSaving(true);

    try {
      // Determine a stable dog id (so storage paths match the row id)
      const dogId = dogDraft.id || crypto.randomUUID();

      // 1) Upload new photos (optional when editing; required when creating)
      const newPhotoUrls: string[] = [];
      if (dogFiles.length > 0) {
        for (let i = 0; i < dogFiles.length; i++) {
          const f = dogFiles[i];
          const ext = f.name.split('.').pop() || 'jpg';
          const path = `${userId}/${dogId}/${Date.now()}-${i}.${ext}`;

          const { error: upErr } = await supabase.storage
            .from('dogs')
            .upload(path, f, { upsert: false, contentType: f.type });

          if (upErr) throw upErr;

          const { data } = supabase.storage.from('dogs').getPublicUrl(path);
          newPhotoUrls.push(data.publicUrl);
        }
      }

      const payload: any = {
        name: dogDraft.name.trim(),
        breed: dogDraft.breed.trim() || null,
        // Store DOB in DB (DATE column). We compute age for display in the UI.
        dob: dogDraft.dob.trim() === '' ? null : dogDraft.dob.trim(),
        is_public: !!dogDraft.is_public,
      };

      // Merge existing + newly uploaded photos (max 3)
      const existing = existingPhotos;
      const merged = [...existing, ...newPhotoUrls].slice(0, 3);

      // On create: always set photo_urls (we require at least 1)
      // On edit: only update photo_urls if new photos were uploaded
      if (!dogDraft.id) {
        payload.photo_urls = merged;
      } else if (newPhotoUrls.length > 0) {
        payload.photo_urls = merged;
      }

      if (dogDraft.id) {
        // UPDATE
        const { error: uErr } = await supabase.from('dogs').update(payload).eq('id', dogDraft.id);
        if (uErr) throw uErr;
        setMessage('Dog updated.');
      } else {
        // INSERT
        // owner_id is set server-side via DEFAULT auth.uid()
        payload.id = dogId;
        const { error: iErr } = await supabase.from('dogs').insert(payload);
        if (iErr) throw iErr;
        setMessage('Dog added.');
      }

      resetDogDraft();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save dog.');
    } finally {
      setDogSaving(false);
    }
  }

  async function removeDog(dogId: string) {
    setError(null);
    setMessage(null);

    const ok = confirm('Remove this dog?');
    if (!ok) return;

    const dog = dogs.find((x) => x.id === dogId);
    const photoPaths = (dog?.photo_urls ?? []).flatMap((photoUrl) => {
      const path = getStorageObjectPath('dogs', photoUrl);
      return path ? [path] : [];
    });
    const unresolvedPhotoCount = (dog?.photo_urls ?? []).length - photoPaths.length;

    const { error: delErr } = await supabase.from('dogs').delete().eq('id', dogId);
    if (delErr) return setError(delErr.message);

    let storageWarning: string | null = null;

    if (photoPaths.length > 0) {
      const { error: storageErr } = await supabase.storage.from('dogs').remove(photoPaths);
      if (storageErr) {
        storageWarning = `Dog removed, but failed to delete its photo files from storage: ${storageErr.message}`;
      }
    }

    if (!storageWarning && unresolvedPhotoCount > 0) {
      storageWarning = 'Dog removed, but one or more photo files could not be resolved for storage deletion.';
    }

    await refresh();

    if (storageWarning) {
      setError(storageWarning);
      return;
    }

    setMessage('Dog removed.');
  }

  async function removeDogPhoto(dogId: string, url: string) {
    setError(null);
    setMessage(null);

    const d = dogs.find((x) => x.id === dogId);
    if (!d) return;

    const next = (d.photo_urls ?? []).filter((u) => u !== url);
    if (next.length === 0) {
      return setError('A dog must have at least 1 photo. Add a new photo before removing the last one.');
    }

    const { error: upErr } = await supabase.from('dogs').update({ photo_urls: next }).eq('id', dogId);
    if (upErr) return setError(upErr.message);

    let storageWarning: string | null = null;
    const photoPath = getStorageObjectPath('dogs', url);

    if (photoPath) {
      const { error: storageErr } = await supabase.storage.from('dogs').remove([photoPath]);
      if (storageErr) {
        storageWarning = `Photo removed from profile, but failed to delete the file from storage: ${storageErr.message}`;
      }
    } else {
      storageWarning = 'Photo removed from profile, but the file path could not be resolved for storage deletion.';
    }

    await refresh();

    if (storageWarning) {
      setError(storageWarning);
      return;
    }

    setMessage('Photo removed.');
  }

  if (loading) {
    return (
      <main
        className={
          "min-h-screen flex items-center justify-center " +
          (isDark ? "bg-zinc-900 text-zinc-100" : "bg-[#FFF7ED] text-gray-900")
        }
      >
        <div
          className={
            "w-full max-w-lg rounded-lg shadow-md p-6 border " +
            (isDark ? "bg-zinc-950/80 border-zinc-800" : "bg-white border-amber-200")
          }
        >
          Loading…
        </div>
      </main>
    );
  }

  if (!userId) {
    return (
      <main
        className={
          "min-h-screen flex items-center justify-center " +
          (isDark ? "bg-zinc-900 text-zinc-100" : "bg-[#FFF7ED] text-gray-900")
        }
      >
        <div
          className={
            "w-full max-w-lg rounded-lg shadow-md p-6 space-y-2 border " +
            (isDark ? "bg-zinc-950/80 border-zinc-800" : "bg-white border-amber-200")
          }
        >
          <h1 className={"text-2xl font-semibold " + (isDark ? "text-zinc-100" : "text-gray-700")}>Profile</h1>
          <p className={isDark ? "text-zinc-300" : "text-gray-600"}>
            You need to be logged in to view your profile.
          </p>
        </div>
      </main>
    );
  }

  return (


    <main className={"min-h-screen " + (isDark ? "bg-zinc-900 text-zinc-100" : "bg-[#FFF7ED] text-gray-900")}>
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

            <button
              type="button"
              onClick={toggleTheme}
              className={
                "w-full rounded-xl px-3 py-2 text-sm font-semibold border transition " +
                (isDark
                  ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                  : "border-amber-200 bg-white/80 text-gray-900 hover:bg-amber-50")
              }
              aria-label="Toggle dark mode"
              title="Toggle dark mode"
            >
              {isDark ? "☀️ Light mode" : "🌙 Dark mode"}
            </button>
          </aside>        

 
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <div
          className={
            "rounded-lg shadow-md p-6 border backdrop-blur " +
            (isDark ? "bg-zinc-950/70 border-zinc-800" : "bg-white/90 border-amber-200")
          }
        >
          <div className="flex items-start justify-between gap-6 flex-col md:flex-row">
            <div className="space-y-2">
              <h1 className={"text-2xl font-semibold " + (isDark ? "text-zinc-100" : "text-gray-700")}>Your Profile</h1>
              <p className={"text-sm " + (isDark ? "text-zinc-300" : "text-gray-600")}>This page is private and only visible to you.</p>
              {authEmail ? (
                <p className="text-sm text-gray-600">
                  Email: <span className="font-medium">{authEmail}</span>
                </p>
              ) : null}
              {profile?.role ? (
                <p className="text-sm text-gray-600">
                  Role: <span className="font-medium">{profile.role}</span>
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-4">
              <div className="h-30 w-30 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                {profile?.avatar_url ? (
                  <Image src={profile.avatar_url} alt="Avatar" width={120} height={120} unoptimized />
                ) : (
                  <span className="text-gray-500 text-sm">No avatar</span>
                )}
              </div>
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                  className="block text-sm text-blue-600"
                />
                <button
                  onClick={uploadAvatar}
                  disabled={!avatarFile || avatarUploading}
                  className={
                    "px-3 py-2 rounded text-white text-sm disabled:opacity-50 " +
                    (isDark ? "bg-zinc-800 hover:bg-zinc-700" : "bg-amber-600 hover:bg-amber-700")
                  }
                >
                  {avatarUploading ? 'Uploading…' : 'Update avatar'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h2 className={"text-lg font-semibold " + (isDark ? "text-zinc-100" : "text-gray-700")}>
                Personal info
              </h2>

              <label className={"block text-sm " + (isDark ? "text-zinc-300" : "text-gray-600")}>
                Display name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={
                    "mt-1 w-full rounded border px-3 py-2 " +
                    (isDark
                      ? "bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                      : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400")
                  }
                  placeholder="Your name"
                />
              </label>

              <label
                className={
                  "inline-flex items-center gap-2 text-sm mt-2 " +
                  (isDark ? "text-zinc-300" : "text-gray-600")
                }
              >
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className={
                    "rounded " +
                    (isDark ? "border-zinc-700 bg-zinc-900" : "border-gray-300 bg-white")
                  }
                />
                Make my profile public (visible to others)
              </label>

              <button
                onClick={saveProfile}
                className={
                  "px-3 py-2 rounded text-white text-sm mt-4 " +
                  (isDark ? "bg-zinc-800 hover:bg-zinc-700" : "bg-amber-600 hover:bg-amber-700")
                }
              >
                Save changes
              </button>
            </div>

            <div className="space-y-2">
              <h2 className={"text-lg font-semibold " + (isDark ? "text-zinc-100" : "text-gray-700")}>Security</h2>
              <label className={"block text-sm " + (isDark ? "text-zinc-300" : "text-gray-600")}>
                New password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={
                    "mt-1 w-full rounded border px-3 py-2 " +
                    (isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100" : "bg-white border-gray-300 text-gray-900")
                  }
                />
              </label>
              <label className={"block text-sm " + (isDark ? "text-zinc-300" : "text-gray-600")}>
                Confirm password
                <input
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  className={
                    "mt-1 w-full rounded border px-3 py-2 " +
                    (isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100" : "bg-white border-gray-300 text-gray-900")
                  }
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={changePassword}
                  className={
                    "px-3 py-2 rounded text-white text-sm " +
                    (isDark ? "bg-zinc-800 hover:bg-zinc-700" : "bg-amber-600 hover:bg-amber-700")
                  }
                >
                  Change password
                </button>
                <button onClick={deleteAccount} className="px-3 py-2 rounded bg-red-600 text-white text-sm">
                  Delete account
                </button>
              </div>
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          {message ? <p className="mt-4 text-sm text-green-700">{message}</p> : null}
        </div>

        <div
          className={
            "rounded-lg shadow-md p-6 space-y-4 border backdrop-blur " +
            (isDark ? "bg-zinc-950/70 border-zinc-800" : "bg-white/90 border-amber-200")
          }
        >
          <div className="flex items-center justify-between gap-4 flex-col md:flex-row">
            <div>
              <h2 className={"text-xl font-semibold " + (isDark ? "text-zinc-100" : "text-gray-700")}>Your dogs</h2>
              <p className="text-sm text-gray-600">Add, edit, and manage your dogs. Each dog can have 1–3 photos.</p>
            </div>
            <button onClick={resetDogDraft} className="px-3 py-2 rounded border text-sm text-gray-600">
              New dog
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-600">Add / edit dog</h3>
              <label className="block text-sm text-gray-600">
                Name
                <input
                  value={dogDraft.name}
                  onChange={(e) => setDogDraft((d) => ({ ...d, name: e.target.value }))}
                  className={
                    "mt-1 w-full rounded border px-3 py-2 " +
                    (isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100" : "bg-white border-gray-300 text-gray-900")
                  }
                />
              </label>
              <label className="block text-sm text-gray-600">
                Breed
                <input
                  value={dogDraft.breed}
                  onChange={(e) => setDogDraft((d) => ({ ...d, breed: e.target.value }))}
                  className={
                    "mt-1 w-full rounded border px-3 py-2 " +
                    (isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100" : "bg-white border-gray-300 text-gray-900")
                  }
                />
              </label>
              <label className="block text-sm text-gray-600">
                Date of birth (YYYY-MM-DD)
                <input
                  value={dogDraft.dob}
                  onChange={(e) => setDogDraft((d) => ({ ...d, dob: e.target.value }))}
                  className={
                    "mt-1 w-full rounded border px-3 py-2 " +
                    (isDark ? "bg-zinc-900 border-zinc-700 text-zinc-100" : "bg-white border-gray-300 text-gray-900")
                  }
                  placeholder="2020-05-17"
                  inputMode="numeric"
                />
                <p className="mt-1 text-xs text-gray-500">
                  We store age automatically from date of birth. If you are editing and leave this blank, age won’t change.
                </p>
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={dogDraft.is_public}
                  onChange={(e) => setDogDraft((d) => ({ ...d, is_public: e.target.checked }))}
                />
                Make this dog public (Viewable for others)
              </label>

              <div className="space-y-1">
                <p className="text-sm text-gray-600">Photos (up to 3):</p>
                <input
                  color='gray'
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setDogFiles(Array.from(e.target.files ?? []).slice(0, 3))}
                  className="block text-sm text-blue-600"
                />
                <p className="text-xs text-gray-500">If editing, new uploads will be appended (max 3 total).</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={saveDog}
                  disabled={dogSaving}
                  className={
                    "px-3 py-2 rounded text-white text-sm disabled:opacity-50 " +
                    (isDark ? "bg-zinc-800 hover:bg-zinc-700" : "bg-amber-600 hover:bg-amber-700")
                  }
                >
                  {dogSaving ? 'Saving…' : dogDraft.id ? 'Save dog' : 'Add dog'}
                </button>
                {dogDraft.id ? (
                  <button onClick={resetDogDraft} className="px-3 py-2 rounded border text-sm text-gray-600">
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-gray-600">Your dog list</h3>
              {dogs.length === 0 ? (
                <p className="text-sm text-gray-600">No dogs yet.</p>
              ) : (
                <ul className="space-y-3">
                  {dogs.map((d) => (
                    <li key={d.id} className="border rounded p-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-gray-600">{d.name}</p>
                          <p className="text-sm text-gray-600">
                            {d.breed ? `Breed: ${d.breed}` : 'Breed: —'}
                            {(() => {
                              const a = d.dob ? dogToAgeYears(d.dob) : d.age_years;
                              return a !== null && a !== undefined ? ` • Age: ${a}` : '';
                            })()}
                            {d.is_public ? ' • Public' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => void startEditDog(d)} className="px-2 py-1 rounded border text-sm">
                            Edit
                          </button>
                          <button
                            onClick={() => void removeDog(d.id)}
                            className="px-2 py-1 rounded bg-red-600 text-white text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {d.photo_urls && d.photo_urls.length > 0 ? (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {d.photo_urls.map((url) => (
                            <div key={url} className="relative rounded overflow-hidden bg-gray-100">
                              <Image
                                src={url}
                                alt={`${d.name} photo`}
                                width={220}
                                height={220}
                                className="object-cover"
                                unoptimized
                              />
                              <button
                                onClick={() => void removeDogPhoto(d.id, url)}
                                className="absolute top-1 right-1 bg-black/70 text-white text-xs px-2 py-1 rounded"
                                title="Remove photo"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-green-700">{message}</p> : null}
        </div>

        <div className="text-xs text-gray-500">

        </div>
      </div>
      </div>
    </main>
  
  );
}