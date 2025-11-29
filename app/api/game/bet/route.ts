import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { apiError, apiSuccess } from '@/lib/api-helpers'

export async function POST(req: Request) {
  try {
    const { lobbyId, bettorId, targetId, amount } = await req.json()

    // Validate bet amount
    if (amount < 1 || amount > 3) return apiError('Invalid bet amount')
    if (bettorId === targetId) return apiError('Cannot bet on yourself')

    // Check round and existing bet
    const round = await prisma.round.findFirst({
      where: { lobbyId, status: 'BETTING' },
      include: {
        bets: {
          where: { bettorId }
        }
      }
    })

    if (!round) return apiError('No betting phase active')
    if (round.bets.length > 0) return apiError('Already placed bet')

    // Validate players and points
    const [bettor, target] = await Promise.all([
      prisma.player.findUnique({ where: { id: bettorId } }),
      prisma.player.findUnique({ where: { id: targetId } })
    ])

    if (!bettor || !target) return apiError('Invalid player')
    if (bettor.score < amount) return apiError('Insufficient points')

    // Create bet
    const bet = await prisma.bet.create({
      data: { lobbyId, roundId: round.id, bettorId, targetId, amount }
    })

    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
      type: 'BET_PLACED',
      bet: {
        id: bet.id,
        bettorId,
        bettorName: bettor.name,
        targetId,
        targetName: target.name,
        amount
      }
    })

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Error placing bet:', error)
    return apiError('Failed to place bet', 500)
  }
}