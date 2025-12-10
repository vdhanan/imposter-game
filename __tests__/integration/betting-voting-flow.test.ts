import { prisma } from '@/lib/db'
import { cleanDatabase, createTestLobby, createTestPlayer } from '../utils/test-helpers'
import { POST as startGame } from '@/app/api/game/start/route'
import { POST as placeBet } from '@/app/api/game/bet/route'
import { POST as castVote } from '@/app/api/game/vote/route'
import { POST as voteWithBet } from '@/app/api/game/vote-with-bet/route'

describe('Betting and Voting Flow Integration Tests', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  afterEach(async () => {
    await cleanDatabase()
  })

  describe('Atomic Betting and Voting', () => {
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
      const startResponse = await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)
      expect(startResponse.status).toBe(200)

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
      const voteResponse = await castVote({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id
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

    it('should allow hedging strategy (bet on one player, vote for another)', async () => {
      const lobby = await createTestLobby('HEDGE1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)
      const dave = await createTestPlayer('Dave', lobby.id)

      // Give Bob points to bet
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 3 }
      })

      // Start game
      const startResponse = await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)
      expect(startResponse.status).toBe(200)

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
          amount: 1
        })
      } as any)
      expect(betResponse.status).toBe(200)

      // Bob votes for Dave (hedging)
      const voteResponse = await castVote({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: dave.id
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

    it('should handle voting without betting when player has no points', async () => {
      const lobby = await createTestLobby('NOPOINTS1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Bob has 0 points (default)
      const bobPlayer = await prisma.player.findUnique({ where: { id: bob.id } })
      expect(bobPlayer?.score).toBe(0)

      // Start game
      const startResponse = await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)
      expect(startResponse.status).toBe(200)

      // Set up voting phase
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
      const betData = await betResponse.json()
      expect(betData.error).toContain('Insufficient points')

      // But Bob can still vote
      const voteResponse = await castVote({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id
        })
      } as any)
      expect(voteResponse.status).toBe(200)

      // Verify no bet but vote exists
      const bet = await prisma.bet.findFirst({
        where: { roundId: round!.id, bettorId: bob.id }
      })
      const vote = await prisma.vote.findFirst({
        where: { roundId: round!.id, voterId: bob.id }
      })

      expect(bet).toBeNull()
      expect(vote).toBeTruthy()
    })
  })

  describe('Emergency Voting', () => {
    it('should disable betting during emergency votes', async () => {
      const lobby = await createTestLobby('EMRG1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Give Bob points
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 5 }
      })

      // Start game
      const startResponse = await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)
      expect(startResponse.status).toBe(200)

      // Set up emergency voting phase
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'EMERGENCY_VOTING',
          imposterId: charlie.id
        }
      })

      // Create emergency vote record
      await prisma.emergencyVote.create({
        data: {
          lobbyId: lobby.id,
          roundId: round!.id,
          initiatorId: bob.id
        }
      })

      // Bob should NOT be able to bet during emergency vote
      const betResponse = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 1
        })
      } as any)

      expect(betResponse.status).toBe(400)
      const betData = await betResponse.json()
      expect(betData.error).toContain('Betting is only allowed during voting phase')

      // But Bob can still vote
      const voteResponse = await castVote({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id
        })
      } as any)
      expect(voteResponse.status).toBe(200)
    })
  })

  describe('Race Condition Handling', () => {
    it('should prevent duplicate bets when concurrent requests are made', async () => {
      const lobby = await createTestLobby('RACE1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Give Bob points
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 10 }
      })

      // Start game
      const startResponse = await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)
      expect(startResponse.status).toBe(200)

      // Set up voting phase
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

      // Start game
      const startResponse = await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)
      expect(startResponse.status).toBe(200)

      // Set up voting phase
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
        castVote({
          json: async () => ({
            lobbyId: lobby.id,
            voterId: bob.id,
            suspectId: charlie.id
          })
        } as any)
      )

      const responses = await Promise.all(voteRequests)

      // Only one should succeed (others get 400 for "Already voted")
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

  describe('Phase Transition on Vote Completion', () => {
    it('should transition to next phase when all players vote', async () => {
      const lobby = await createTestLobby('TRANS1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Start game
      const startResponse = await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)
      expect(startResponse.status).toBe(200)

      // Set up voting phase with Alice as imposter
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: alice.id
        }
      })

      // Bob votes
      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: alice.id,
          bet: null
        })
      } as any)

      // Round should still be in VOTING
      let currentRound = await prisma.round.findUnique({ where: { id: round!.id } })
      expect(currentRound?.status).toBe('VOTING')

      // Charlie votes
      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: charlie.id,
          suspectId: alice.id,
          bet: null
        })
      } as any)

      // Still in VOTING (Alice hasn't voted)
      currentRound = await prisma.round.findUnique({ where: { id: round!.id } })
      expect(currentRound?.status).toBe('VOTING')

      // Alice votes (completes all votes)
      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: alice.id,
          suspectId: bob.id, // Imposter tries to frame Bob
          bet: null
        })
      } as any)

      // Should transition to GUESSING since imposter was caught
      currentRound = await prisma.round.findUnique({ where: { id: round!.id } })
      expect(currentRound?.status).toBe('GUESSING')
    })

    it('should not wait for bets to transition phases', async () => {
      const lobby = await createTestLobby('TRANS2', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Give both Bob and Charlie points
      await prisma.player.updateMany({
        where: { id: { in: [bob.id, charlie.id] } },
        data: { score: 5 }
      })

      // Start game
      const startResponse = await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)
      expect(startResponse.status).toBe(200)

      // Set up voting phase
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

      // All players vote (Charlie doesn't bet, Bob already bet separately)
      await voteWithBet({
        json: async () => ({ lobbyId: lobby.id, voterId: bob.id, suspectId: alice.id, bet: null })
      } as any)
      await voteWithBet({
        json: async () => ({ lobbyId: lobby.id, voterId: charlie.id, suspectId: alice.id, bet: null })
      } as any)
      await voteWithBet({
        json: async () => ({ lobbyId: lobby.id, voterId: alice.id, suspectId: bob.id, bet: null })
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

  describe('Imposter Cannot Bet', () => {
    it('should prevent the imposter from betting', async () => {
      const lobby = await createTestLobby('IMP1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Give Charlie (imposter) points
      await prisma.player.update({
        where: { id: charlie.id },
        data: { score: 10 }
      })

      // Start game
      const startResponse = await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)
      expect(startResponse.status).toBe(200)

      // Set up voting phase with Charlie as imposter
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: charlie.id
        }
      })

      // Charlie (imposter) tries to bet
      const betResponse = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: charlie.id,
          targetId: bob.id,
          amount: 1
        })
      } as any)

      expect(betResponse.status).toBe(400)
      const data = await betResponse.json()
      expect(data.error).toContain('Cannot place bet')

      // But Charlie can vote (to frame someone)
      const voteResponse = await castVote({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: charlie.id,
          suspectId: bob.id
        })
      } as any)
      expect(voteResponse.status).toBe(200)
    })
  })
})