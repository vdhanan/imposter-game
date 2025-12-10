import { prisma } from '@/lib/db'
import { cleanDatabase, createTestLobby, createTestPlayer } from '../utils/test-helpers'
import { POST as startGame } from '@/app/api/game/start/route'
import { POST as placeBet } from '@/app/api/game/bet/route'

describe('Betting Integration Tests (during Voting Phase)', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  afterAll(async () => {
    await cleanDatabase()
    await prisma.$disconnect()
  })

  describe('Betting Eligibility', () => {
    it('should allow players with positive points to bet', async () => {
      const lobby = await createTestLobby('BET1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Set scores
      await prisma.player.update({
        where: { id: alice.id },
        data: { score: 5 }
      })
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 3 }
      })
      await prisma.player.update({
        where: { id: charlie.id },
        data: { score: 2 }
      })

      // Start game
      const startRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: alice.id
        })
      } as any

      await startGame(startRequest)

      // Create a betting round (alice is imposter)
      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: alice.id
        }
      })

      // Bob can bet (has 3 points)
      const betRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 2
        })
      } as any

      const response = await placeBet(betRequest)
      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('should prevent players with zero points from betting', async () => {
      const lobby = await createTestLobby('BET2', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Set Bob's score to 0
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 0 }
      })

      // Start game and setup betting round
      const startRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: alice.id
        })
      } as any

      await startGame(startRequest)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: alice.id
        }
      })

      // Bob cannot bet (has 0 points)
      const betRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 1
        })
      } as any

      const response = await placeBet(betRequest)
      const data = await response.json()
      expect(response.status).toBe(400)
      expect(data.error).toContain('Insufficient points')
    })

    it('should prevent players with negative points from betting', async () => {
      const lobby = await createTestLobby('BET3', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Set Bob's score to negative
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: -2 }
      })

      // Start game and setup betting round
      const startRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: alice.id
        })
      } as any

      await startGame(startRequest)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: alice.id
        }
      })

      // Bob cannot bet (has negative points)
      const betRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 1
        })
      } as any

      const response = await placeBet(betRequest)
      const data = await response.json()
      expect(response.status).toBe(400)
      expect(data.error).toContain('Insufficient points')
    })
  })

  describe('Betting During Voting Phase', () => {
    it('should allow eligible players to bet during voting phase', async () => {
      const lobby = await createTestLobby('BET4', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Set scores - alice has 5, bob has 3, charlie has 0
      await prisma.player.update({
        where: { id: alice.id },
        data: { score: 5 }
      })
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 3 }
      })
      await prisma.player.update({
        where: { id: charlie.id },
        data: { score: 0 }
      })

      // Start game
      const startRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: alice.id
        })
      } as any

      await startGame(startRequest)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: alice.id // Alice is imposter
        }
      })

      // Bob places bet (only eligible non-imposter player)
      const betRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: alice.id,
          amount: 2
        })
      } as any

      await placeBet(betRequest)

      // Verify bet was placed successfully during voting phase
      const bet = await prisma.bet.findFirst({
        where: {
          roundId: round!.id,
          bettorId: bob.id
        }
      })

      expect(bet).toBeTruthy()
      expect(bet?.targetId).toBe(alice.id)
      expect(bet?.amount).toBe(2)

      // Round should still be in VOTING status
      const updatedRound = await prisma.round.findFirst({
        where: { id: round!.id }
      })
      expect(updatedRound!.status).toBe('VOTING')
    })

    it('should allow betting during voting phase even if not all players bet', async () => {
      const lobby = await createTestLobby('BET5', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Set scores - bob and charlie both have points
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 3 }
      })
      await prisma.player.update({
        where: { id: charlie.id },
        data: { score: 2 }
      })

      // Start game
      const startRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: alice.id
        })
      } as any

      await startGame(startRequest)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: alice.id
        }
      })

      // Bob places a bet but Charlie doesn't
      const bobBetRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: alice.id,
          amount: 1
        })
      } as any

      const response = await placeBet(bobBetRequest)
      expect(response.status).toBe(200)

      // Verify Bob's bet exists
      const bobBet = await prisma.bet.findFirst({
        where: {
          roundId: round!.id,
          bettorId: bob.id
        }
      })
      expect(bobBet).toBeTruthy()

      // Verify Charlie can still bet later if they want
      const charlieBetRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: charlie.id,
          targetId: bob.id,
          amount: 2
        })
      } as any

      const response2 = await placeBet(charlieBetRequest)
      expect(response2.status).toBe(200)

      // Both bets should exist
      const allBets = await prisma.bet.findMany({
        where: { roundId: round!.id }
      })
      expect(allBets).toHaveLength(2)
    })

    it('should handle race conditions when multiple clients try to complete betting', async () => {
      const lobby = await createTestLobby('BET6', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Set scores so Bob can bet
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 5 }  // Bob needs points to bet
      })
      await prisma.player.update({
        where: { id: charlie.id },
        data: { score: 3 }
      })

      // Start game
      const startRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: alice.id
        })
      } as any

      await startGame(startRequest)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: alice.id
        }
      })

      // Simulate Bob trying to place the same bet multiple times simultaneously
      const bobBetRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: alice.id,
          amount: 1
        })
      } as any

      const [response1, response2, response3] = await Promise.all([
        placeBet(bobBetRequest),
        placeBet(bobBetRequest),
        placeBet(bobBetRequest)
      ])

      // Only one should succeed
      const successfulResponses = [response1, response2, response3]
        .filter(r => r.status === 200)
      const failedResponses = [response1, response2, response3]
        .filter(r => r.status === 400)

      expect(successfulResponses).toHaveLength(1)
      expect(failedResponses).toHaveLength(2)

      // Verify only one bet was created
      const bobBets = await prisma.bet.findMany({
        where: {
          roundId: round!.id,
          bettorId: bob.id
        }
      })
      expect(bobBets).toHaveLength(1)
    })

    it('should prevent betting when no players have points', async () => {
      const lobby = await createTestLobby('BET7', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // All players have 0 or negative points
      await prisma.player.update({
        where: { id: alice.id },
        data: { score: 0 }
      })
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: -1 }
      })
      await prisma.player.update({
        where: { id: charlie.id },
        data: { score: 0 }
      })

      // Start game
      const startRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: alice.id
        })
      } as any

      await startGame(startRequest)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: bob.id // Bob is imposter
        }
      })

      // Try to place a bet - all players have zero points so no one can bet
      const betRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: alice.id,
          targetId: charlie.id,
          amount: 1
        })
      } as any

      const response = await placeBet(betRequest)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Insufficient points')

      // No bets should exist
      const bets = await prisma.bet.findMany({
        where: { roundId: round!.id }
      })
      expect(bets).toHaveLength(0)
    })
  })

  describe('Betting Amount Validation', () => {
    it('should limit bet amount to minimum of 3 or player score', async () => {
      const lobby = await createTestLobby('BET8', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Bob has 2 points
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 2 }
      })

      // Start game and setup betting
      const startRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: alice.id
        })
      } as any

      await startGame(startRequest)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: alice.id
        }
      })

      // Bob tries to bet 3 (more than his score)
      const betRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 3
        })
      } as any

      const response = await placeBet(betRequest)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Insufficient points')

      // Bob bets 2 (his max)
      const validBetRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 2
        })
      } as any

      const response2 = await placeBet(validBetRequest)
      const data2 = await response2.json()

      expect(response2.status).toBe(200)
      expect(data2.success).toBe(true)
    })
  })
})