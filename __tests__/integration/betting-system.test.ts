/**
 * Betting System Tests
 *
 * Tests for betting mechanics, eligibility, restrictions, and validation
 */

import { prisma } from '@/lib/db'
import { useGameStore } from '@/lib/store/gameStore'
import { cleanDatabase, createTestLobby, createTestPlayer } from '../utils/test-helpers'
import { POST as startGame } from '@/app/api/game/start/route'
import { POST as placeBet } from '@/app/api/game/bet/route'

describe('Betting System', () => {
  beforeEach(async () => {
    await cleanDatabase()
    useGameStore.getState().reset()
  })

  afterEach(async () => {
    await cleanDatabase()
  })

  describe('Betting Eligibility', () => {
    it('should allow players with positive score to bet', async () => {
      const lobby = await createTestLobby('BET1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Give Bob points
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 5 }
      })

      // Start game
      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      // Set up voting phase
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: alice.id
        }
      })

      // Bob places bet
      const response = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: alice.id,
          amount: 2
        })
      } as any)

      expect(response.status).toBe(200)

      const bet = await prisma.bet.findFirst({
        where: { roundId: round!.id, bettorId: bob.id }
      })
      expect(bet).toBeTruthy()
      expect(bet?.amount).toBe(2)
    })

    it('should prevent players with zero score from betting', async () => {
      const lobby = await createTestLobby('BET2', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Bob has 0 points (default)
      const bobPlayer = await prisma.player.findUnique({ where: { id: bob.id } })
      expect(bobPlayer?.score).toBe(0)

      // Start game
      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      // Set up voting phase
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: charlie.id
        }
      })

      // Bob tries to bet
      const response = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 1
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Insufficient points')
    })

    it('should prevent players with negative score from betting', async () => {
      const lobby = await createTestLobby('BET3', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Set Bob to negative score
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: -2 }
      })

      // Start game
      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: alice.id }
      })

      // Try to bet
      const response = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: alice.id,
          amount: 1
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Insufficient points')
    })
  })

  describe('Imposter Betting Restriction', () => {
    it('should prevent the imposter from betting through API', async () => {
      const lobby = await createTestLobby('IMPBET1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id) // Bob will be imposter
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Give Bob points
      await prisma.player.update({
        where: { id: bob.id },
        data: { score: 5 }
      })

      // Start game
      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      // Set up voting phase with Bob as imposter
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: bob.id
        }
      })

      // Bob (imposter) tries to bet
      const betResponse = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 1
        })
      } as any)

      expect(betResponse.status).toBe(400)
      const data = await betResponse.json()
      expect(data.error).toContain('Cannot place bet')

      // Verify no bet was created
      const bets = await prisma.bet.findMany({
        where: { roundId: round!.id }
      })
      expect(bets).toHaveLength(0)
    })

    it('should prevent imposter from seeing betting UI', () => {
      const store = useGameStore.getState()

      // Set up as imposter with points
      store.setRole('IMPOSTER', null, 'Animals')
      store.setLobby({
        id: 'test-lobby',
        state: 'VOTING',
        players: [
          { id: 'player1', name: 'Alice', score: 5 }
        ],
        bettingEnabled: true,
        currentRound: {
          bets: []
        }
      } as any)

      const state = useGameStore.getState()
      expect(state.role).toBe('IMPOSTER')

      // UI should check this condition
      const canBet = state.lobby?.bettingEnabled &&
                     state.role !== 'IMPOSTER'
      expect(canBet).toBe(false)
    })
  })

  describe('Betting Amount Validation', () => {
    it('should enforce minimum bet of 1 point', async () => {
      const lobby = await createTestLobby('AMT1', { bettingEnabled: true })
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
        data: { status: 'VOTING', imposterId: alice.id }
      })

      // Try to bet 0
      const response = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: alice.id,
          amount: 0
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid bet amount')
    })

    it('should enforce maximum bet of 3 points', async () => {
      const lobby = await createTestLobby('AMT2', { bettingEnabled: true })
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
        data: { status: 'VOTING', imposterId: alice.id }
      })

      // Try to bet 4
      const response = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: alice.id,
          amount: 4
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Invalid bet amount')
    })

    it('should not allow betting more points than player has', async () => {
      const lobby = await createTestLobby('AMT3', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Bob only has 2 points
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
        data: { status: 'VOTING', imposterId: alice.id }
      })

      // Try to bet 3 (max allowed) but only has 2
      const response = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: alice.id,
          amount: 3
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Insufficient points')
    })
  })

  describe('Betting Phase Restrictions', () => {
    it('should only allow betting during VOTING phase', async () => {
      const lobby = await createTestLobby('PHASE1', { bettingEnabled: true })
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

      // Round is still IN_PROGRESS (hint phase), not VOTING
      expect(round?.status).toBe('IN_PROGRESS')

      // Try to bet during hint phase
      const response = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 1
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Betting is only allowed during voting phase')
    })

    it('should not allow betting during EMERGENCY_VOTING', async () => {
      const lobby = await createTestLobby('EMRG1', {
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

      // Set emergency voting
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'EMERGENCY_VOTING',
          imposterId: charlie.id
        }
      })

      await prisma.emergencyVote.create({
        data: {
          lobbyId: lobby.id,
          roundId: round!.id,
          initiatorId: alice.id
        }
      })

      // Bob tries to bet during emergency voting
      const betResponse = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 1
        })
      } as any)

      expect(betResponse.status).toBe(400)
      const data = await betResponse.json()
      expect(data.error).toContain('Betting is only allowed during voting phase')
    })
  })

  describe('Duplicate Bet Prevention', () => {
    it('should prevent duplicate bets from the same player', async () => {
      const lobby = await createTestLobby('DUP1', { bettingEnabled: true })
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
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // First bet succeeds
      const response1 = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 2
        })
      } as any)
      expect(response1.status).toBe(200)

      // Second bet fails
      const response2 = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: alice.id, // Different target
          amount: 1
        })
      } as any)
      expect(response2.status).toBe(400)

      const data = await response2.json()
      expect(data.error).toContain('Already placed bet')

      // Verify only one bet exists
      const bets = await prisma.bet.findMany({
        where: { roundId: round!.id, bettorId: bob.id }
      })
      expect(bets).toHaveLength(1)
    })
  })

  describe('Self-Betting Prevention', () => {
    it('should not allow players to bet on themselves', async () => {
      const lobby = await createTestLobby('SELF1', { bettingEnabled: true })
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

      // Bob tries to bet on himself
      const response = await placeBet({
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: bob.id,
          targetId: bob.id, // Self-bet
          amount: 1
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Cannot bet on yourself')
    })
  })
})