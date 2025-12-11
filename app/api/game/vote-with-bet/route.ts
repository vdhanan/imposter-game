import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { apiError, apiSuccess } from '@/lib/api-helpers'

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
      // Get round and check status - transaction isolation prevents race conditions
      const round = await tx.round.findFirst({
        where: {
          lobbyId,
          status: { in: ['VOTING', 'EMERGENCY_VOTING'] }
        },
        include: {
          votes: { where: { voterId } },
          bets: { where: { bettorId: voterId } },
          lobby: { include: { players: true } }
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

      // Check if voting is complete - INSIDE transaction to prevent race condition
      const allVotes = await tx.vote.findMany({
        where: { roundId: round.id }
      })

      let votingResults = null
      let betResults = []

      if (allVotes.length === round.lobby.players.length) {
        // Calculate results and transition to next phase
        const voteCounts: Record<string, number> = {}
        for (const v of allVotes) {
          voteCounts[v.suspectId] = (voteCounts[v.suspectId] || 0) + 1
        }

        const maxVotes = Math.max(...Object.values(voteCounts))
        const winners = Object.entries(voteCounts)
          .filter(([_, count]) => count === maxVotes)
          .map(([playerId]) => playerId)

        const votedOutPlayerId = winners.length === 1 ? winners[0] : null
        const imposterVoteCount = voteCounts[round.imposterId] || 0
        const wasImposterCaught = imposterVoteCount > round.lobby.players.length / 2

        // Handle emergency voting scoring
        if (round.status === 'EMERGENCY_VOTING') {
          const emergencyVote = await tx.emergencyVote.findUnique({
            where: { roundId: round.id }
          })

          if (emergencyVote) {
            if (wasImposterCaught) {
              // Emergency vote success: initiator gets 2, others get 1
              await tx.player.update({
                where: { id: emergencyVote.initiatorId },
                data: { score: { increment: 2 } }
              })

              const otherPlayerIds = round.lobby.players
                .filter(p => p.id !== round.imposterId && p.id !== emergencyVote.initiatorId)
                .map(p => p.id)

              await tx.player.updateMany({
                where: { id: { in: otherPlayerIds } },
                data: { score: { increment: 1 } }
              })
            } else {
              // Emergency vote failed: initiator loses 1, imposter gains 1
              await tx.player.update({
                where: { id: emergencyVote.initiatorId },
                data: { score: { increment: -1 } }
              })
              await tx.player.update({
                where: { id: round.imposterId },
                data: { score: { increment: 1 } }
              })
            }
          }

          await tx.round.update({
            where: { id: round.id },
            data: { status: 'COMPLETE' }
          })
        } else {
          // Regular voting - check if imposter was voted out
          const imposterVotedOut = votedOutPlayerId === round.imposterId

          // Process betting payouts if betting is enabled
          if (round.lobby.bettingEnabled) {
            // Get all bets for this round
            const bets = await tx.bet.findMany({
              where: { roundId: round.id },
              include: {
                bettor: true,
                target: true
              }
            })

            for (const betItem of bets) {
              const isCorrect = betItem.targetId === round.imposterId
              const payout = isCorrect ? betItem.amount : -betItem.amount

              await tx.player.update({
                where: { id: betItem.bettorId },
                data: { score: { increment: payout } }
              })

              betResults.push({
                bettorId: betItem.bettorId,
                bettorName: betItem.bettor.name,
                targetId: betItem.targetId,
                targetName: betItem.target.name,
                amount: betItem.amount,
                isCorrect,
                payout
              })
            }
          }

          // Update round status - only go to GUESSING if imposter was voted out
          if (imposterVotedOut) {
            await tx.round.update({
              where: { id: round.id },
              data: {
                status: 'GUESSING'
              }
            })
          } else {
            // Imposter evaded detection - award point
            await tx.player.update({
              where: { id: round.imposterId },
              data: { score: { increment: 1 } }
            })

            await tx.round.update({
              where: { id: round.id },
              data: {
                status: 'COMPLETE'
              }
            })
          }
        }

        votingResults = {
          voteCounts,
          votedOutPlayerId,
          winners
        }
      }

      return { vote, voter, suspect, bet, round, votingResults, betResults }
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

    // Send voting complete event if voting finished
    if (result.votingResults) {
      // Send bet results if any
      if (result.betResults.length > 0) {
        await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
          type: 'BET_RESULTS',
          results: result.betResults
        })
      }

      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
        type: 'VOTING_COMPLETE',
        results: result.votingResults
      })
    }

    return apiSuccess({ success: true })
  } catch (error: any) {
    console.error('Vote with bet error:', error)
    return apiError(error.message || 'Failed to submit vote')
  }
}