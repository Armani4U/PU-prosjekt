'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function toggleDogLike(dogID: string) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            
          }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Du må være logget inn for å like")
  
  const { data: existingLike } = await supabase
    .from('dog_likes')
    .select('id')
    .eq('dog_id', dogID)
    .eq('user_id', user.id)
    .single()

  if (existingLike) {
    await supabase.from('dog_likes').delete().eq('id', existingLike.id)
  } else {
    await supabase.from('dog_likes').insert({
      dog_id: dogID,
      user_id: user.id
    })
  }

  revalidatePath('/') 
}