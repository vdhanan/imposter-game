import { prisma } from '@/lib/db'
import { cleanDatabase } from '../utils/test-helpers'
import { POST as createLobby } from '@/app/api/lobby/create/route'
import { POST as joinLobby } from '@/app/api/lobby/join/route'
import { GET as getLobby } from '@/app/api/lobby/[lobbyId]/route'
import { GET as lookupLobby } from '@/app/api/lobby/lookup/route'

describe('Lobby Integration Tests', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  afterAll(async () => {
    await cleanDatabase()
    await prisma.$disconnect()
  })

  describe('POST /api/lobby/create', () => {
    it('should create a new lobby', async () => {
      const request = {
        json: async () => ({ playerName: 'Test Player' })
      } as Request

      const response = await createLobby(request)
      expect(response.status).toBe(200)

      const data = await response.json()

      expect(data.playerId).toBeDefined()
      expect(data.lobbyId).toBeDefined()
      expect(data.lobbyCode).toMatch(/^[A-Z0-9]{6}$/)
      expect(data.playerName).toBe('Test Player')

      const dbLobby = await prisma.lobby.findUnique({
        where: { id: data.lobbyId },
        include: { players: true }
      })

      expect(dbLobby).toBeTruthy()
      expect(dbLobby?.code).toBe(data.lobbyCode)
      expect(dbLobby?.targetScore).toBe(7)
      expect(dbLobby?.players).toHaveLength(1)
      expect(dbLobby?.players[0].name).toBe('Test Player')
      expect(dbLobby?.ownerId).toBe(data.playerId)
    })

    it('should create lobby with custom settings', async () => {
      const request = {
        json: async () => ({
          playerName: 'Host Player',
          targetScore: 10,
          emergencyVotesEnabled: false,
          bettingEnabled: false
        })
      } as Request

      const response = await createLobby(request)
      expect(response.status).toBe(200)

      const data = await response.json()

      const dbLobby = await prisma.lobby.findUnique({
        where: { id: data.lobbyId }
      })

      expect(dbLobby?.targetScore).toBe(10)
      expect(dbLobby?.emergencyVotesEnabled).toBe(false)
      expect(dbLobby?.bettingEnabled).toBe(false)
    })

    it('should reject empty player name', async () => {
      const request = {
        json: async () => ({ playerName: '   ' })
      } as Request

      const response = await createLobby(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('Player name is required')

      const lobbies = await prisma.lobby.findMany()
      expect(lobbies).toHaveLength(0)
    })

    it('should generate unique lobby codes', async () => {
      const codes = new Set<string>()

      for (let i = 0; i < 5; i++) {
        const request = {
          json: async () => ({ playerName: `Player ${i}` })
        } as Request

        const response = await createLobby(request)
        const data = await response.json()
        codes.add(data.lobbyCode)
      }

      // All codes should be unique
      expect(codes.size).toBe(5)
    })
  })

  describe('POST /api/lobby/join', () => {
    it('should allow player to join existing lobby', async () => {
      const createRequest = {
        json: async () => ({ playerName: 'Owner' })
      } as Request

      const createResponse = await createLobby(createRequest)
      const createData = await createResponse.json()

      const joinRequest = {
        json: async () => ({
          lobbyCode: createData.lobbyCode,
          playerName: 'New Player'
        })
      } as Request

      const joinResponse = await joinLobby(joinRequest)
      expect(joinResponse.status).toBe(200)

      const joinData = await joinResponse.json()
      expect(joinData.playerId).toBeDefined()
      expect(joinData.lobbyId).toBeDefined()
      expect(joinData.players).toHaveLength(2)

      const players = await prisma.player.findMany({
        where: { lobbyId: createData.lobbyId },
        orderBy: { joinedAt: 'asc' }
      })

      expect(players).toHaveLength(2)
      expect(players[0].name).toBe('Owner')
      expect(players[1].name).toBe('New Player')
    })

    it('should not allow joining non-existent lobby', async () => {
      const request = {
        json: async () => ({
          lobbyCode: 'XXXX',
          playerName: 'Player'
        })
      } as Request

      const response = await joinLobby(request)
      expect(response.status).toBe(404)

      const data = await response.json()
      expect(data.error).toBe('Lobby not found')
    })

    it('should not allow duplicate names in same lobby', async () => {
      const createRequest = {
        json: async () => ({ playerName: 'John' })
      } as Request

      const createResponse = await createLobby(createRequest)
      const createData = await createResponse.json()

      const joinRequest = {
        json: async () => ({
          lobbyCode: createData.lobbyCode,
          playerName: 'John'
        })
      } as Request

      const joinResponse = await joinLobby(joinRequest)
      expect(joinResponse.status).toBe(400)

      const joinData = await joinResponse.json()
      expect(joinData.error).toBe('Player name already taken')
    })

    it('should not allow joining game in progress', async () => {
      const createRequest = {
        json: async () => ({ playerName: 'Owner' })
      } as Request

      const createResponse = await createLobby(createRequest)
      const createData = await createResponse.json()

      await prisma.round.create({
        data: {
          lobbyId: createData.lobbyId,
          roundNumber: 1,
          word: 'test',
          imposterId: createData.playerId,
          turnOrder: [createData.playerId],
          status: 'IN_PROGRESS'
        }
      })

      const joinRequest = {
        json: async () => ({
          lobbyCode: createData.lobbyCode,
          playerName: 'Late Player'
        })
      } as Request

      const joinResponse = await joinLobby(joinRequest)
      expect(joinResponse.status).toBe(400)

      const joinData = await joinResponse.json()
      expect(joinData.error).toBe('Game already in progress')
    })
  })

  describe('GET /api/lobby/[lobbyId]', () => {
    it('should fetch lobby with all players and round info', async () => {
      const createRequest = {
        json: async () => ({ playerName: 'Player 1' })
      } as Request

      const createResponse = await createLobby(createRequest)
      const createData = await createResponse.json()

      const joinRequest = {
        json: async () => ({
          lobbyCode: createData.lobbyCode,
          playerName: 'Player 2'
        })
      } as Request

      await joinLobby(joinRequest)

      const players = await prisma.player.findMany({
        where: { lobbyId: createData.lobbyId }
      })

      const round = await prisma.round.create({
        data: {
          lobbyId: createData.lobbyId,
          roundNumber: 1,
          word: 'Guitar',
          category: 'Music',
          imposterId: players[0].id,
          turnOrder: players.map(p => p.id),
          status: 'IN_PROGRESS',
          currentTurn: 0
        }
      })

      const request = {} as Request
      const params = { params: { lobbyId: createData.lobbyId } }

      const response = await getLobby(request, params)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.id).toBe(createData.lobbyId)
      expect(data.code).toBe(createData.lobbyCode)
      expect(data.players).toHaveLength(2)
      if (data.currentRound) {
        expect(data.currentRound.roundNumber).toBe(1)
      }
    })

    it('should return 404 for non-existent lobby', async () => {
      const request = {} as Request
      const params = { params: { lobbyId: 'fake-id' } }

      const response = await getLobby(request, params)
      expect(response.status).toBe(404)

      const data = await response.json()
      expect(data.error).toBe('Lobby not found')
    })
  })

  describe('GET /api/lobby/lookup', () => {
    it('should find lobby by code', async () => {
      const createRequest = {
        json: async () => ({ playerName: 'Owner' })
      } as Request

      const createResponse = await createLobby(createRequest)
      const createData = await createResponse.json()

      const lookupRequest = new Request(
        `http://localhost:3000/api/lobby/lookup?code=${createData.lobbyCode}`
      )

      const lookupResponse = await lookupLobby(lookupRequest)
      expect(lookupResponse.status).toBe(200)

      const lookupData = await lookupResponse.json()
      expect(lookupData.lobbyId).toBe(createData.lobbyId)
      expect(lookupData.code).toBe(createData.lobbyCode)
    })

    it('should handle non-existent lobby code', async () => {
      const request = new Request(
        'http://localhost:3000/api/lobby/lookup?code=NOPE'
      )

      const response = await lookupLobby(request)
      expect(response.status).toBe(404)
    })

    it('should be case-insensitive', async () => {
      const createRequest = {
        json: async () => ({ playerName: 'Owner' })
      } as Request

      const createResponse = await createLobby(createRequest)
      const createData = await createResponse.json()

      const lookupRequest = new Request(
        `http://localhost:3000/api/lobby/lookup?code=${createData.lobbyCode.toLowerCase()}`
      )

      const lookupResponse = await lookupLobby(lookupRequest)
      expect(lookupResponse.status).toBe(200)

      const lookupData = await lookupResponse.json()
      expect(lookupData.lobbyId).toBe(createData.lobbyId)
    })
  })
})