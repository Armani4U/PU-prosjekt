'use client'

import { useState } from 'react'
import { toggleDogLike } from '@/app/api/actions/likes'

interface LikeButtonProps {
  dogId: string
  initialLikes: number
  isLikedInitially: boolean
}

export default function LikeButton({ dogId, initialLikes, isLikedInitially }: LikeButtonProps) {
  const [likes, setLikes] = useState(initialLikes)
  const [isLiked, setIsLiked] = useState(isLikedInitially)
  const [isPending, setIsPending] = useState(false)

  const handleLike = async () => {
    if (isPending) return // Hindrer dobbeltklikk mens vi venter

    //oppdaterer UI-et med en gang
    const newIsLiked = !isLiked
    setIsLiked(newIsLiked)
    setLikes(prev => newIsLiked ? prev + 1 : prev - 1)
    setIsPending(true)

    try {
      await toggleDogLike(dogId)
    } catch (error) {
      // I tilfelle noe feiler, som wifi
      setIsLiked(isLiked)
      setLikes(likes)
      console.error("Klarte ikke lagre like:", error)
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
      <span className={`text-xl ${isLiked ? 'animate-pulse' : ''}`}>
        {isLiked ? '❤️' : '🤍'}
      </span>
      <span className="font-medium text-sm">
        {likes}
      </span>
    </button>
  )
}

