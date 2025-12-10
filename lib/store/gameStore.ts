import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { subscribeWithSelector } from 'zustand/middleware'
import type { LobbyData, PlayerData, RoundData, HintData, VoteResults, RoundResult, BetData } from '@/lib/types'

interface GameStore {
  // Core game state (server source of truth)
  lobby: LobbyData | null
  role: 'CIVILIAN' | 'IMPOSTER' | null
  word: string | null
  category: string | null

  // Derived state
  isMyTurn: boolean
  votingResults: VoteResults | null
  guessPrompt: boolean
  votedPlayers: string[]
  roundResult: RoundResult | null
  gameWinner: PlayerData | null

  // Actions
  setLobby: (lobby: LobbyData) => void
  updateLobby: (updater: (lobby: LobbyData) => void) => void
  setRole: (role: 'CIVILIAN' | 'IMPOSTER' | null, word: string | null, category: string | null) => void
  setIsMyTurn: (isMyTurn: boolean) => void

  // Event handlers
  handlePlayerJoined: (player: PlayerData) => void
  handlePlayerLeft: (playerId: string) => void
  handleGameStarted: (round: RoundData) => void
  handleVotingStarted: () => void
  handleVoteComplete: (results: VoteResults) => void
  handleRoundResults: (result: RoundResult) => void

  // Utility
  reset: () => void
}

export const useGameStore = create<GameStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      // Initial state
      lobby: null,
      role: null,
      word: null,
      category: null,
      isMyTurn: false,
      votingResults: null,
      guessPrompt: false,
      votedPlayers: [],
      roundResult: null,
      gameWinner: null,

      setLobby: (lobby) => set({ lobby }),

      updateLobby: (updater) => set((state) => {
        if (state.lobby) {
          updater(state.lobby)
        }
      }),

      setRole: (role, word, category) => set({ role, word, category }),

      setIsMyTurn: (isMyTurn) => set({ isMyTurn }),

      handlePlayerJoined: (player) => set((state) => {
        if (state.lobby && !state.lobby.players.find(p => p.id === player.id)) {
          state.lobby.players.push(player)
        }
      }),

      handlePlayerLeft: (playerId) => set((state) => {
        if (state.lobby) {
          state.lobby.players = state.lobby.players.filter(p => p.id !== playerId)
        }
      }),

      handleGameStarted: (round) => set((state) => {
        if (state.lobby) {
          state.lobby.state = 'IN_PROGRESS'
          state.lobby.currentRound = round
        }
        state.votingResults = null
        state.roundResult = null
      }),

      handleVotingStarted: () => set((state) => {
        if (state.lobby) {
          state.lobby.state = 'VOTING'
        }
        state.votedPlayers = []
      }),

      handleVoteComplete: (results) => set((state) => {
        state.votingResults = results
        if (state.lobby && state.lobby.currentRound) {
          // Check if imposter was voted out
          const imposterVotedOut = results.votedOutPlayerId === state.lobby.currentRound.imposterId

          if (imposterVotedOut) {
            state.lobby.state = 'GUESSING'
          } else {
            state.lobby.state = 'ROUND_RESULTS'
          }
        }
      }),

      handleRoundResults: (result) => set((state) => {
        state.roundResult = result
        if (state.lobby) {
          state.lobby.state = 'ROUND_RESULTS'
          // Update scores based on results
          if (result.pointsAwarded) {
            for (const award of result.pointsAwarded) {
              const player = state.lobby.players.find(p => p.id === award.playerId)
              if (player) {
                player.score += award.points
              }
            }
          }
          // Update scores based on bet results
          if (result.betResults) {
            for (const bet of result.betResults) {
              const player = state.lobby.players.find(p => p.id === bet.bettorId)
              if (player) {
                player.score += bet.won ? bet.amount : -bet.amount
              }
            }
          }
        }
      }),

      reset: () => set({
        lobby: null,
        role: null,
        word: null,
        category: null,
        isMyTurn: false,
        votingResults: null,
        guessPrompt: false,
        votedPlayers: [],
        roundResult: null,
        gameWinner: null,
      }),
    }))
  )
)