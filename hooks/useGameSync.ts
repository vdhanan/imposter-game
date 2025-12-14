'use client'

import { useEffect, useCallback } from 'react'
import { useGameStore } from '@/lib/store/gameStore'
import { usePusher } from './usePusher'
import type { PusherEvent } from '@/lib/types'

interface GameSyncProps {
  lobbyId: string
  playerId: string
}

// This hook syncs Zustand store with server state via Pusher
export function useGameSync({ lobbyId, playerId }: GameSyncProps) {
  const playerName = typeof window !== 'undefined' ? localStorage.getItem('playerName') : null
  const { subscribe, subscribePresence, unsubscribe } = usePusher({ playerId, playerName: playerName || '' })
  const store = useGameStore()

  // Fetch initial lobby data
  const fetchLobby = useCallback(async () => {
    try {
      const response = await fetch(`/api/lobby/${lobbyId}?playerId=${playerId}`)
      if (!response.ok) throw new Error('Failed to fetch lobby')
      const data = await response.json()

      store.setLobby(data)

      // Set player-specific data if available
      if (data.playerData) {
        store.setRole(data.playerData.role, data.playerData.word, data.playerData.category)
      }

      // Check if it's my turn
      if (data.currentRound) {
        const currentIndex = data.currentRound.currentTurn % data.currentRound.turnOrder.length
        const currentPlayerId = data.currentRound.turnOrder[currentIndex]
        store.setIsMyTurn(currentPlayerId === playerId)
        store.updateLobby((lobby) => {
          lobby.state = data.state
        })
      } else {
        store.setIsMyTurn(false)
      }
    } catch (error) {
      console.error('Error fetching lobby:', error)
    }
  }, [lobbyId, playerId, store])

  useEffect(() => {
    fetchLobby()

    // Store event handlers for cleanup
    const handlers: { event: string; handler: any; channel: any }[] = []

    // Subscribe to presence channel for online/offline tracking
    const presenceChannel = subscribePresence(`presence-lobby-${lobbyId}`)
    if (presenceChannel) {
      // Handle member added (player comes online)
      const memberAddedHandler = (member: any) => {
        store.updateLobby((lobby) => {
          const player = lobby.players.find(p => p.id === member.id)
          if (player) {
            player.isOnline = true
          }
        })
      }
      presenceChannel.bind('pusher:member_added', memberAddedHandler)
      handlers.push({ event: 'pusher:member_added', handler: memberAddedHandler, channel: presenceChannel })

      // Handle member removed (player goes offline)
      const memberRemovedHandler = (member: any) => {
        store.updateLobby((lobby) => {
          const player = lobby.players.find(p => p.id === member.id)
          if (player) {
            player.isOnline = false
          }
        })
      }
      presenceChannel.bind('pusher:member_removed', memberRemovedHandler)
      handlers.push({ event: 'pusher:member_removed', handler: memberRemovedHandler, channel: presenceChannel })

      // Handle subscription succeeded to get initial members
      const subscriptionHandler = (members: any) => {
        const onlineIds = Object.keys(members.members)
        store.updateLobby((lobby) => {
          lobby.players.forEach(player => {
            player.isOnline = onlineIds.includes(player.id)
          })
        })
      }
      presenceChannel.bind('pusher:subscription_succeeded', subscriptionHandler)
      handlers.push({ event: 'pusher:subscription_succeeded', handler: subscriptionHandler, channel: presenceChannel })
    }

    // Subscribe to public lobby channel
    const lobbyChannel = subscribe(`lobby-${lobbyId}`)
    if (!lobbyChannel) return

    lobbyChannel.bind('game-event', (event: PusherEvent) => {
      switch (event.type) {
        case 'PLAYER_JOINED':
          store.handlePlayerJoined(event.player)
          break

        case 'PLAYER_LEFT':
          store.handlePlayerLeft(event.playerId)
          break

        case 'GAME_STARTED':
          store.handleGameStarted(event.round)
          // Set initial turn state
          if (event.round && event.round.turnOrder.length > 0) {
            const currentIndex = event.round.currentTurn % event.round.turnOrder.length
            const currentPlayerId = event.round.turnOrder[currentIndex]
            store.setIsMyTurn(currentPlayerId === playerId)
          }
          break

        case 'HINT_SUBMITTED':
          store.updateLobby((lobby) => {
            if (lobby.currentRound) {
              // Add hint to round
              const existingHint = lobby.currentRound.hints.find(
                h => h.playerId === event.hint.playerId && h.turnIndex === event.hint.turnIndex
              )
              if (!existingHint) {
                lobby.currentRound.hints.push(event.hint)
              }
            }
          })
          break

        case 'TURN_CHANGED':
          store.updateLobby((lobby) => {
            if (lobby.currentRound) {
              lobby.currentRound.currentTurn = event.currentTurn
              const currentIndex = event.currentTurn % lobby.currentRound.turnOrder.length
              const currentPlayerId = lobby.currentRound.turnOrder[currentIndex]
              store.setIsMyTurn(currentPlayerId === playerId)
            }
          })
          break

        case 'HINTS_COMPLETE':
          store.updateLobby((lobby) => {
            if (lobby.currentRound) {
              lobby.currentRound.status = 'HINTS_COMPLETE'
            }
          })
          break

        case 'VOTING_STARTED':
          store.handleVotingStarted()
          store.setIsMyTurn(false) // No turns during voting - everyone votes simultaneously
          break

        case 'VOTE_CAST':
          store.updateLobby((lobby) => {
            if (!store.votedPlayers.includes(event.voterId)) {
              store.votedPlayers.push(event.voterId)
            }
          })
          break

        case 'BET_PLACED':
          store.updateLobby((lobby) => {
            if (lobby.currentRound && event.bet) {
              if (!lobby.currentRound.bets) {
                lobby.currentRound.bets = []
              }
              // Only add if not already present
              if (!lobby.currentRound.bets.find(b => b.bettorId === event.bet.bettorId)) {
                lobby.currentRound.bets.push(event.bet)
              }
            }
          })
          break

        case 'VOTING_COMPLETE':
          store.handleVoteComplete(event.results)
          break

        case 'EMERGENCY_VOTE_INITIATED':
          store.updateLobby((lobby) => {
            lobby.state = 'EMERGENCY_VOTING'
            if (lobby.currentRound) {
              lobby.currentRound.status = 'EMERGENCY_VOTING'
            }
          })
          store.setIsMyTurn(false) // No turns during emergency voting
          break

        case 'ROUND_RESULTS':
          store.handleRoundResults(event.result)
          break

        case 'GAME_OVER':
          store.updateLobby((lobby) => {
            lobby.state = 'GAME_OVER'
            lobby.gameInProgress = false
          })
          if (event.winner) {
            store.gameWinner = event.winner
          }
          break
      }
    })

    // Subscribe to private player channel
    const playerChannel = subscribe(`private-player-${playerId}`)
    if (playerChannel) {
      playerChannel.bind('role-assigned', (data: { role: 'CIVILIAN' | 'IMPOSTER', word?: string, category?: string }) => {
        store.setRole(data.role, data.word || null, data.category || null)
      })

      playerChannel.bind('guess-prompt', () => {
        store.guessPrompt = true
      })
    }

    return () => {
      // Unbind all event handlers to prevent memory leaks
      handlers.forEach(({ event, handler, channel }) => {
        channel.unbind(event, handler)
      })

      unsubscribe(`lobby-${lobbyId}`)
      unsubscribe(`presence-lobby-${lobbyId}`)
      unsubscribe(`private-player-${playerId}`)
    }
  }, [lobbyId, playerId, subscribe, subscribePresence, unsubscribe, store, fetchLobby])

  return {
    lobby: store.lobby,
    role: store.role,
    word: store.word,
    category: store.category,
    isMyTurn: store.isMyTurn,
    votingResults: store.votingResults,
    guessPrompt: store.guessPrompt,
    votedPlayers: store.votedPlayers,
    roundResult: store.roundResult,
    gameWinner: store.gameWinner,
  }
}