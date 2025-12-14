import { describe, it, expect, beforeEach, afterAll } from '@jest/globals'
import { prisma } from '@/lib/db'
import { createTestLobby, createTestPlayer, cleanDatabase } from '../utils/test-helpers'
import { POST as removePlayer } from '@/app/api/game/remove-player/route'
import { POST as startGame } from '@/app/api/game/start/route'
import { POST as submitHint } from '@/app/api/game/hint/route'
import { POST as vote } from '@/app/api/game/vote/route'
import { POST as callEmergencyVote } from '@/app/api/game/emergency-vote/route'
import { POST as placeBet } from '@/app/api/game/bet/route'

describe('Player Removal and Disconnection', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  afterAll(async () => {
    await cleanDatabase()
    await prisma.$disconnect()
  })

  describe('Basic Removal Mechanics', () => {
    it('should allow host to remove a player during LOBBY phase', async () => {
      const lobby = await createTestLobby('REMOVE1', {})
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Player1', lobby.id),
        createTestPlayer('Player2', lobby.id),
        createTestPlayer('ToRemove', lobby.id)
      ])

      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[3].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      const updatedLobby = await prisma.lobby.findUnique({
        where: { id: lobby.id },
        include: { players: true }
      })

      // Player should be marked as offline, not deleted
      expect(updatedLobby?.players.length).toBe(4)
      const removedPlayer = updatedLobby?.players.find(p => p.id === players[3].id)
      expect(removedPlayer?.isOnline).toBe(false)
    })

    it('should not allow non-host to remove players', async () => {
      const lobby = await createTestLobby('REMOVE2', {})
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('NonHost', lobby.id),
        createTestPlayer('Target', lobby.id)
      ])

      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[1].id, // Non-host trying to remove
          playerIdToRemove: players[2].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(403)
    })

    it('should not allow removal if it would drop below 3 players', async () => {
      const lobby = await createTestLobby('REMOVE3', {})
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Player1', lobby.id),
        createTestPlayer('Player2', lobby.id)
      ])

      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[2].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('minimum')
    })
  })

  describe('Removal During HINTS Phase', () => {
    it('should skip removed player turn if it is their turn', async () => {
      const lobby = await createTestLobby('HINTS1', {})
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Player1', lobby.id),
        createTestPlayer('CurrentTurn', lobby.id),
        createTestPlayer('NextPlayer', lobby.id)
      ])

      // Start game
      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: players[0].id })
      } as Request)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      // Set current turn to Player2 (index 2)
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          currentTurn: 2,
          turnOrder: players.map(p => p.id)
        }
      })

      // Remove the current turn player
      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[2].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      const updatedRound = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      // Turn should advance to next player
      expect(updatedRound?.turnOrder).not.toContain(players[2].id)
      expect(updatedRound?.currentTurn).toBe(2) // Same index, but now points to NextPlayer
    })

    it('should preserve existing hints from removed player', async () => {
      const lobby = await createTestLobby('HINTS2', {})
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('HintGiver', lobby.id),
        createTestPlayer('Player2', lobby.id),
        createTestPlayer('Player3', lobby.id) // Need 4 players to remove 1 and still have 3
      ])

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: players[0].id })
      } as Request)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      // Create a hint from the player
      await prisma.hint.create({
        data: {
          roundId: round!.id,
          playerId: players[1].id,
          text: 'TestHint',
          turnIndex: 0
        }
      })

      // Remove the player who gave the hint
      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[1].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      // Hint should still exist
      const hints = await prisma.hint.findMany({
        where: { roundId: round!.id }
      })
      expect(hints.length).toBe(1)
      expect(hints[0].text).toBe('TestHint')
    })
  })

  describe('Removal During VOTING Phase', () => {
    it('should reduce vote requirement when player is removed', async () => {
      const lobby = await createTestLobby('VOTE1', {})
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Player1', lobby.id),
        createTestPlayer('Player2', lobby.id),
        createTestPlayer('ToRemove', lobby.id)
      ])

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: players[0].id })
      } as Request)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      // Set round to VOTING phase
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING' }
      })

      // Two players vote
      await prisma.vote.create({
        data: {
          roundId: round!.id,
          voterId: players[0].id,
          suspectId: players[1].id
        }
      })

      await prisma.vote.create({
        data: {
          roundId: round!.id,
          voterId: players[1].id,
          suspectId: players[2].id
        }
      })

      // Remove a player who hasn't voted
      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[3].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      // Now submit final vote from remaining player
      const voteRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          voterId: players[2].id,
          suspectId: players[0].id
        })
      } as Request

      // Check if voting already completed after player removal
      const roundBeforeVote = await prisma.round.findFirst({
        where: { id: round!.id }
      })

      if (roundBeforeVote?.status === 'VOTING' || roundBeforeVote?.status === 'EMERGENCY_VOTING') {
        // Voting still active, submit the final vote
        const voteResponse = await vote(voteRequest)
        expect(voteResponse.status).toBe(200)
      }

      // Verify voting completed with reduced player count
      const updatedRound = await prisma.round.findFirst({
        where: { id: round!.id }
      })
      // The round should be past voting since we have all remaining players' votes
      expect(['GUESSING', 'COMPLETE']).toContain(updatedRound?.status)
    })

    it('should preserve votes from removed player', async () => {
      const lobby = await createTestLobby('VOTE2', {})
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Voter', lobby.id),
        createTestPlayer('Target', lobby.id),
        createTestPlayer('Player3', lobby.id) // Need 4 players
      ])

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: players[0].id })
      } as Request)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'VOTING' }
      })

      // Player votes then gets removed
      await prisma.vote.create({
        data: {
          roundId: round!.id,
          voterId: players[1].id,
          suspectId: players[2].id
        }
      })

      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[1].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      // Vote should still exist
      const votes = await prisma.vote.findMany({
        where: { roundId: round!.id }
      })
      expect(votes.length).toBe(1)
      expect(votes[0].suspectId).toBe(players[2].id)
    })
  })

  describe('Imposter Removal Edge Cases', () => {
    it('should end round with civilian victory if imposter is removed during HINTS', async () => {
      const lobby = await createTestLobby('IMP1', {})
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Imposter', lobby.id),
        createTestPlayer('Civilian', lobby.id),
        createTestPlayer('Civilian2', lobby.id) // Need 4 players
      ])

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: players[0].id })
      } as Request)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      // Make Player1 the imposter
      await prisma.round.update({
        where: { id: round!.id },
        data: { imposterId: players[1].id }
      })

      // Remove the imposter
      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[1].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.roundEnded).toBe(true)
      expect(data.reason).toContain('Imposter left')

      // Civilians should get points
      const updatedPlayers = await prisma.player.findMany({
        where: { lobbyId: lobby.id }
      })

      const civilian = updatedPlayers.find(p => p.id === players[2].id)
      expect(civilian?.score).toBeGreaterThan(0)
      const civilian2 = updatedPlayers.find(p => p.id === players[3].id)
      expect(civilian2?.score).toBeGreaterThan(0)
    })

    it('should end round if imposter is removed during VOTING', async () => {
      const lobby = await createTestLobby('IMP2', {})
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Imposter', lobby.id),
        createTestPlayer('Civilian1', lobby.id),
        createTestPlayer('Civilian2', lobby.id)
      ])

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: players[0].id })
      } as Request)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      await prisma.round.update({
        where: { id: round!.id },
        data: {
          imposterId: players[1].id,
          status: 'VOTING'
        }
      })

      // Remove imposter during voting
      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[1].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      const updatedRound = await prisma.round.findFirst({
        where: { id: round!.id }
      })
      expect(updatedRound?.status).toBe('COMPLETE')
    })

    it('should end round and forfeit if imposter is removed during GUESSING phase', async () => {
      const lobby = await createTestLobby('IMP3', {})
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Imposter', lobby.id),
        createTestPlayer('Civilian', lobby.id),
        createTestPlayer('Civilian2', lobby.id) // Need 4 players
      ])

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: players[0].id })
      } as Request)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      await prisma.round.update({
        where: { id: round!.id },
        data: {
          imposterId: players[1].id,
          status: 'GUESSING'
        }
      })

      // Remove imposter during their guessing phase
      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[1].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.roundEnded).toBe(true)
      expect(data.reason).toContain('forfeit')
    })
  })

  describe('Betting System with Removal', () => {
    it('should forfeit bets placed by removed player', async () => {
      const lobby = await createTestLobby('BET1', { bettingEnabled: true })
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Bettor', lobby.id),
        createTestPlayer('Target', lobby.id),
        createTestPlayer('Player3', lobby.id)
      ])

      // Give bettor some points
      await prisma.player.update({
        where: { id: players[1].id },
        data: { score: 5 }
      })

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: players[0].id })
      } as Request)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      // Advance to voting phase for betting
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: players[3].id  // Make Player3 the imposter
        }
      })

      // Place a bet using the API
      const betRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: players[1].id,
          targetId: players[2].id,
          amount: 2
        })
      } as Request

      const betResponse = await placeBet(betRequest)
      expect(betResponse.status).toBe(200)

      // Remove the bettor
      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[1].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      // Bet should be marked as forfeited
      const bet = await prisma.bet.findFirst({
        where: { bettorId: players[1].id }
      })
      expect(bet?.payout).toBe(-bet?.amount!)
    })

    it('should refund bets placed ON removed player', async () => {
      const lobby = await createTestLobby('BET2', { bettingEnabled: true })
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Bettor', lobby.id),
        createTestPlayer('ToRemove', lobby.id),
        createTestPlayer('Player3', lobby.id)
      ])

      await prisma.player.update({
        where: { id: players[1].id },
        data: { score: 5 }
      })

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: players[0].id })
      } as Request)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      // Advance to voting phase for betting and set imposter
      await prisma.round.update({
        where: { id: round!.id },
        data: {
          status: 'VOTING',
          imposterId: players[3].id  // Player3 is imposter (not the one being removed)
        }
      })

      // Bet ON the player who will be removed using the API
      const betRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          bettorId: players[1].id,
          targetId: players[2].id,
          amount: 3
        })
      } as Request

      const betResponse = await placeBet(betRequest)
      expect(betResponse.status).toBe(200)

      // Remove the target of the bet
      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[2].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      // Bettor should get refund
      const bettor = await prisma.player.findUnique({
        where: { id: players[1].id }
      })
      expect(bettor?.score).toBe(5) // Original score, bet refunded
    })
  })

  describe('Emergency Vote with Removal', () => {
    it('should continue emergency vote if initiator is removed', async () => {
      const lobby = await createTestLobby('EMRG1', { emergencyVotesEnabled: true })
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Initiator', lobby.id),
        createTestPlayer('Player2', lobby.id),
        createTestPlayer('Player3', lobby.id)
      ])

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: players[0].id })
      } as Request)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      // Make sure the initiator is NOT the imposter
      await prisma.round.update({
        where: { id: round!.id },
        data: { imposterId: players[2].id } // Player2 is imposter, not the initiator
      })

      // Initiate emergency vote
      await callEmergencyVote({
        json: async () => ({
          lobbyId: lobby.id,
          initiatorId: players[1].id
        })
      } as Request)

      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'EMERGENCY_VOTING' }
      })

      // Remove the initiator
      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[1].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      // Emergency vote should continue
      const updatedRound = await prisma.round.findFirst({
        where: { id: round!.id }
      })
      expect(updatedRound?.status).toBe('EMERGENCY_VOTING')
    })
  })

  describe('Host Transfer on Disconnection', () => {
    it('should transfer host to next player if host is removed', async () => {
      const lobby = await createTestLobby('HOST1', {})
      const players = await Promise.all([
        createTestPlayer('OldHost', lobby.id, true),
        createTestPlayer('NewHost', lobby.id),
        createTestPlayer('Player2', lobby.id),
        createTestPlayer('Player3', lobby.id) // Need 4 players
      ])

      // Host removes themselves (edge case)
      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[0].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(200)

      const updatedLobby = await prisma.lobby.findUnique({
        where: { id: lobby.id },
        include: { players: true }
      })

      // Host should transfer to one of the remaining online players
      const remainingOnlinePlayers = updatedLobby?.players.filter(p => p.isOnline) || []
      expect(remainingOnlinePlayers.length).toBe(3)
      expect(updatedLobby?.ownerId).not.toBe(players[0].id)
      expect(remainingOnlinePlayers.some(p => p.id === updatedLobby?.ownerId)).toBe(true)
    })
  })

  describe('Blocked Removal Phases', () => {
    it('should not allow removal during ROUND_RESULTS', async () => {
      const lobby = await createTestLobby('BLOCK1', {})
      const players = await Promise.all([
        createTestPlayer('Host', lobby.id, true),
        createTestPlayer('Player1', lobby.id),
        createTestPlayer('Player2', lobby.id),
        createTestPlayer('Player3', lobby.id) // Need 4 players
      ])

      await startGame({
        json: async () => ({ lobbyId: lobby.id, playerId: players[0].id })
      } as Request)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })

      // Set lobby state to ROUND_RESULTS (not just round status)
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'COMPLETE' }
      })

      // Also try with ROUND_RESULTS status to be thorough
      await prisma.round.create({
        data: {
          lobbyId: lobby.id,
          roundNumber: 2,
          word: 'test',
          imposterId: players[1].id,
          turnOrder: players.map(p => p.id),
          status: 'COMPLETE' // This will trigger the blocked phase
        }
      })

      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          hostId: players[0].id,
          playerIdToRemove: players[1].id
        })
      } as Request

      const response = await removePlayer(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Cannot remove players during')
    })
  })
})