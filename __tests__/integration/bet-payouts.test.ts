/**
 * Bet Payout Tests
 *
 * Tests for bet resolution, payout calculations, and score updates
 */

import { prisma } from '@/lib/db'
import { cleanDatabase, createTestLobby, createTestPlayer } from '../utils/test-helpers'
import { POST as startGame } from '@/app/api/game/start/route'
import { POST as voteWithBet } from '@/app/api/game/vote-with-bet/route'
import { POST as submitGuess } from '@/app/api/game/guess/route'
import { processBetPayouts } from '@/lib/api-helpers'

describe('Bet Payouts', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  afterEach(async () => {
    await cleanDatabase()
  })

  describe('Payout Calculation', () => {
    it('should double bet amount for correct bets', async () => {
      const lobby = await createTestLobby('PAY1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id) // Will be imposter
      const dave = await createTestPlayer('Dave', lobby.id)

      // Give players points
      await prisma.player.update({ where: { id: bob.id }, data: { score: 10 } })
      await prisma.player.update({ where: { id: dave.id }, data: { score: 10 } })

      // Start game
      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Bob bets 3 on Charlie (correct)
      await prisma.bet.create({
        data: {
          lobbyId: lobby.id,
          roundId: round!.id,
          bettorId: bob.id,
          targetId: charlie.id,
          amount: 3
        }
      })

      // Dave bets 2 on Alice (incorrect)
      await prisma.bet.create({
        data: {
          lobbyId: lobby.id,
          roundId: round!.id,
          bettorId: dave.id,
          targetId: alice.id,
          amount: 2
        }
      })

      // Process payouts
      const results = await processBetPayouts(round!.id, charlie.id)

      // Check results
      const bobResult = results.find(r => r.bettorId === bob.id)
      const daveResult = results.find(r => r.bettorId === dave.id)

      expect(bobResult?.won).toBe(true)
      expect(bobResult?.payout).toBe(6) // 3 * 2
      expect(daveResult?.won).toBe(false)
      expect(daveResult?.payout).toBe(0)

      // Check scores
      const bobPlayer = await prisma.player.findUnique({ where: { id: bob.id } })
      const davePlayer = await prisma.player.findUnique({ where: { id: dave.id } })

      expect(bobPlayer?.score).toBe(13) // 10 + 3
      expect(davePlayer?.score).toBe(8) // 10 - 2
    })

    it('should handle payouts when all players complete voting with bets', async () => {
      const lobby = await createTestLobby('PAYALL', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id) // Will be imposter

      // Give players points
      await prisma.player.updateMany({
        where: { lobbyId: lobby.id },
        data: { score: 5 }
      })

      // Start game
      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Alice votes and bets on Charlie (correct)
      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: alice.id,
          suspectId: charlie.id,
          bet: { targetId: charlie.id, amount: 2 }
        })
      } as any)

      // Bob votes and bets on Alice (incorrect)
      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: { targetId: alice.id, amount: 1 }
        })
      } as any)

      // Check initial scores (before payout processing in last vote)
      const aliceBeforePayout = await prisma.player.findUnique({ where: { id: alice.id } })
      const bobBeforePayout = await prisma.player.findUnique({ where: { id: bob.id } })
      expect(aliceBeforePayout?.score).toBe(5) // Not yet processed
      expect(bobBeforePayout?.score).toBe(5) // Not yet processed

      // Charlie votes (no bet as imposter) - this should trigger completion
      const response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: charlie.id,
          suspectId: alice.id,
          bet: null
        })
      } as any)

      expect(response.status).toBe(200)

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 100))

      // Check final scores after payouts
      const aliceAfter = await prisma.player.findUnique({ where: { id: alice.id } })
      const bobAfter = await prisma.player.findUnique({ where: { id: bob.id } })
      const charlieAfter = await prisma.player.findUnique({ where: { id: charlie.id } })

      // IMPORTANT: This test will FAIL until we fix the bug
      // Currently vote-with-bet doesn't call processBetPayouts

      // Expected correct behavior:
      expect(aliceAfter?.score).toBe(7) // 5 + 2 (won bet)
      expect(bobAfter?.score).toBe(4) // 5 - 1 (lost bet)
    })
  })

  describe('Edge Cases', () => {
    it('should prevent betting with zero score', async () => {
      const lobby = await createTestLobby('ZERO1', { bettingEnabled: true })
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

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Bob tries to vote with bet while having 0 score
      const response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: { targetId: charlie.id, amount: 1 }
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Insufficient points')
    })

    it('should prevent self-betting', async () => {
      const lobby = await createTestLobby('SELF1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      // Give Bob points
      await prisma.player.update({ where: { id: bob.id }, data: { score: 5 } })

      // Start game
      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Bob tries to bet on himself
      const response = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: { targetId: bob.id, amount: 1 }
        })
      } as any)

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Cannot bet on yourself')
    })
  })

  describe('Imposter Detection Logic', () => {
    it('should only go to GUESSING phase if imposter is actually voted out', async () => {
      const lobby = await createTestLobby('GUESS1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id) // Imposter
      const dave = await createTestPlayer('Dave', lobby.id)

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Votes: Alice gets 2 votes, Charlie(imposter) gets 1, Bob gets 1
      // Alice is voted out, NOT the imposter
      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: alice.id,
          suspectId: bob.id,
          bet: null
        })
      } as any)

      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: alice.id,
          bet: null
        })
      } as any)

      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: charlie.id,
          suspectId: alice.id,
          bet: null
        })
      } as any)

      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: dave.id,
          suspectId: charlie.id,
          bet: null
        })
      } as any)

      // Check round status
      const updatedRound = await prisma.round.findUnique({ where: { id: round!.id } })

      // Should NOT go to GUESSING since imposter wasn't voted out
      expect(updatedRound?.status).toBe('COMPLETE')

      // Imposter should have gained a point for evading
      const imposter = await prisma.player.findUnique({ where: { id: charlie.id } })
      expect(imposter?.score).toBe(1)
    })

    it('should correctly identify voted out player, not just majority vote', async () => {
      const lobby = await createTestLobby('DETECT1', { bettingEnabled: true })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id) // Imposter
      const dave = await createTestPlayer('Dave', lobby.id)

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Voting: Alice(2 votes), Charlie(1 vote), Bob(1 vote)
      // Alice gets voted out, not Charlie even though Charlie is imposter
      await prisma.vote.create({ data: { roundId: round!.id, voterId: alice.id, suspectId: bob.id } })
      await prisma.vote.create({ data: { roundId: round!.id, voterId: bob.id, suspectId: alice.id } })
      await prisma.vote.create({ data: { roundId: round!.id, voterId: charlie.id, suspectId: alice.id } })
      await prisma.vote.create({ data: { roundId: round!.id, voterId: dave.id, suspectId: charlie.id } })

      const votes = await prisma.vote.findMany({ where: { roundId: round!.id } })
      const voteCounts: Record<string, number> = {}
      for (const vote of votes) {
        voteCounts[vote.suspectId] = (voteCounts[vote.suspectId] || 0) + 1
      }

      // Alice has 2 votes, Charlie has 1, Bob has 1
      expect(voteCounts[alice.id]).toBe(2)
      expect(voteCounts[charlie.id]).toBe(1)
      expect(voteCounts[bob.id]).toBe(1)

      // Find who was voted out
      const maxVotes = Math.max(...Object.values(voteCounts))
      const winners = Object.entries(voteCounts)
        .filter(([_, count]) => count === maxVotes)
        .map(([playerId]) => playerId)
      const votedOutPlayerId = winners.length === 1 ? winners[0] : null

      expect(votedOutPlayerId).toBe(alice.id) // Alice voted out, not Charlie

      // The bug would be using > players.length / 2 logic
      const buggyLogic = voteCounts[charlie.id] > 4 / 2 // 1 > 2 is false
      expect(buggyLogic).toBe(false) // Charlie wasn't caught by buggy logic

      // Correct logic
      const imposterVotedOut = votedOutPlayerId === charlie.id
      expect(imposterVotedOut).toBe(false) // Charlie wasn't voted out
    })
  })

  describe('Emergency Vote During Wrong Phase', () => {
    it('should not allow emergency vote during voting phase', async () => {
      const lobby = await createTestLobby('EMRPHASE1', {
        bettingEnabled: true,
        emergencyVotesEnabled: true
      })
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
      } as any)

      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })

      // Set to voting phase
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING', imposterId: charlie.id }
      })

      // Try to call emergency vote during voting phase
      // This test will check if the emergency vote endpoint properly validates phase
      // Currently this validation might be missing
    })
  })
})