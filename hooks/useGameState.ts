import { useState, useEffect, useCallback } from 'react'
import { usePusher } from './usePusher'
import type { LobbyData, PlayerData, RoundData, HintData, VoteResults, PusherEvent } from '@/lib/types'

interface GameStateProps {
  lobbyId: string
  playerId: string
}

export function useGameState({ lobbyId, playerId }: GameStateProps) {
  const [lobby, setLobby] = useState<LobbyData | null>(null)
  const [role, setRole] = useState<'CIVILIAN' | 'IMPOSTER' | null>(null)
  const [word, setWord] = useState<string | null>(null)
  const [isMyTurn, setIsMyTurn] = useState(false)
  const [votingResults, setVotingResults] = useState<VoteResults | null>(null)
  const [guessPrompt, setGuessPrompt] = useState(false)
  const { subscribe, unsubscribe } = usePusher()

  // Fetch initial lobby data
  const fetchLobby = useCallback(async () => {
    try {
      const response = await fetch(`/api/lobby/${lobbyId}`)
      if (!response.ok) throw new Error('Failed to fetch lobby')
      const data = await response.json()
      setLobby(data)

      // Check if it's my turn
      if (data.currentRound) {
        const currentPlayerId = data.currentRound.turnOrder[data.currentRound.currentTurn % data.currentRound.turnOrder.length]
        setIsMyTurn(currentPlayerId === playerId)
      }
    } catch (error) {
      console.error('Error fetching lobby:', error)
    }
  }, [lobbyId, playerId])

  useEffect(() => {
    fetchLobby()

    // Subscribe to public lobby channel
    const lobbyChannel = subscribe(`lobby-${lobbyId}`)
    if (!lobbyChannel) return

    lobbyChannel.bind('game-event', (event: PusherEvent) => {
      switch (event.type) {
        case 'PLAYER_JOINED':
          setLobby(prev => prev ? {
            ...prev,
            players: [...prev.players, event.player],
          } : null)
          break

        case 'PLAYER_LEFT':
          setLobby(prev => prev ? {
            ...prev,
            players: prev.players.filter(p => p.id !== event.playerId),
          } : null)
          break

        case 'GAME_STARTED':
          setLobby(prev => prev ? {
            ...prev,
            state: 'IN_PROGRESS',
            currentRound: event.round,
          } : null)
          const firstPlayerId = event.round.turnOrder[0]
          setIsMyTurn(firstPlayerId === playerId)
          break

        case 'HINT_SUBMITTED':
          setLobby(prev => {
            if (!prev || !prev.currentRound) return prev
            return {
              ...prev,
              currentRound: {
                ...prev.currentRound,
                hints: [...prev.currentRound.hints, event.hint],
              },
            }
          })
          break

        case 'TURN_CHANGED':
          setIsMyTurn(event.playerId === playerId)
          setLobby(prev => {
            if (!prev || !prev.currentRound) return prev
            return {
              ...prev,
              currentRound: {
                ...prev.currentRound,
                currentTurn: event.currentTurn,
              },
            }
          })
          break

        case 'VOTING_STARTED':
          setLobby(prev => prev ? { ...prev, state: 'VOTING' } : null)
          setIsMyTurn(false)
          break

        case 'VOTING_COMPLETE':
          setVotingResults(event.results)
          if (event.results.correctGuess) {
            setLobby(prev => prev ? { ...prev, state: 'GUESSING' } : null)
          }
          break

        case 'ROUND_COMPLETE':
          setLobby(prev => {
            if (!prev) return prev
            return {
              ...prev,
              state: 'ROUND_END',
              players: prev.players.map(p => ({
                ...p,
                score: event.scores[p.id] || p.score,
              })),
            }
          })
          break
      }
    })

    // Subscribe to private player channel
    const playerChannel = subscribe(`player-${lobbyId}-${playerId}`)
    if (playerChannel) {
      playerChannel.bind('private-event', (event: any) => {
        if (event.type === 'ROLE_ASSIGNED') {
          setRole(event.role)
          setWord(event.word)
        } else if (event.type === 'GUESS_WORD_PROMPT') {
          setGuessPrompt(true)
        }
      })
    }

    return () => {
      unsubscribe(`lobby-${lobbyId}`)
      unsubscribe(`player-${lobbyId}-${playerId}`)
    }
  }, [lobbyId, playerId, subscribe, unsubscribe, fetchLobby])

  return {
    lobby,
    role,
    word,
    isMyTurn,
    votingResults,
    guessPrompt,
    refetch: fetchLobby,
  }
}