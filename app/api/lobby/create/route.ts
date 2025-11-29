import { prisma } from '@/lib/db'
import { generateLobbyCode } from '@/lib/utils'
import { apiError, apiSuccess } from '@/lib/api-helpers'
import { GAME_CONFIG } from '@/lib/constants'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: Request) {
  try {
    const { playerName, targetScore } = await req.json()

    if (!playerName?.trim()) {
      return apiError('Player name is required')
    }

    // Validate target score
    const validatedTargetScore = Math.min(20, Math.max(2, targetScore || GAME_CONFIG.DEFAULT_TARGET_SCORE))

    const generateUniqueCode = async (): Promise<string> => {
      const code = generateLobbyCode()
      const exists = await prisma.lobby.findUnique({ where: { code } })
      return exists ? generateUniqueCode() : code
    }

    const code = await generateUniqueCode()

    const playerId = uuidv4()

    // Create lobby with owner as first player
    const lobby = await prisma.lobby.create({
      data: {
        code,
        ownerId: playerId,
        targetScore: validatedTargetScore,
        players: {
          create: {
            id: playerId,
            name: playerName.trim(),
          },
        },
      },
      include: {
        players: true,
      },
    })

    return apiSuccess({
      lobbyId: lobby.id,
      lobbyCode: lobby.code,
      playerId,
      playerName: playerName.trim(),
    })
  } catch (error) {
    console.error('Error creating lobby:', error)
    return apiError('Failed to create lobby', 500)
  }
}