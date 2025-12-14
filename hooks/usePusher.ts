import { useEffect, useRef, useState } from 'react'
import { getPusherClient } from '@/lib/pusher'
import type { Channel, PresenceChannel } from 'pusher-js'

interface UsePusherOptions {
  playerId?: string
  playerName?: string
}

export function usePusher(options?: UsePusherOptions) {
  const pusherRef = useRef<ReturnType<typeof getPusherClient>>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    pusherRef.current = getPusherClient(options?.playerId, options?.playerName)

    if (pusherRef.current) {
      pusherRef.current.connection.bind('connected', () => {
        setIsConnected(true)
      })

      pusherRef.current.connection.bind('disconnected', () => {
        setIsConnected(false)
      })
    }

    return () => {
      if (pusherRef.current) {
        pusherRef.current.disconnect()
      }
    }
  }, [options?.playerId, options?.playerName])

  const subscribe = (channelName: string): Channel | null => {
    if (!pusherRef.current) return null
    return pusherRef.current.subscribe(channelName)
  }

  const subscribePresence = (channelName: string): PresenceChannel | null => {
    if (!pusherRef.current) return null
    return pusherRef.current.subscribe(channelName) as PresenceChannel
  }

  const unsubscribe = (channelName: string) => {
    if (!pusherRef.current) return
    pusherRef.current.unsubscribe(channelName)
  }

  return {
    pusher: pusherRef.current,
    isConnected,
    subscribe,
    subscribePresence,
    unsubscribe,
  }
}