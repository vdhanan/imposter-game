import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { apiError, apiSuccess, getLobbyWithPlayers, getCurrentRound } from '@/lib/api-helpers'
import type { PusherEvent } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const { lobbyId, initiatorId } = await req.json()

    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId }
    })

    if (!lobby) {
      return apiError('Lobby not found', 404)
    }

    if (!lobby.emergencyVotesEnabled) {
      return apiError('Emergency votes are not enabled for this lobby')
    }

    const round = await getCurrentRound(lobbyId, 'IN_PROGRESS')
    if (!round) {
      return apiError('No active round or round is not in progress', 400)
    }

    // Imposters can't call emergency votes since they know who they are
    if (round.imposterId === initiatorId) {
      return apiError('You cannot initiate an emergency vote', 403)
    }

    const existingEmergencyVote = await prisma.emergencyVote.findUnique({
      where: { roundId: round.id }
    })

    if (existingEmergencyVote) {
      return apiError('An emergency vote has already been initiated for this round')
    }

    const initiator = await prisma.player.findUnique({
      where: { id: initiatorId }
    })

    if (!initiator) {
      return apiError('Player not found', 404)
    }

    await prisma.emergencyVote.create({
      data: {
        lobbyId,
        roundId: round.id,
        initiatorId
      }
    })

    await prisma.round.update({
      where: { id: round.id },
      data: { status: 'EMERGENCY_VOTING' }
    })

    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
      type: 'EMERGENCY_VOTE_INITIATED',
      initiatorId,
      initiatorName: initiator.name
    } as PusherEvent)

    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
      type: 'EMERGENCY_VOTING_STARTED'
    } as PusherEvent)

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Error initiating emergency vote:', error)
    return apiError('Failed to initiate emergency vote', 500)
  }
}