'use client'

import { useEffect, useState, useCallback, useMemo } from "react"
import { useParams } from "next/navigation"
import Image from "next/image"
import { supabase } from "@/lib/supabase/client"
import Link from 'next/link'

// Types for the stuff coming from Supabase.
// Keeping it simple here – might expand later if needed.

type Profile = {
id: string
display_name: string | null
avatar_url: string | null
is_public: boolean
}

type Dog = {
id: string
name: string
breed: string | null
dob: string | null
photo_urls: string[] | null
is_public: boolean
age_years?: number | null
}

// Page state felt cleaner as a union instead of multiple flags.
// I tried loading/error booleans earlier but it got messy.

type PageState =
| { status: 'loading' }
| { status: 'error'; message: string }
| { status: 'ready'; profile: Profile; dogs: Dog[] }

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------

// Convert a DOB string to years.
// There's probably a library for this but honestly this works fine.
function dogToAgeYears(dob: string): number | null {
  if (!dob || !dob.trim()) return null

  const parsedDate = new Date(dob + 'T00:00:00Z')

  // quick sanity check
  if (Number.isNaN(parsedDate.getTime())) {
    return null
  }

  const today = new Date()

  let years = today.getUTCFullYear() - parsedDate.getUTCFullYear()

  const monthNow = today.getUTCMonth() + 1
  const dayNow = today.getUTCDate()

  const birthMonth = parsedDate.getUTCMonth() + 1
  const birthDay = parsedDate.getUTCDate()

  // Adjust if birthday hasn't happened yet this year
  if (monthNow < birthMonth || (monthNow === birthMonth && dayNow < birthDay)) {
    years--
  }

  // Clamp just to avoid weird values
  if (years < 0) years = 0
  if (years > 100) years = 100

  return years
}

// Read theme from localStorage.
// I had a flicker problem before, so this runs before first paint.
function readThemeInitial(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const stored = localStorage.getItem('theme')

    if (stored) {
      return stored === 'dark'
    }
  } catch (e) {
    // not super worried about this failing
  }

  // fallback to system preference
  const prefersDark =
    window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false

  return prefersDark
}

// ----------------------------------------------------
// Component
// ----------------------------------------------------

export default function PublicProfilePage() {
  const params = useParams()

  // I usually cast this right away just to avoid typescript complaining later
  const userId = params.id as string

  // theme state
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [hasResolvedTheme, setHasResolvedTheme] = useState(false)

  // page state
  const [state, setState] = useState<PageState>({ status: 'loading' })

  // Resolve the persisted theme after mount so the first client render
  // matches the server HTML and avoids hydration mismatches.
  useEffect(() => {
    const initialTheme = readThemeInitial()

    setIsDarkMode(initialTheme)
    setHasResolvedTheme(true)
  }, [])

  // Keep the <html> class synced with our theme.
  useEffect(() => {
    if (!hasResolvedTheme) return

    const html = document.documentElement

    if (isDarkMode) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }

    try {
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light')
    } catch {
      // ignore storage errors
    }
  }, [hasResolvedTheme, isDarkMode])

  // toggle button handler
  const toggleTheme = useCallback(() => {
    setIsDarkMode(prev => !prev)
  }, [])

// ----------------------------------------------------
// Fetch profile + dogs
// ----------------------------------------------------

