'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function togglePostLike(postId: string) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
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
          } catch (error) {
            // Ignorerer feil i Server Components
          }
        },
      },
    }
  )

  // 1. Hent brukeren for å bekrefte session
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    console.error("Autentisering feilet:", authError?.message)
    throw new Error("Du må være logget inn for å like.")
  }

  // 2. Sjekk om liken finnes fra før for denne brukeren på dette innlegget
  const { data: existingLike, error: fetchError } = await supabase
    .from('post_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle() // Bruker maybeSingle så den ikke kaster feil hvis raden ikke finnes

  if (fetchError) {
    console.error("Feil ved henting av like-status:", fetchError.message)
    throw new Error("Kunne ikke verifisere like-status")
  }

  if (existingLike) {
    // 3. SLETT (Unlike) hvis den finnes
    const { error: deleteError } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id)
      
    if (deleteError) {
      console.error("Slettefeil:", deleteError.message)
      throw new Error("Kunne ikke fjerne likerklikk")
    }
  } else {
    // 4. LEGG TIL (Like) hvis den ikke finnes
    const { error: insertError } = await supabase
      .from('post_likes')
      .insert({ 
        post_id: postId, 
        user_id: user.id 
      })

    if (insertError) {
      console.error("Lagringsfeil:", insertError.message)
      throw new Error("Kunne ikke lagre likerklikk")
    }
  }

  // 5. Tving Next.js til å oppdatere dataene på siden
  revalidatePath('/')
}