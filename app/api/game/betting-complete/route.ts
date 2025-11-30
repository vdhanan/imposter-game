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
    // Only check if eligible players (score > 0, not imposter) have placed bets
    const eligiblePlayers = players.filter(
      player => player.id !== round.imposterId && player.score > 0
    )

    const allEligiblePlayersHaveBet = eligiblePlayers.every(
      player => playerIdsWithBets.has(player.id)
    )

    // Allow transition if all eligible players have bet OR if timer expired (force transition)
    // The force parameter can be added later for more explicit control
    const canTransition = allEligiblePlayersHaveBet || eligiblePlayers.length === 0

    if (!canTransition) {
      return apiError('Not all eligible players have placed their bets', 400)
    }

    // Use an atomic update to prevent race conditions
    const updatedRound = await prisma.round.updateMany({
      where: {
        id: round.id,
        status: 'BETTING' // Only update if still in BETTING status
      },
      data: { status: 'VOTING' },
    })

    // Only trigger event if we actually updated the round
    if (updatedRound.count > 0) {
      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
        type: 'VOTING_STARTED'
      })
      return apiSuccess({ success: true, transitioned: true })
    }

    // Round was already transitioned by another request
    return apiSuccess({ success: true, transitioned: false })
  } catch (error) {
    console.error('Error completing betting phase:', error)
    return apiError('Failed to complete betting phase', 500)
  }
}