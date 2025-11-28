import { useEffect, useRef, useState } from 'react'
import { getPusherClient } from '@/lib/pusher'
import type { Channel } from 'pusher-js'

export function usePusher() {
  const pusherRef = useRef<ReturnType<typeof getPusherClient>>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    pusherRef.current = getPusherClient()

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
  }, [])

  const subscribe = (channelName: string): Channel | null => {
    if (!pusherRef.current) return null
    return pusherRef.current.subscribe(channelName)
  }

  const unsubscribe = (channelName: string) => {
    if (!pusherRef.current) return
    pusherRef.current.unsubscribe(channelName)
  }

  return {
    pusher: pusherRef.current,
    isConnected,
    subscribe,
    unsubscribe,
  }
}