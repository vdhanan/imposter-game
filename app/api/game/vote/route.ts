import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { getMostVotedPlayer } from '@/lib/utils'
import { apiError, apiSuccess, getLobbyWithPlayers, getCurrentRound, processBetPayouts, buildVoteResults, buildRoundResult, sendGameEvent } from '@/lib/api-helpers'
import type { PusherEvent } from '@/lib/types'
import { requireValidPlayer } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const { lobbyId, voterId, suspectId } = await req.json()

    // Validate player belongs to lobby
    try {
      await requireValidPlayer(lobbyId, voterId)
    } catch (error) {
      return apiError('Unauthorized', 403)
    }

    if (voterId === suspectId) {
      return apiError('Cannot vote for yourself')
    }

    let round = await getCurrentRound(lobbyId, 'VOTING')
    let isEmergencyVote = false

    if (!round) {
      round = await getCurrentRound(lobbyId, 'EMERGENCY_VOTING')
      isEmergencyVote = !!round
    }

    if (!round) {
      return apiError('No active voting round', 404)
    }

    if (round.votes.find(v => v.voterId === voterId)) {
      return apiError('Already voted')
    }

    await prisma.vote.create({
      data: {
        roundId: round.id,
        voterId,
        suspectId,
      },
    })

    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
      type: 'VOTE_CAST',
      voterId,
    } as PusherEvent)

    const lobby = await getLobbyWithPlayers(lobbyId)

    const allVotes = await prisma.vote.findMany({
      where: { roundId: round.id },
    })

    if (allVotes.length === lobby.players.length) {
      const voteResults = buildVoteResults(allVotes)
      const mostVoted = getMostVotedPlayer(voteResults)

      const imposterVoteCount = voteResults[round.imposterId]?.length || 0
      const wasImposterCaught = imposterVoteCount > lobby.players.length / 2

      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
        type: 'VOTING_COMPLETE',
        results: {
          votes: voteResults,
          correctGuess: wasImposterCaught,
          imposterId: round.imposterId,
          mostVoted,
        },
      } as PusherEvent)

      // Handle scoring based on vote type
      if (isEmergencyVote) {
        const emergencyVote = await prisma.emergencyVote.findUnique({
          where: { roundId: round.id },
          include: { initiator: true }
        })

        const pointsToAward: Array<{ playerId: string; playerName: string; points: number }> = []

        if (wasImposterCaught) {
          // Emergency vote success: initiator gets 2, others get 1
          await prisma.player.update({
            where: { id: emergencyVote!.initiatorId },
            data: { score: { increment: 2 } }
          })
          pointsToAward.push({
            playerId: emergencyVote!.initiatorId,
            playerName: emergencyVote!.initiator.name,
            points: 2
          })

          const otherPlayers = lobby.players.filter(p =>
            p.id !== round.imposterId && p.id !== emergencyVote!.initiatorId
          )
          for (const player of otherPlayers) {
            await prisma.player.update({
              where: { id: player.id },
              data: { score: { increment: 1 } }
            })
            pointsToAward.push({
              playerId: player.id,
              playerName: player.name,
              points: 1
            })
          }
        } else {
          // Emergency vote failed: initiator loses 1, imposter gains 1
          await prisma.player.update({
            where: { id: emergencyVote!.initiatorId },
            data: { score: { increment: -1 } }
          })
          await prisma.player.update({
            where: { id: round.imposterId },
            data: { score: { increment: 1 } }
          })

          const imposter = lobby.players.find(p => p.id === round.imposterId)!
          pointsToAward.push(
            { playerId: round.imposterId, playerName: imposter.name, points: 1 },
            { playerId: emergencyVote!.initiatorId, playerName: emergencyVote!.initiator.name, points: -1 }
          )
        }

        await prisma.round.update({
          where: { id: round.id },
          data: { status: 'COMPLETE' }
        })

        const betResults = lobby.bettingEnabled
          ? await processBetPayouts(round.id, round.imposterId)
          : []

        const roundResult = await buildRoundResult(
          round,
          lobby,
          wasImposterCaught,
          voteResults,
          pointsToAward,
          betResults
        )

        await sendGameEvent(lobbyId, roundResult)
      } else {
        // Regular voting logic
        if (wasImposterCaught) {
          await prisma.round.update({
            where: { id: round.id },
            data: { status: 'GUESSING' },
          })

          await pusherServer.trigger(
            `player-${lobbyId}-${round.imposterId}`,
            'private-event',
            { type: 'GUESS_WORD_PROMPT' }
          )
        } else {
          // Imposter evaded detection - award point
          await prisma.player.update({
            where: { id: round.imposterId },
            data: { score: { increment: 1 } },
          })

          await prisma.round.update({
            where: { id: round.id },
            data: { status: 'COMPLETE' },
          })

          const betResults = lobby.bettingEnabled
            ? await processBetPayouts(round.id, round.imposterId)
            : []

          const imposter = lobby.players.find(p => p.id === round.imposterId)!
          const roundResult = await buildRoundResult(
            round,
            lobby,
            false,
            voteResults,
            [{ playerId: round.imposterId, playerName: imposter.name, points: 1 }],
            betResults
          )

          await sendGameEvent(lobbyId, roundResult)
        }
      }
    }

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Error voting:', error)
    return apiError('Failed to vote', 500)
  }
}