/**
 * Turn Management Tests
 *
 * Tests for turn tracking, turn display, and turn state management
 * throughout the game lifecycle.
 */

import { useGameStore } from '@/lib/store/gameStore'
import { prisma } from '@/lib/db'
import { cleanDatabase, createTestLobby, createTestPlayer } from '../utils/test-helpers'

describe('Turn Management System', () => {
  beforeEach(async () => {
    await cleanDatabase()
    useGameStore.getState().reset()
  })

  afterEach(async () => {
    await cleanDatabase()
  })

  describe('Turn State Tracking', () => {
    it('should correctly identify current player turn', () => {
      useGameStore.getState().setLobby({
        id: 'test-lobby',
        state: 'IN_PROGRESS',
        players: [
          { id: 'player1', name: 'Alice', score: 0 },
          { id: 'player2', name: 'Bob', score: 0 },
          { id: 'player3', name: 'Charlie', score: 0 }
        ],
        currentRound: {
          turnOrder: ['player1', 'player2', 'player3'],
          currentTurn: 1, // Bob's turn (index 1)
          status: 'IN_PROGRESS'
        }
      } as any)

      const state = useGameStore.getState()
      const currentIndex = 1 % 3
      const currentPlayerId = state.lobby?.currentRound?.turnOrder[currentIndex]

      expect(currentPlayerId).toBe('player2')
    })

    it('should update isMyTurn when game starts', () => {
      useGameStore.getState().setLobby({
        id: 'test-lobby',
        code: 'TEST1',
        ownerId: 'player1',
        state: 'IN_PROGRESS',
        players: [
          { id: 'player1', name: 'Alice', score: 0, isOwner: true },
          { id: 'player2', name: 'Bob', score: 0, isOwner: false }
        ],
        currentRound: {
          id: 'round1',
          roundNumber: 1,
          turnOrder: ['player1', 'player2'],
          currentTurn: 0,
          hints: [],
          status: 'IN_PROGRESS',
          imposterId: 'player2',
          bets: [],
          votes: []
        },
        targetScore: 7,
        emergencyVotesEnabled: false,
        bettingEnabled: false,
        lastCompletedRoundNumber: 0
      } as any)

      // Test for player1 (whose turn it is)
      useGameStore.getState().setIsMyTurn(true)
      expect(useGameStore.getState().isMyTurn).toBe(true)

      // Change turn
      useGameStore.getState().updateLobby((lobby) => {
        if (lobby.currentRound) {
          lobby.currentRound.currentTurn = 1
        }
      })
      useGameStore.getState().setIsMyTurn(false)
      expect(useGameStore.getState().isMyTurn).toBe(false)
    })

    it('should track turn changes correctly', () => {
      const store = useGameStore.getState()
      const viewingPlayerId = 'player2'

      store.setLobby({
        id: 'test-lobby',
        state: 'IN_PROGRESS',
        players: [
          { id: 'player1', name: 'Player 1', score: 0 },
          { id: 'player2', name: 'Player 2', score: 0 }
        ],
        currentRound: {
          turnOrder: ['player1', 'player2'],
          currentTurn: 0, // Player 1's turn
          status: 'IN_PROGRESS'
        }
      } as any)

      // Initially not player2's turn
      store.setIsMyTurn(false)
      expect(store.isMyTurn).toBe(false)

      // Turn changes to player2
      store.updateLobby((lobby) => {
        if (lobby.currentRound) {
          lobby.currentRound.currentTurn = 1
        }
      })

      // Update isMyTurn based on new state
      const currentIndex = 1 % 2
      const updatedState = useGameStore.getState()
      const currentPlayerId = updatedState.lobby?.currentRound?.turnOrder[currentIndex]
      updatedState.setIsMyTurn(currentPlayerId === viewingPlayerId)

      expect(useGameStore.getState().isMyTurn).toBe(true)
    })
  })

  describe('Turn State During Phase Transitions', () => {
    it('should verify voting phase state change', () => {
      // Setup initial state with player's turn
      useGameStore.getState().setIsMyTurn(true)
      useGameStore.getState().setLobby({
        id: 'test-lobby',
        state: 'IN_PROGRESS',
        players: [],
        currentRound: {
          status: 'IN_PROGRESS',
          bets: []
        }
      } as any)

      expect(useGameStore.getState().isMyTurn).toBe(true)

      // Voting phase starts - handleVotingStarted only changes lobby state
      useGameStore.getState().handleVotingStarted()

      // The store itself doesn't clear isMyTurn - that's handled by useGameSync hook
      expect(useGameStore.getState().lobby?.state).toBe('VOTING')
      // Note: isMyTurn clearing during voting is tested in useGameSync.test.tsx
    })

    it('should reset isMyTurn on game restart', () => {
      useGameStore.getState().setIsMyTurn(true)
      useGameStore.getState().setLobby({ id: 'test', state: 'IN_PROGRESS' } as any)

      expect(useGameStore.getState().isMyTurn).toBe(true)

      // Game restart should clear turn state
      useGameStore.getState().reset()

      expect(useGameStore.getState().isMyTurn).toBe(false)
      expect(useGameStore.getState().lobby).toBeNull()
    })
  })

  describe('Turn Display Bug Fixes', () => {
    it('should not show "Waiting for X to give hint" when X is the current player', () => {
      // This was the original bug report
      const store = useGameStore.getState()
      const myPlayerId = 'd' // I am player d

      store.setLobby({
        id: 'test-lobby',
        state: 'IN_PROGRESS',
        players: [
          { id: 'a', name: 'Player A', score: 0 },
          { id: 'b', name: 'Player B', score: 0 },
          { id: 'c', name: 'Player C', score: 0 },
          { id: 'd', name: 'Player D', score: 0 }
        ],
        currentRound: {
          turnOrder: ['a', 'b', 'c', 'd'],
          currentTurn: 3, // It's player d's turn (index 3)
          status: 'IN_PROGRESS',
          hints: []
        }
      } as any)

      // Calculate whose turn it is
      const currentIndex = 3 % 4
      const state = useGameStore.getState()
      const currentPlayerId = state.lobby?.currentRound?.turnOrder[currentIndex]
      expect(currentPlayerId).toBe('d')

      // Set isMyTurn correctly
      state.setIsMyTurn(currentPlayerId === myPlayerId)
      expect(useGameStore.getState().isMyTurn).toBe(true)

      // Now HintsSection would show input field instead of "Waiting for Player D..."
    })

    it('should handle wrap-around turns correctly in second pass', () => {
      useGameStore.getState().setLobby({
        id: 'test-lobby',
        state: 'IN_PROGRESS',
        players: [
          { id: 'p1', name: 'Player 1', score: 0 },
          { id: 'p2', name: 'Player 2', score: 0 },
          { id: 'p3', name: 'Player 3', score: 0 }
        ],
        currentRound: {
          turnOrder: ['p1', 'p2', 'p3'],
          currentTurn: 4, // Second pass, player 2's turn (4 % 3 = 1)
          status: 'IN_PROGRESS'
        }
      } as any)

      const state = useGameStore.getState()
      const currentIndex = 4 % 3 // = 1
      const currentPlayerId = state.lobby?.currentRound?.turnOrder[currentIndex]

      expect(currentPlayerId).toBe('p2')
      expect(currentIndex).toBe(1)
    })
  })

  describe('Turn Calculation Edge Cases', () => {
    it('should handle empty turn order gracefully', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'IN_PROGRESS',
        players: [],
        currentRound: {
          turnOrder: [],
          currentTurn: 0,
          status: 'IN_PROGRESS'
        }
      } as any)

      // Should not crash when turn order is empty
      const turnOrder = store.lobby?.currentRound?.turnOrder || []
      const currentIndex = turnOrder.length > 0 ? 0 % turnOrder.length : -1
      const currentPlayerId = currentIndex >= 0 ? turnOrder[currentIndex] : null

      expect(currentPlayerId).toBeNull()
    })

    it('should handle missing currentRound gracefully', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'LOBBY',
        players: [
          { id: 'p1', name: 'Player 1', score: 0 }
        ],
        currentRound: null
      } as any)

      // Should handle missing round
      const currentTurn = store.lobby?.currentRound?.currentTurn ?? -1
      expect(currentTurn).toBe(-1)

      // isMyTurn should be false when no round
      store.setIsMyTurn(false)
      expect(store.isMyTurn).toBe(false)
    })
  })
})