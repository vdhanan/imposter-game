import { prisma } from '@/lib/db'
import { cleanDatabase, createTestLobby, createTestPlayer } from '../utils/test-helpers'
import { POST as startGame } from '@/app/api/game/start/route'
import { POST as submitHint } from '@/app/api/game/hint/route'
import { POST as voteWithBet } from '@/app/api/game/vote-with-bet/route'
import { POST as submitGuess } from '@/app/api/game/guess/route'
import { POST as restartGame } from '@/app/api/game/restart/route'
import { POST as callEmergencyVote } from '@/app/api/game/emergency-vote/route'

describe('Game Flow Integration Tests', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  afterAll(async () => {
    await cleanDatabase()
    await prisma.$disconnect()
  })

  describe('Game Start and Hints', () => {
    it('should start a game and process hints', async () => {
      const lobby = await createTestLobby('GAME1', {})
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const charlie = await createTestPlayer('Charlie', lobby.id)
      const david = await createTestPlayer('David', lobby.id)
      const players = [alice, bob, charlie, david]

      const playerCount = await prisma.player.count({
        where: { lobbyId: lobby.id }
      })
      expect(playerCount).toBe(4)

      const updatedLobby = await prisma.lobby.findUnique({
        where: { id: lobby.id },
        include: { players: true }
      })

      if (!updatedLobby) {
        throw new Error(`Lobby not found with ID: ${lobby.id}`)
      }

      expect(updatedLobby.ownerId).toBe(alice.id)
      expect(updatedLobby.players.length).toBe(4)


      const startRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: alice.id
        })
      } as Request

      const startResponse = await startGame(startRequest)
      expect(startResponse.status).toBe(200)

      const startData = await startResponse.json()
      expect(startData.roundId).toBeDefined()
      expect(startData.roundNumber).toBe(1)
      expect(startData.turnOrder).toBeDefined()

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id }
      })
      expect(round).toBeTruthy()
      expect(round?.status).toBe('IN_PROGRESS')

      const hints = [
        'Italian dish', 'Cheese on top', 'Round shape', 'Delicious meal',
        'Tomato sauce', 'Oven baked', 'Popular food', 'Party favorite'
      ]
      const turnOrder = round!.turnOrder as string[]

      for (let i = 0; i < turnOrder.length * 2; i++) {
        const playerIndex = i % turnOrder.length
        const hintRequest = {
          json: async () => ({
            lobbyId: lobby.id,
            playerId: turnOrder[playerIndex],
            text: hints[i]
          })
        } as Request

        const hintResponse = await submitHint(hintRequest)
        expect(hintResponse.status).toBe(200)

        const hintData = await hintResponse.json()
        expect(hintData.success).toBe(true)
      }

      const savedHints = await prisma.hint.findMany({
        where: { roundId: round!.id }
      })
      expect(savedHints).toHaveLength(8)

      const updatedRound = await prisma.round.findFirst({
        where: { id: round!.id }
      })
      expect(updatedRound?.status).toBe(lobby.bettingEnabled ? 'BETTING' : 'VOTING')
    })

    it('should not allow starting game with less than 3 players', async () => {
      const lobby = await createTestLobby('SMALL', {})
      // Create players sequentially to ensure proper owner assignment
      const alice = await createTestPlayer('Alice', lobby.id, true)
      const bob = await createTestPlayer('Bob', lobby.id)
      const players = [alice, bob]

      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: alice.id
        })
      } as Request

      const response = await startGame(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('Need at least 3 players')
    })
  })

  describe('Voting and Guessing', () => {
    it('should handle voting and imposter guessing', async () => {
      // Setup game in voting state
      const lobby = await createTestLobby('VOTE1', {})

      const players = await Promise.all([
        createTestPlayer('Alice', lobby.id, true), // Owner
        createTestPlayer('Bob', lobby.id), // Will be imposter
        createTestPlayer('Charlie', lobby.id),
        createTestPlayer('David', lobby.id)
      ])

      const round = await prisma.round.create({
        data: {
          lobbyId: lobby.id,
          roundNumber: 1,
          word: 'Guitar',
          category: 'Music',
          imposterId: players[1].id,
          turnOrder: players.map(p => p.id),
          status: 'VOTING',
          currentTurn: 4
        }
      })

      // Submit votes (3 players vote for Bob, the imposter, Bob votes for someone else)
      for (const voter of [players[0], players[2], players[3]]) {
        const voteRequest = {
          json: async () => ({
            lobbyId: lobby.id,
            voterId: voter.id,
            suspectId: players[1].id,
            bet: null
          })
        } as Request

        const voteResponse = await voteWithBet(voteRequest)
        expect(voteResponse.status).toBe(200)
      }

      // Bob (imposter) votes for someone else
      const imposterVoteRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          voterId: players[1].id,
          suspectId: players[0].id,
          bet: null
        })
      } as Request

      const imposterVoteResponse = await voteWithBet(imposterVoteRequest)
      expect(imposterVoteResponse.status).toBe(200)

      // Verify votes were saved
      const votes = await prisma.vote.findMany({
        where: { roundId: round.id }
      })
      expect(votes).toHaveLength(4)

      // Check that round moved to guessing
      const updatedRound = await prisma.round.findFirst({
        where: { id: round.id }
      })
      expect(updatedRound?.status).toBe('GUESSING')

      // Imposter makes a guess
      const guessRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: players[1].id, // Bob is the imposter
          guess: 'Guitar' // Correct guess
        })
      } as Request

      const guessResponse = await submitGuess(guessRequest)
      expect(guessResponse.status).toBe(200)

      const guessData = await guessResponse.json()
      expect(guessData.success).toBe(true)

      // Verify scores were updated
      const updatedPlayers = await prisma.player.findMany({
        where: { lobbyId: lobby.id },
        orderBy: { score: 'desc' }
      })

      // Imposter should have points for correct guess
      const imposter = updatedPlayers.find(p => p.id === players[1].id)
      expect(imposter?.score).toBeGreaterThan(0)
    })
  })

  describe('Regular Vote with Tie', () => {
    it('should not catch imposter when votes are tied (no majority)', async () => {
      const lobby = await createTestLobby('REGTIE1', {})

      const players = await Promise.all([
        createTestPlayer('Player1', lobby.id, true),
        createTestPlayer('Player2', lobby.id),
        createTestPlayer('Player3', lobby.id),
      ])

      const round = await prisma.round.create({
        data: {
          lobbyId: lobby.id,
          roundNumber: 1,
          word: 'Apple',
          category: 'Food',
          imposterId: players[2].id,
          turnOrder: players.map(p => p.id),
          status: 'VOTING',
          currentTurn: 3
        }
      })

      const votes = [
        { voterId: players[0].id, suspectId: players[2].id },
        { voterId: players[1].id, suspectId: players[0].id },
        { voterId: players[2].id, suspectId: players[1].id },
      ]

      for (let index = 0; index < votes.length; index++) {
        const vote = votes[index]
        const voteRequest = {
          json: async () => ({
            lobbyId: lobby.id,
            ...vote,
            bet: null
          })
        } as Request

        const response = await voteWithBet(voteRequest)

        if (index === votes.length - 1) {
          expect(response.status).toBe(200)
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100))

      const updatedRound = await prisma.round.findFirst({
        where: { id: round.id }
      })
      expect(updatedRound?.status).toBe('COMPLETE')

      const updatedPlayers = await prisma.player.findMany({
        where: { lobbyId: lobby.id }
      })

      const player1 = updatedPlayers.find(p => p.id === players[0].id)
      const player2 = updatedPlayers.find(p => p.id === players[1].id)
      const player3 = updatedPlayers.find(p => p.id === players[2].id)

      expect(player3?.score).toBe(1)
      expect(player1?.score).toBe(0)
      expect(player2?.score).toBe(0)
    })
  })

  describe('Emergency Vote with Tie', () => {
    it('should fail emergency vote when votes are tied (no majority)', async () => {
      const lobby = await prisma.lobby.create({
        data: {
          code: 'EMRG1',
          ownerId: 'temp-owner',
          targetScore: 7,
          emergencyVotesEnabled: true,
          bettingEnabled: false,
        },
      })

      const players = await Promise.all([
        createTestPlayer('PlayerR', lobby.id, true),
        createTestPlayer('PlayerD', lobby.id),
        createTestPlayer('PlayerV', lobby.id),
      ])

      const startRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: players[0].id
        })
      } as Request

      await startGame(startRequest)

      const round = await prisma.round.findFirst({
        where: { lobbyId: lobby.id, status: 'IN_PROGRESS' }
      })

      if (!round) throw new Error('Round not found')

      await prisma.round.update({
        where: { id: round.id },
        data: {
          imposterId: players[2].id
        }
      })
      const emergencyRequest = {
        json: async () => ({
          lobbyId: lobby.id,
          initiatorId: players[0].id
        })
      } as Request

      await callEmergencyVote(emergencyRequest)

      const emergencyVote = await prisma.emergencyVote.findUnique({
        where: { roundId: round.id }
      })
      expect(emergencyVote).toBeDefined()
      expect(emergencyVote?.initiatorId).toBe(players[0].id)

      const votes = [
        { voterId: players[0].id, suspectId: players[2].id },
        { voterId: players[1].id, suspectId: players[0].id },
        { voterId: players[2].id, suspectId: players[1].id },
      ]

      for (let index = 0; index < votes.length; index++) {
        const vote = votes[index]
        const voteRequest = {
          json: async () => ({
            lobbyId: lobby.id,
            ...vote,
            bet: null
          })
        } as Request

        const response = await voteWithBet(voteRequest)

        if (index === votes.length - 1) {
          expect(response.status).toBe(200)
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100))

      const updatedPlayers = await prisma.player.findMany({
        where: { lobbyId: lobby.id }
      })

      const playerR = updatedPlayers.find(p => p.id === players[0].id)
      const playerD = updatedPlayers.find(p => p.id === players[1].id)
      const playerV = updatedPlayers.find(p => p.id === players[2].id)

      expect(playerR?.score).toBe(-1)
      expect(playerV?.score).toBe(1)
      expect(playerD?.score).toBe(0)
    })
  })

  describe('Game Restart', () => {
    it('should restart game and reset scores', async () => {
      // Create a finished game
      const lobby = await createTestLobby('OVER1', {})

      const players = await Promise.all([
        createTestPlayer('Winner', lobby.id, true), // Owner with high score
        createTestPlayer('Second', lobby.id),
        createTestPlayer('Third', lobby.id)
      ])

      // Update scores to simulate a finished game
      await prisma.player.update({
        where: { id: players[0].id },
        data: { score: 7 }
      })
      await prisma.player.update({
        where: { id: players[1].id },
        data: { score: 5 }
      })
      await prisma.player.update({
        where: { id: players[2].id },
        data: { score: 3 }
      })

      // Restart the game
      const request = {
        json: async () => ({
          lobbyId: lobby.id,
          playerId: players[0].id // Owner restarts the game
        })
      } as Request

      const response = await restartGame(request)
      expect(response.status).toBe(200)

      // Verify lobby state reset
      const updatedLobby = await prisma.lobby.findUnique({
        where: { id: lobby.id }
      })

      // Verify all scores reset to 0
      const updatedPlayers = await prisma.player.findMany({
        where: { lobbyId: lobby.id }
      })

      for (const player of updatedPlayers) {
        expect(player.score).toBe(0)
      }
    })
  })
})