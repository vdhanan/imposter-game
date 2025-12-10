import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { apiError, apiSuccess, processBetPayouts } from '@/lib/api-helpers'

export async function POST(req: Request) {
  try {
    const { lobbyId, voterId, suspectId, bet } = await req.json()

    // Validate input
    if (!lobbyId || !voterId || !suspectId) {
      return apiError('Missing required fields')
    }

    // Optional bet validation
    if (bet) {
      if (!bet.targetId || !bet.amount) {
        return apiError('Invalid bet structure')
      }
      if (bet.amount < 1 || bet.amount > 3) {
        return apiError('Bet amount must be between 1 and 3')
      }
      if (bet.targetId === voterId) {
        return apiError('Cannot bet on yourself')
      }
    }

    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Get round and check status
      const round = await tx.round.findFirst({
        where: {
          lobbyId,
          status: { in: ['VOTING', 'EMERGENCY_VOTING'] }
        },
        include: {
          votes: { where: { voterId } },
          bets: { where: { bettorId: voterId } }
        }
      })

      if (!round) {
        throw new Error('No voting phase active')
      }

      // Check if already voted
      if (round.votes.length > 0) {
        throw new Error('Already voted')
      }

      // Validate bet if provided
      if (bet) {
        // Cannot bet during emergency vote
        if (round.status === 'EMERGENCY_VOTING') {
          throw new Error('Cannot bet during emergency voting')
        }

        // Imposter cannot bet
        if (round.imposterId === voterId) {
          throw new Error('Cannot place bet')
        }

        // Check if already has a bet
        if (round.bets.length > 0) {
          throw new Error('Already placed bet')
        }

        // Verify sufficient points
        const player = await tx.player.findUnique({
          where: { id: voterId }
        })

        if (!player || player.score <= 0 || player.score < bet.amount) {
          throw new Error('Insufficient points for bet')
        }

        // Verify target exists
        const targetPlayer = await tx.player.findUnique({
          where: { id: bet.targetId }
        })

        if (!targetPlayer) {
          throw new Error('Invalid bet target')
        }

        // Create bet
        const createdBet = await tx.bet.create({
          data: {
            lobbyId,
            roundId: round.id,
            bettorId: voterId,
            targetId: bet.targetId,
            amount: bet.amount
          }
        })

        // Return bet details for event
        bet.id = createdBet.id
        bet.bettorName = player.name
        bet.targetName = targetPlayer.name
      }

      // Create vote
      const vote = await tx.vote.create({
        data: {
          roundId: round.id,
          voterId,
          suspectId
        }
      })

      // Get voter and suspect names for event
      const [voter, suspect] = await Promise.all([
        tx.player.findUnique({ where: { id: voterId } }),
        tx.player.findUnique({ where: { id: suspectId } })
      ])

      return { vote, voter, suspect, bet, round }
    })

    // Send events after successful transaction
    if (result.bet) {
      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
        type: 'BET_PLACED',
        bet: {
          id: result.bet.id,
          bettorId: voterId,
          bettorName: result.bet.bettorName,
          targetId: result.bet.targetId,
          targetName: result.bet.targetName,
          amount: result.bet.amount
        }
      })
    }

    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
      type: 'VOTE_CAST',
      voterId,
      voterName: result.voter?.name || '',
      suspectId,
      suspectName: result.suspect?.name || ''
    })

    // Check if voting is complete
    const updatedRound = await prisma.round.findUnique({
      where: { id: result.round.id },
      include: {
        votes: true,
        lobby: {
          include: { players: true }
        }
      }
    })

    if (updatedRound && updatedRound.votes.length === updatedRound.lobby.players.length) {
      // Calculate results and transition to next phase
      const voteCounts: Record<string, number> = {}
      for (const vote of updatedRound.votes) {
        voteCounts[vote.suspectId] = (voteCounts[vote.suspectId] || 0) + 1
      }

      const maxVotes = Math.max(...Object.values(voteCounts))
      const winners = Object.entries(voteCounts)
        .filter(([_, count]) => count === maxVotes)
        .map(([playerId]) => playerId)

      const votedOutPlayerId = winners.length === 1 ? winners[0] : null
      const imposterVoteCount = voteCounts[result.round.imposterId] || 0
      const wasImposterCaught = imposterVoteCount > updatedRound.lobby.players.length / 2

      // Handle emergency voting scoring
      if (result.round.status === 'EMERGENCY_VOTING') {
        const emergencyVote = await prisma.emergencyVote.findUnique({
          where: { roundId: result.round.id }
        })

        if (emergencyVote) {
          if (wasImposterCaught) {
            // Emergency vote success: initiator gets 2, others get 1
            await prisma.player.update({
              where: { id: emergencyVote.initiatorId },
              data: { score: { increment: 2 } }
            })

            const otherPlayers = updatedRound.lobby.players.filter(p =>
              p.id !== result.round.imposterId && p.id !== emergencyVote.initiatorId
            )
            for (const player of otherPlayers) {
              await prisma.player.update({
                where: { id: player.id },
                data: { score: { increment: 1 } }
              })
            }
          } else {
            // Emergency vote failed: initiator loses 1, imposter gains 1
            await prisma.player.update({
              where: { id: emergencyVote.initiatorId },
              data: { score: { increment: -1 } }
            })
            await prisma.player.update({
              where: { id: result.round.imposterId },
              data: { score: { increment: 1 } }
            })
          }
        }

        await prisma.round.update({
          where: { id: updatedRound.id },
          data: { status: 'COMPLETE' }
        })
      } else {
        // Regular voting - check if imposter was voted out
        const imposterVotedOut = votedOutPlayerId === result.round.imposterId

        // Process betting payouts if betting is enabled
        if (updatedRound.lobby.bettingEnabled) {
          const betResults = await processBetPayouts(updatedRound.id, result.round.imposterId)

          // Send bet results event
          if (betResults.length > 0) {
            await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
              type: 'BET_RESULTS',
              results: betResults
            })
          }
        }

        // Update round status - only go to GUESSING if imposter was voted out
        if (imposterVotedOut) {
          await prisma.round.update({
            where: { id: updatedRound.id },
            data: {
              status: 'GUESSING'
            }
          })
        } else {
          // Imposter evaded detection - award point
          await prisma.player.update({
            where: { id: result.round.imposterId },
            data: { score: { increment: 1 } }
          })

          await prisma.round.update({
            where: { id: updatedRound.id },
            data: {
              status: 'COMPLETE'
            }
          })
        }
      }

      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
        type: 'VOTING_COMPLETE',
        results: {
          voteCounts,
          votedOutPlayerId,
          winners
        }
      })
    }

    return apiSuccess({ success: true })
  } catch (error: any) {
    console.error('Vote with bet error:', error)
    return apiError(error.message || 'Failed to submit vote')
  }
}