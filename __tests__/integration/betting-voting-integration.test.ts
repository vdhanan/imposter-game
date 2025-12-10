/**
 * Betting and Voting Integration Tests
 *
 * Tests for the interaction between betting and voting systems,
 * including atomic operations, hedging strategies, and race conditions
 */

import { prisma } from '@/lib/db'
import { useGameStore } from '@/lib/store/gameStore'
import { cleanDatabase, createTestLobby, createTestPlayer } from '../utils/test-helpers'
import { POST as startGame } from '@/app/api/game/start/route'
import { POST as placeBet } from '@/app/api/game/bet/route'
import { POST as voteWithBet } from '@/app/api/game/vote-with-bet/route'

describe('Betting and Voting Integration', () => {
  beforeEach(async () => {
    await cleanDatabase()
    useGameStore.getState().reset()
  })

  afterEach(async () => {
    await cleanDatabase()
  })

  describe('Atomic Betting and Voting Operations', () => {
    it('should allow betting and voting as a single atomic action', async () => {
      const lobby = await createTestLobby('ATOMIC1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Give Bob points to bet
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 5 }
      })

      // Start game
      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      // Set up voting phase with Charlie as imposter
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: charlie.id
        }
      })

      // Bob bets on Charlie
      const betResponse = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 2
        })
      } as any)
      expect(betResponse.status).toBe(200)

      // Bob votes for Charlie (same as bet)
      const voteResponse = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: null
        })
      } as any)
      expect(voteResponse.status).toBe(200)

      // Verify both bet and vote exist
      const bet = await prisma.bet.findFirst({
        where: { roundId: round!.id, bettorId: bob.id }
      })
      const vote = await prisma.vote.findFirst({
        where: { roundId: round!.id, voterId: bob.id }
      })

      expect(bet).toBeTruthy()
      expect(bet?.targetId).toBe(charlie.id)
      expect(vote).toBeTruthy()
      expect(vote?.suspectId).toBe(charlie.id)
    })

    it('should handle voting without betting when eligible', async () => {
      const lobby = await createTestLobby('NOBET1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Bob has points but chooses not to bet
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 5 }
      })

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: charlie.id
        }
      })

      // Bob only votes, doesn't bet
      const voteResponse = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: null
        })
      } as any)
      expect(voteResponse.status).toBe(200)

      // Verify vote exists but no bet
      const bet = await prisma.bet.findFirst({
        where: { roundId: round!.id, bettorId: bob.id }
      })
      const vote = await prisma.vote.findFirst({
        where: { roundId: round!.id, voterId: bob.id }
      })

      expect(bet).toBeNull()
      expect(vote).toBeTruthy()
    })

    it('should handle voting without betting when player has no points', async () => {
      const lobby = await createTestLobby('NOPOINTS1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Bob has 0 points (default)
      const bobPlayer = await prisma.player.findUnique({ where: { id: bob.id } })
      expect(bobPlayer?.score).toBe(0)

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: charlie.id
        }
      })

      // Bob can't bet (no points)
      const betResponse = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 1
        })
      } as any)
      expect(betResponse.status).toBe(400)

      // But Bob can still vote
      const voteResponse = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: null
        })
      } as any)
      expect(voteResponse.status).toBe(200)

      const vote = await prisma.vote.findFirst({
        where: { roundId: round!.id, voterId: bob.id }
      })
      expect(vote).toBeTruthy()
    })
  })

  describe('Hedging Strategies', () => {
    it('should allow hedging strategy (bet on one player, vote for another)', async () => {
      const lobby = await createTestLobby('HEDGE1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)
      const dave = await createTestPlayer('Dave', lobby.id)

      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 3 }
      })

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: charlie.id
        }
      })

      // Bob bets on Charlie
      const betResponse = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 1
        })
      } as any)
      expect(betResponse.status).toBe(200)

      // Bob votes for Dave (hedging)
      const voteResponse = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: dave.id,
          bet: null
        })
      } as any)
      expect(voteResponse.status).toBe(200)

      // Verify hedge is set up correctly
      const bet = await prisma.bet.findFirst({
        where: { roundId: round!.id, bettorId: bob.id }
      })
      const vote = await prisma.vote.findFirst({
        where: { roundId: round!.id, voterId: bob.id }
      })

      expect(bet?.targetId).toBe(charlie.id)
      expect(vote?.suspectId).toBe(dave.id)
      expect(bet?.targetId).not.toBe(vote?.suspectId) // Confirm hedge
    })

    it('should correctly display hedging strategy in UI state', () => {
      useGameStore.setState({
        lobby: {
          id: 'test-lobby',
          state: 'VOTING',
          players: [
            { id: 'player1', name: 'Alice', score: 5 },
            { id: 'player2', name: 'Bob', score: 3 },
            { id: 'player3', name: 'Charlie', score: 2 }
          ],
          currentRound: {
            bets: [{
              bettorId: 'player1',
              targetId: 'player2', // Bet on Bob
              amount: 1
            }]
          }
        } as any,
        pendingVote: 'player3', // Vote for Charlie
        pendingBet: { targetId: 'player2', amount: 1 }
      })

      const state = useGameStore.getState()
      const betTarget = state.pendingBet?.targetId
      const voteTarget = state.pendingVote
      const isHedging = betTarget && voteTarget && betTarget !== voteTarget

      expect(isHedging).toBeTruthy()
      expect(betTarget).toBe('player2')
      expect(voteTarget).toBe('player3')
    })
  })

  describe('State Persistence', () => {
    it('should persist bet information after submission', () => {
      useGameStore.setState({
        lobby: {
          id: 'test-lobby',
          state: 'VOTING',
          players: [
            { id: 'player1', name: 'Alice', score: 5 },
            { id: 'player2', name: 'Bob', score: 3 }
          ],
          currentRound: {
            id: 'round1',
            bets: [{
              id: 'bet1',
              roundId: 'round1',
              bettorId: 'player1',
              targetId: 'player2',
              amount: 2
            }]
          }
        } as any,
        pendingBet: { targetId: 'player2', amount: 2 }
      })

      const state = useGameStore.getState()
      const actualBet = state.lobby?.currentRound?.bets?.find(
        b => b.bettorId === 'player1'
      )

      expect(actualBet).toBeDefined()
      expect(actualBet?.targetId).toBe('player2')
      expect(actualBet?.amount).toBe(2)
      expect(state.pendingBet?.targetId).toBe('player2')
    })
  })

  describe('Race Condition Handling', () => {
    it('should prevent duplicate bets when concurrent requests are made', async () => {
      const lobby = await createTestLobby('RACE1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 10 }
      })

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: charlie.id
        }
      })

      // Make 5 concurrent bet requests
      const betRequests = Array(5).fill(null).map(() =>
        placeBet({
          json: async () => ({
            lobbyId: lobby.id,
            bettorId: bob.id,
            targetId: charlie.id,
            amount: 2
          })
        } as any)
      )

      const responses = await Promise.all(betRequests)

      // Only one should succeed
      const successCount = responses.filter(r => r.status === 200).length
      const failureCount = responses.filter(r => r.status === 400).length

      expect(successCount).toBe(1)
      expect(failureCount).toBe(4)

      // Verify only one bet was created
      const bets = await prisma.bet.findMany({
        where: { roundId: round!.id, bettorId: bob.id }
      })
      expect(bets).toHaveLength(1)
    })

    it('should handle concurrent vote submissions correctly', async () => {
      const lobby = await createTestLobby('RACE2', { bettingEnabled: false })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: charlie.id
        }
      })

      // Make 3 concurrent vote requests from Bob
      const voteRequests = Array(3).fill(null).map(() =>
        voteWithBet({
          json: async () => ({
            lobbyId: lobby.id,
            voterId: bob.id,
            suspectId: charlie.id
          })
        } as any)
      )

      const responses = await Promise.all(voteRequests)

      // Only one should succeed
      const successCount = responses.filter(r => r.status === 200).length
      const failureCount = responses.filter(r => r.status === 400).length

      expect(successCount).toBe(1)
      expect(failureCount).toBe(2)

      // Verify only one vote was created
      const votes = await prisma.vote.findMany({
        where: { roundId: round!.id, voterId: bob.id }
      })
      expect(votes).toHaveLength(1)
    })
  })

  describe('Phase Transition Effects', () => {
    it('should not wait for bets to transition phases', async () => {
      const lobby = await createTestLobby('TRANS1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Give both players points
      await prisma.player.updateMany({
        where: { id: { in: [bob.id, charlie.id] } },
        data: { score: 5 }
      })

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: alice.id
        }
      })

      // Only Bob places a bet
      await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: alice.id,
          amount: 2
        })
      } as any)

      // All players vote (Charlie doesn't bet)
      await voteWithBet({
        json: async () => ({ lobbyId: lobby.id, voterId: bob.id, suspectId: alice.id })
      } as any)
      await voteWithBet({
        json: async () => ({ lobbyId: lobby.id, voterId: charlie.id, suspectId: alice.id })
      } as any)
      await voteWithBet({
        json: async () => ({ lobbyId: lobby.id, voterId: alice.id, suspectId: bob.id })
      } as any)

      // Should transition even though Charlie didn't bet
      const currentRound = await prisma.round.findUnique({ where: { id: round!.id } })
      expect(currentRound?.status).toBe('GUESSING')

      // Verify only Bob's bet exists
      const bets = await prisma.bet.findMany({ where: { roundId: round!.id } })
      expect(bets).toHaveLength(1)
      expect(bets[0].bettorId).toBe(bob.id)
    })
  })
})