useEffect(() => {
    let cancelled = false

    async function loadData() {
      // session + profile at the same time
      const [sessionRes, profileRes] = await Promise.all([
        supabase.auth.getSession(),
        supabase
          .from('profiles')
          .select('id, display_name, avatar_url, is_public')
          .eq('id', userId)
          .single()
      ])

      if (cancelled) return

      const profile = profileRes.data
      const profileErr = profileRes.error

      if (profileErr || !profile) {
        setState({ status: 'error', message: 'Profile not found' })
        return
      }

      const loggedInId = sessionRes.data.session?.user.id ?? null

      const isOwner = loggedInId === profile.id

      // Private profile guard
      if (!profile.is_public && !isOwner) {
        setState({ status: 'error', message: 'This profile is private' })
        return
      }

      // Fetch dogs after access check
      const dogsResponse = await supabase
        .from('dogs')
        .select('*')
        .eq('owner_id', userId)
        .or(`is_public.eq.true,owner_id.eq.${loggedInId ?? ''}`)

      if (cancelled) return

      const dogs = dogsResponse.data ?? []

      setState({
        status: 'ready',
        profile: profile,
        dogs: dogs
      })
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [userId])
// ----------------------------------------------------
// Derived data
// ----------------------------------------------------

// compute ages once instead of every render
const dogsWithAge = useMemo(() => {
    if (state.status !== 'ready') return []

    const updated = state.dogs.map(d => {
      const age =
        d.dob
          ? dogToAgeYears(d.dob)
          : (d.age_years ?? null)

      return {
        ...d,
        _ageYears: age
      }
    })

    return updated
  }, [state])
// I like grouping them like this so JSX doesn't get crazy long.
const themeClasses = useMemo(() => {

return {

  page: isDarkMode
    ? 'bg-zinc-900 text-zinc-100'
    : 'bg-[#FFF7ED] text-gray-900',

  aside: isDarkMode
    ? 'border-zinc-800 bg-zinc-950'
    : 'border-amber-200 bg-white',

  card: isDarkMode
    ? 'bg-zinc-950/70 border-zinc-800'
    : 'bg-white/90 border-amber-200',

  btn: isDarkMode
    ? 'border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800'
    : 'border-amber-200 bg-white/80 text-gray-900 hover:bg-amber-50',

  label: isDarkMode
    ? 'text-zinc-300'
    : 'text-gray-600',

  dogCard: isDarkMode
    ? 'border-zinc-700 bg-zinc-900'
    : 'border-gray-200 bg-orange-50'
}

}, [isDarkMode])

// ----------------------------------------------------
// Render
// ----------------------------------------------------

  if (state.status === 'loading') {
    return (
      <main className={`min-h-screen flex items-center justify-center ${themeClasses.page}`}>
        <div className={`w-full max-w-lg rounded-lg shadow-md p-6 border ${themeClasses.card}`}>
          Loading…
        </div>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        {state.message}
      </main>
    )
  }

  const { profile } = state

  return (

<main className={`min-h-screen ${themeClasses.page}`}>

  <div className="flex min-h-screen">

    {/* Sidebar */}

    <aside className={`hidden md:flex md:w-64 md:shrink-0 md:flex-col md:gap-6 px-4 py-8 sticky top-0 h-screen border-r ${themeClasses.aside}`}>
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

      {/* theme toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className={`w-full rounded-xl px-3 py-2 text-sm font-semibold border transition ${themeClasses.btn}`}
        aria-label="Toggle dark mode"
      >
        {isDarkMode ? '☀ Light mode' : '🌙 Dark mode'}
      </button>
    </aside>



    {/* Main area */}

    <div className="flex-1 overflow-y-auto px-30">
      <div className="mx-auto max-w-full py-6 space-y-6">
        {/* Profile card */}
        <div className={`rounded-lg shadow-md p-6 border backdrop-blur ${themeClasses.card}`}>
          <div className="flex items-center gap-4">
            <div className="h-30 w-30 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
              {profile.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt="Avatar"
                  width={120}
                  height={120}
                  unoptimized
                />
              ) : (
                <span className="text-gray-500 text-sm">
                  No avatar
                </span>
              )}
            </div>

            <h1 className={`text-lg ${themeClasses.label}`}>
              {profile.display_name || 'Unknown'}
            </h1>
          </div>
        </div>



        {/* Dogs */}
        <div className={`rounded-lg shadow-md p-6 border backdrop-blur ${themeClasses.card}`}>
          <h3 className={`font-semibold mb-3 ${themeClasses.label}`}>
            Dogs
          </h3>

          {dogsWithAge.length === 0 ? (
            <p className={`text-sm ${themeClasses.label}`}>
              No dogs yet.
            </p>
          ) : (
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: 'repeat(3, 1fr)',
                gridAutoFlow: 'row dense'
              }}
            >
              {dogsWithAge.map((dog) => {
                const photoCount = dog.photo_urls?.length ?? 0

                // span depending on number of photos
                const colSpan = Math.min(photoCount, 3) || 1

                const metaParts = [
                  dog.breed
                    ? `Breed: ${dog.breed}`
                    : 'Breed: —',

                  dog._ageYears != null
                    ? `Age: ${dog._ageYears}`
                    : null,

                  dog.is_public
                    ? 'Public'
                    : null
                ]

                const meta = metaParts
                  .filter(Boolean)
                  .join(' • ')

                return (
                  <div
                    key={dog.id}
                    className={`border-2 rounded p-2 ${themeClasses.dogCard}`}
                    style={{ gridColumn: `span ${colSpan}` }}
                  >
                    <div className="flex items-start gap-4">
                      <div>
                        <p className={`font-semibold ${themeClasses.label}`}>
                          {dog.name}
                        </p>

                        <p className={`text-sm ${themeClasses.label}`}>
                          {meta}
                        </p>
                      </div>
                    </div>

                    {photoCount > 0 && (
                      <div
                        className="mt-3 grid gap-2"
                        style={{
                          gridTemplateColumns: `repeat(${photoCount}, 1fr)`
                        }}
                      >
                        {dog.photo_urls!.map((url, i) => (
                          <div
                            key={`${dog.id}-photo-${i}`}
                            className="relative rounded overflow-hidden aspect-[4/3] w-full"
                          >
                            <Image
                              src={url}
                              alt={`${dog.name} photo ${i + 1}`}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

    </div>

  </div>

</main>

)
}