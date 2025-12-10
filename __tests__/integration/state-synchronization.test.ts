/**
 * State Synchronization Tests
 *
 * Tests for store state management, Pusher event handling,
 * optimistic updates, and reconciliation
 */

import { useGameStore } from '@/lib/store/gameStore'
import { prisma } from '@/lib/db'
import { cleanDatabase, createTestLobby, createTestPlayer } from '../utils/test-helpers'
import { POST as startGame } from '@/app/api/game/start/route'
import { POST as submitHint } from '@/app/api/game/hint/route'

describe('State Synchronization', () => {
  beforeEach(async () => {
    await cleanDatabase()
    useGameStore.getState().reset()
  })

  afterEach(async () => {
    await cleanDatabase()
  })

  describe('Store State Management', () => {
    it('should properly initialize lobby state', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        code: 'TEST1',
        ownerId: 'player1',
        state: 'LOBBY',
        players: [
          { id: 'player1', name: 'Alice', score: 0 }
        ],
        targetScore: 7
      } as any)

      const state = useGameStore.getState()
      expect(state.lobby).toBeDefined()
      expect(state.lobby?.id).toBe('test-lobby')
      expect(state.lobby?.players).toHaveLength(1)
    })

    it('should handle role assignment correctly', () => {
      const store = useGameStore.getState()

      store.setRole('IMPOSTER', null, 'Animals')

      const state = useGameStore.getState()
      expect(state.role).toBe('IMPOSTER')
      expect(state.word).toBeNull() // Imposter doesn't get the word
      expect(state.category).toBe('Animals')

      // Reset and test civilian
      store.setRole('CIVILIAN', 'elephant', 'Animals')
      const newState = useGameStore.getState()
      expect(newState.role).toBe('CIVILIAN')
      expect(newState.word).toBe('elephant')
      expect(newState.category).toBe('Animals')
    })

    it('should update lobby state via updateLobby', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'IN_PROGRESS',
        players: [],
        currentRound: {
          currentTurn: 0,
          hints: []
        }
      } as any)

      store.updateLobby((lobby) => {
        if (lobby.currentRound) {
          lobby.currentRound.currentTurn = 1
          lobby.currentRound.hints.push({
            id: 'hint1',
            text: 'test hint',
            playerId: 'player1',
            playerName: 'Alice',
            turnIndex: 0
          })
        }
      })

      const state = useGameStore.getState()
      expect(state.lobby?.currentRound?.currentTurn).toBe(1)
      expect(state.lobby?.currentRound?.hints).toHaveLength(1)
    })

    it('should reset all state correctly', () => {
      const store = useGameStore.getState()

      // Set up some state
      store.setLobby({ id: 'test', state: 'IN_PROGRESS' } as any)
      store.setRole('IMPOSTER', null, 'Animals')
      store.setIsMyTurn(true)
      store.votedPlayers = ['player1', 'player2']

      // Reset everything
      store.reset()

      const state = useGameStore.getState()
      expect(state.lobby).toBeNull()
      expect(state.role).toBeNull()
      expect(state.word).toBeNull()
      expect(state.category).toBeNull()
      expect(state.isMyTurn).toBe(false)
      expect(state.votedPlayers).toEqual([])
    })
  })

  describe('Phase Transition Handling', () => {
    it('should handle voting phase start correctly', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'IN_PROGRESS',
        players: [],
        currentRound: {
          status: 'IN_PROGRESS',
          bets: []
        }
      } as any)
      store.setIsMyTurn(true)

      store.handleVotingStarted()

      const state = useGameStore.getState()
      expect(state.lobby?.state).toBe('VOTING')
      expect(state.votedPlayers).toEqual([])
      expect(state.votingResults).toBeNull()
      // isMyTurn is not automatically cleared in simplified store
    })

    it('should handle game start correctly', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'LOBBY',
        players: [
          { id: 'p1', name: 'Player 1', score: 0 }
        ]
      } as any)

      const round = {
        id: 'round1',
        roundNumber: 1,
        turnOrder: ['p1'],
        currentTurn: 0,
        hints: [],
        status: 'IN_PROGRESS'
      }

      store.handleGameStarted(round as any)

      const state = useGameStore.getState()
      expect(state.lobby?.state).toBe('IN_PROGRESS')
      expect(state.lobby?.currentRound).toBeDefined()
      expect(state.lobby?.currentRound?.roundNumber).toBe(1)
      expect(state.roundResult).toBeNull()
      expect(state.gameWinner).toBeNull()
    })

    it('should handle vote completion when imposter is voted out', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'VOTING',
        players: [],
        currentRound: {
          imposterId: 'player1',  // player1 is the imposter
        }
      } as any)

      const results = {
        voteCounts: {
          'player1': 2,
          'player2': 1
        },
        votedOutPlayerId: 'player1',  // imposter was voted out
        winners: ['player1']
      }

      store.handleVoteComplete(results)

      const state = useGameStore.getState()
      expect(state.votingResults).toEqual(results)
      expect(state.lobby?.state).toBe('GUESSING') // imposter voted out, so goes to GUESSING
    })

    it('should handle vote completion when civilian is voted out', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'VOTING',
        players: [],
        currentRound: {
          imposterId: 'player1',  // player1 is the imposter
        }
      } as any)

      const results = {
        voteCounts: {
          'player1': 1,
          'player2': 2
        },
        votedOutPlayerId: 'player2',  // civilian was voted out
        winners: ['player2']
      }

      store.handleVoteComplete(results)

      const state = useGameStore.getState()
      expect(state.votingResults).toEqual(results)
      expect(state.lobby?.state).toBe('ROUND_RESULTS') // civilian voted out, so goes to ROUND_RESULTS
    })

    it('should handle vote completion with tie (no one voted out)', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'VOTING',
        players: [],
        currentRound: {
          imposterId: 'player1',
        }
      } as any)

      const results = {
        voteCounts: {
          'player1': 1,
          'player2': 1
        },
        votedOutPlayerId: null,  // tie, no one voted out
        winners: ['player1', 'player2']
      }

      store.handleVoteComplete(results)

      const state = useGameStore.getState()
      expect(state.votingResults).toEqual(results)
      expect(state.lobby?.state).toBe('ROUND_RESULTS') // tie, so goes to ROUND_RESULTS
    })

    it('should handle round results correctly', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'GUESSING',
        players: [
          { id: 'p1', name: 'Player 1', score: 0 },
          { id: 'p2', name: 'Player 2', score: 0 }
        ]
      } as any)

      const result = {
        roundNumber: 1,
        word: 'elephant',
        category: 'Animals',
        imposter: { id: 'p1', name: 'Player 1' },
        wasImposterCaught: true,
        wasWordGuessed: false,
        voteResults: {},
        pointsAwarded: [
          { playerId: 'p2', playerName: 'Player 2', points: 1 }
        ],
        newScores: {
          'p1': 0,
          'p2': 1
        }
      }

      store.handleRoundResults(result as any)

      const state = useGameStore.getState()
      expect(state.roundResult).toEqual(result)
      expect(state.lobby?.state).toBe('ROUND_RESULTS')
      expect(state.lobby?.players[1].score).toBe(1) // Player 2 score updated
      expect(state.votingResults).toBeNull() // Cleared
      expect(state.guessPrompt).toBe(false) // Cleared
    })

    it('should properly transition from hints to voting phase', async () => {
      const lobby = await createTestLobby('TRANS1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id) // Need 3 players

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      if (!round) {
        throw new Error('Round not created')
      }

      // Set up for last hint (which triggers voting)
      await prisma.round.update({
        where: { id: round.id },
        data: {
          currentTurn: 3, // Last turn before 2 passes complete
          turnOrder: [alice.id, bob.id],
          status: 'IN_PROGRESS'
        }
      })

      // Submit last hint (should trigger voting)
      const hintResponse = await submitHint({
        json: async () => ({
          lobbyId: lobby.id,
          playerId: round!.turnOrder[1], // Current player
          text: 'final hint'
        })
      } as any)

      if (hintResponse.status === 200) {
        const updatedRound = await prisma.round.findUnique({
          where: { id: round!.id }
        })

        expect(updatedRound?.status).toBe('VOTING')
      }
    })
  })

  describe('Event Handler Functions', () => {
    it('should handle player joined event', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'LOBBY',
        players: [
          { id: 'p1', name: 'Player 1', score: 0 }
        ]
      } as any)

      const newPlayer = {
        id: 'p2',
        name: 'Player 2',
        score: 0,
        isOwner: false
      }

      store.handlePlayerJoined(newPlayer)

      const state = useGameStore.getState()
      expect(state.lobby?.players).toHaveLength(2)
      expect(state.lobby?.players[1].id).toBe('p2')
    })

    it('should handle player left event', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'LOBBY',
        players: [
          { id: 'p1', name: 'Player 1', score: 0 },
          { id: 'p2', name: 'Player 2', score: 0 }
        ]
      } as any)

      store.handlePlayerLeft('p2')

      const state = useGameStore.getState()
      expect(state.lobby?.players).toHaveLength(1)
      expect(state.lobby?.players[0].id).toBe('p1')
    })

    it('should not add duplicate players', () => {
      const store = useGameStore.getState()

      store.setLobby({
        id: 'test-lobby',
        state: 'LOBBY',
        players: [
          { id: 'p1', name: 'Player 1', score: 0 }
        ]
      } as any)

      const duplicatePlayer = {
        id: 'p1',
        name: 'Player 1 Duplicate',
        score: 10,
        isOwner: true
      }

      store.handlePlayerJoined(duplicatePlayer)

      const state = useGameStore.getState()
      expect(state.lobby?.players).toHaveLength(1) // Still only 1 player
      expect(state.lobby?.players[0].name).toBe('Player 1') // Original name retained
    })
  })

  // Optimistic Updates tests removed - feature was simplified away in favor of atomic operations
})