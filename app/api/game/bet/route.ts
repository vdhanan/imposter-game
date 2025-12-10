import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { apiError, apiSuccess } from '@/lib/api-helpers'
import { Prisma } from '@prisma/client'

export async function POST(req: Request) {
  try {
    const { lobbyId, bettorId, targetId, amount } = await req.json()

    // Validate input
    if (!lobbyId || !bettorId || !targetId || amount === undefined || amount === null) {
      return apiError('Missing required fields')
    }
    if (amount < 1 || amount > 3) {
      return apiError('Invalid bet amount')
    }
    if (bettorId === targetId) {
      return apiError('Cannot bet on yourself')
    }

    // Get round and player info in a single query for efficiency
    const round = await prisma.round.findFirst({
      where: {
        lobbyId,
        status: 'VOTING'
      },
      include: {
        bets: {
          where: { bettorId }
        }
      }
    })

    if (!round) {
      return apiError('Betting is only allowed during voting phase')
    }

    // Check if imposter is trying to bet
    if (round.imposterId === bettorId) {
      return apiError('Cannot place bet')
    }

    // Check if already has a bet (double-check before creation)
    if (round.bets.length > 0) {
      return apiError('Already placed bet')
    }

    // Verify player has enough points
    const player = await prisma.player.findUnique({
      where: { id: bettorId }
    })

    if (!player || player.score < amount) {
      return apiError('Insufficient points')
    }

    // Get target player info for the response
    const targetPlayer = await prisma.player.findUnique({
      where: { id: targetId }
    })

    if (!targetPlayer) {
      return apiError('Invalid target player')
    }

    try {
      // Create bet with atomic operation - unique constraint will prevent duplicates
      const bet = await prisma.bet.create({
        data: {
          lobbyId,
          roundId: round.id,
          bettorId,
          targetId,
          amount,
        },
      })

      // Broadcast bet event
      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
        type: 'BET_PLACED',
        bet: {
          id: bet.id,
          bettorId: bet.bettorId,
          bettorName: player.name,
          targetId: bet.targetId,
          targetName: targetPlayer.name,
          amount: bet.amount,
        }
      })

      return apiSuccess({
        success: true,
        bet: {
          id: bet.id,
          bettorId: bet.bettorId,
          targetId: bet.targetId,
          amount: bet.amount,
        }
      })
    } catch (error) {
      // Handle unique constraint violation (race condition where another request created the bet)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return apiError('Already placed bet')
      }
      throw error
    }
  } catch (error) {
    console.error('Error placing bet:', error)
    return apiError('Failed to place bet', 500)
  }
}