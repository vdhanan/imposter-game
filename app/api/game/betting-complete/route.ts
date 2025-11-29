import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { apiError, apiSuccess } from '@/lib/api-helpers'

export async function POST(req: Request) {
  try {
    const { lobbyId } = await req.json()

    const round = await prisma.round.findFirst({
      where: {
        lobbyId,
        status: 'BETTING',
      },
    })

    if (!round) {
      return apiError('No active betting round', 404)
    }

    const players = await prisma.player.findMany({
      where: { lobbyId },
    })

    const bets = await prisma.bet.findMany({
      where: { roundId: round.id },
    })

    const playerIdsWithBets = new Set(bets.map(bet => bet.bettorId))
    const allPlayersHaveBet = players
      .filter(player => player.id !== round.imposterId)
      .every(player => playerIdsWithBets.has(player.id))

    if (!allPlayersHaveBet) {
      return apiError('Not all players have placed their bets', 400)
    }

    await prisma.round.update({
      where: { id: round.id },
      data: { status: 'VOTING' },
    })

    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
      type: 'VOTING_STARTED'
    })

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Error completing betting phase:', error)
    return apiError('Failed to complete betting phase', 500)
  }
}