import { prisma } from '@/lib/db'
import { cleanDatabase, createTestLobby, createTestPlayer } from '../utils/test-helpers'
import { POST as startGame } from '@/app/api/game/start/route'
import { POST as voteWithBet } from '@/app/api/game/vote-with-bet/route'
import { POST as submitHint } from '@/app/api/game/hint/route'

describe('Betting and Voting Atomic Operations', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  afterEach(async () => {
    await cleanDatabase()
  })

  describe('Atomic Transactions', () => {
    it('should create vote and bet atomically in a single transaction', async () => {
      const lobby = await createTestLobby('ATOMIC1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Give Bob points to bet
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 5 }
      })

      // Start game and setup voting phase
      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Submit vote with bet atomically
      const response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: {
            targetId: charlie.id,
            amount: 2
          }
        })
      } as any)

      expect(response.status).toBe(200)

      // Verify both were created
      const [vote, bet] = await Promise.all([
        prisma.vote.findFirst({ where: { roundId: round!.id, voterId: bob.id } }),
        prisma.bet.findFirst({ where: { roundId: round!.id, bettorId: bob.id } })
      ])

      expect(vote).toBeTruthy()
      expect(vote?.suspectId).toBe(charlie.id)
      expect(bet).toBeTruthy()
      expect(bet?.targetId).toBe(charlie.id)
      expect(bet?.amount).toBe(2)
    })

    it('should rollback bet if vote creation fails', async () => {
      const lobby = await createTestLobby('ROLLBACK1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

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
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Create a vote first to cause duplicate error
      await prisma.vote.create({
        data: { roundId: round!.id, voterId: bob.id, suspectId: alice.id }
      })

      // Try to vote again with bet - should fail atomically
      const response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: {
            targetId: charlie.id,
            amount: 2
          }
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Already voted')

      // Verify no bet was created
      const bet = await prisma.bet.findFirst({
        where: { roundId: round!.id, bettorId: bob.id }
      })
      expect(bet).toBeNull()
    })

    it('should handle vote without bet correctly', async () => {
      const lobby = await createTestLobby('NOBET1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Submit vote without bet
      const response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: null
        })
      } as any)

      expect(response.status).toBe(200)

      // Verify only vote was created
      const [vote, bet] = await Promise.all([
        prisma.vote.findFirst({ where: { roundId: round!.id, voterId: bob.id } }),
        prisma.bet.findFirst({ where: { roundId: round!.id, bettorId: bob.id } })
      ])

      expect(vote).toBeTruthy()
      expect(bet).toBeNull()
    })
  })

  describe('Betting Validation Rules', () => {
    it('should prevent imposter from betting', async () => {
      const lobby = await createTestLobby('IMPBET1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      await prisma.player.update({
        where: { id: charlie.id },
        data: { score: 5 }
      })

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Imposter tries to bet
      const response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: charlie.id,
          suspectId: bob.id,
          bet: {
            targetId: bob.id,
            amount: 2
          }
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Cannot place bet')
    })

    it('should validate bet amount constraints', async () => {
      const lobby = await createTestLobby('BETAMT1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 2 }
      })

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Try to bet more than allowed (>3)
      let response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: {
            targetId: charlie.id,
            amount: 4
          }
        })
      } as any)

      expect(response.status).toBe(400)
      let data = await response.json()
      expect(data.error).toBe('Bet amount must be between 1 and 3')

      // Try to bet more than player has
      response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: {
            targetId: charlie.id,
            amount: 3
          }
        })
      } as any)

      expect(response.status).toBe(400)
      data = await response.json()
      expect(data.error).toBe('Insufficient points for bet')
    })

    it('should prevent betting on yourself', async () => {
      const lobby = await createTestLobby('SELFBET1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

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
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Try to bet on self
      const response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: {
            targetId: bob.id,  // Betting on self
            amount: 2
          }
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Cannot bet on yourself')
    })

    it('should prevent betting during emergency vote', async () => {
      const lobby = await createTestLobby('EMERGBET1', {
        bettingEnabled: true,
        emergencyVotesEnabled: true
      })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

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
        data: { status: 'EMERGENCY_VOTING', imposterId: charlie.id }
      })

      // Try to bet during emergency vote
      const response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: {
            targetId: charlie.id,
            amount: 2
          }
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toBe('Cannot bet during emergency voting')
    })
  })

  describe('Strategic Betting Patterns', () => {
    it('should allow betting on one player while voting for another', async () => {
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
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Bob hedges: bets on Charlie, votes for Dave
      const response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: dave.id,  // Vote for Dave
          bet: {
            targetId: charlie.id,  // Bet on Charlie
            amount: 1
          }
        })
      } as any)

      expect(response.status).toBe(200)

      // Verify hedge was recorded correctly
      const [vote, bet] = await Promise.all([
        prisma.vote.findFirst({ where: { roundId: round!.id, voterId: bob.id } }),
        prisma.bet.findFirst({ where: { roundId: round!.id, bettorId: bob.id } })
      ])

      expect(vote?.suspectId).toBe(dave.id)
      expect(bet?.targetId).toBe(charlie.id)
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent vote+bet submissions gracefully', async () => {
      const lobby = await createTestLobby('RACE1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)
      const dave = await createTestPlayer('Dave', lobby.id)

      await Promise.all([
        prisma.player.update({ where: { id: bob.id }, data: { score: 5 } }),
        prisma.player.update({ where: { id: charlie.id }, data: { score: 5 } })
      ])

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: dave.id }
      })

      // Submit multiple votes concurrently
      const responses = await Promise.all([
        voteWithBet({
          json: async () => ({
            lobbyId: lobby.id,
            voterId: bob.id,
            suspectId: dave.id,
            bet: { targetId: dave.id, amount: 2 }
          })
        } as any),
        voteWithBet({
          json: async () => ({
            lobbyId: lobby.id,
            voterId: charlie.id,
            suspectId: dave.id,
            bet: { targetId: dave.id, amount: 1 }
          })
        } as any)
      ])

      // All should succeed
      expect(responses[0].status).toBe(200)
      expect(responses[1].status).toBe(200)

      // Verify all created correctly
      const [votes, bets] = await Promise.all([
        prisma.vote.findMany({ where: { roundId: round!.id } }),
        prisma.bet.findMany({ where: { roundId: round!.id } })
      ])

      expect(votes).toHaveLength(2)
      expect(bets).toHaveLength(2)
    })
  })
})