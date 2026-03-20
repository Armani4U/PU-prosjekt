'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation' // Importer useRouter
import { togglePostLike } from '@/app/api/actions/post-likes'

interface LikeButtonProps {
  postId: string
  initialLikes: number
  isLikedInitially: boolean
} 

export default function PostLikeButton({ postId, initialLikes, isLikedInitially }: LikeButtonProps) {
  const [likes, setLikes] = useState(initialLikes)
  const [isLiked, setIsLiked] = useState(isLikedInitially)
  const [isPending, setIsPending] = useState(false)
  
  const router = useRouter() // Initialiser routeren

  const handleLike = async () => {
    if (isPending) return 

    // Optimistisk oppdatering (vi endrer UI før serveren svarer)
    const newIsLiked = !isLiked
    setIsLiked(newIsLiked)
    setLikes(prev => newIsLiked ? prev + 1 : prev - 1)
    setIsPending(true)

    try {
      await togglePostLike(postId)
      // Dette tvinger Next.js til å oppdatere dataene i HomeShell (page.tsx)
      router.refresh() 
    } catch (error) {
      // Hvis noe går galt, ruller vi tilbake til gammel tilstand
      setIsLiked(isLiked)
      setLikes(likes)
      console.error("Feil ved liking:", error)
      alert("Kunne ikke lagre likerklikk. Er du logget inn?")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <button 
      onClick={handleLike}
      disabled={isPending}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
        isLiked 
          ? 'bg-red-50 border-red-200 text-red-600' 
          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
      }`}
    >
      <span className="text-lg">{isLiked ? '❤️' : '🤍'}</span>
      <span className="font-medium">{likes}</span>
    </button>
  )
}