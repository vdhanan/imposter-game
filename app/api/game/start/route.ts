import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { getRandomWord, shuffleArray } from '@/lib/utils'
import { apiError, apiSuccess, getLobbyWithPlayers, verifyLobbyOwner, verifyMinPlayers } from '@/lib/api-helpers'
import type { PusherEvent } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const { lobbyId, playerId } = await req.json()

    const lobby = await getLobbyWithPlayers(lobbyId)
    verifyLobbyOwner(lobby, playerId)
    verifyMinPlayers(lobby.players)

    const activeRounds = await prisma.round.findMany({
      where: { lobbyId, status: { not: 'COMPLETE' } }
    })

    if (activeRounds.length > 0) {
      return apiError('Game already in progress')
    }

    const lastRound = await prisma.round.findFirst({
      where: { lobbyId },
      orderBy: { roundNumber: 'desc' },
    })
    const roundNumber = lastRound ? lastRound.roundNumber + 1 : 1

    const { word, category } = getRandomWord()
    const playerIds = lobby.players.map(p => p.id)
    const imposterId = playerIds[Math.floor(Math.random() * playerIds.length)]
    const turnOrder = shuffleArray(playerIds)

    const round = await prisma.round.create({
      data: {
        lobbyId,
        roundNumber,
        word,
        category,
        imposterId,
        turnOrder,
        status: 'IN_PROGRESS',
      },
    })

    // Send private messages to each player
    for (const player of lobby.players) {
      const isImposter = player.id === imposterId
      await pusherServer.trigger(
        `player-${lobbyId}-${player.id}`,
        'private-event',
        {
          type: 'ROLE_ASSIGNED',
          role: isImposter ? 'IMPOSTER' : 'CIVILIAN',
          word: isImposter ? null : word,
          category, // Category is shown to all players including imposter
        }
      )
    }

    // Broadcast game start to all players
    const event: PusherEvent = {
      type: 'GAME_STARTED',
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        imposterId: round.imposterId,
        turnOrder: round.turnOrder,
        currentTurn: 0,
        hints: [],
        status: round.status,
        category, // Include category in the public round data
      },
      targetScore: lobby.targetScore || 7,
    }

    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', event)

    return apiSuccess({
      roundId: round.id,
      roundNumber: round.roundNumber,
      turnOrder,
      firstPlayer: turnOrder[0],
    })
  } catch (error) {
    console.error('Error starting game:', error)
    return apiError(error instanceof Error ? error.message : 'Failed to start game',
                    error instanceof Error && error.message.includes('owner') ? 403 : 500)
  }
}