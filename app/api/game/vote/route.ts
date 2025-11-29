import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { getMostVotedPlayer } from '@/lib/utils'
import { apiError, apiSuccess, getLobbyWithPlayers, getCurrentRound } from '@/lib/api-helpers'
import type { PusherEvent, RoundResult } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const { lobbyId, voterId, suspectId } = await req.json()

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
      // Count votes
      const voteResults: Record<string, string[]> = {}
      for (const vote of allVotes) {
        if (!voteResults[vote.suspectId]) {
          voteResults[vote.suspectId] = []
        }
        voteResults[vote.suspectId].push(vote.voterId)
      }

      const mostVoted = getMostVotedPlayer(voteResults)
      const wasImposterCaught = mostVoted === round.imposterId

      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
        type: 'VOTING_COMPLETE',
        results: {
          votes: voteResults,
          correctGuess: wasImposterCaught,
          imposterId: round.imposterId,
          mostVoted,
        },
      } as PusherEvent)

      // Handle emergency vote scoring differently
      if (isEmergencyVote) {
        // Get the emergency vote record to find the initiator
        const emergencyVote = await prisma.emergencyVote.findUnique({
          where: { roundId: round.id },
          include: { initiator: true }
        })

        if (wasImposterCaught) {
          // Emergency vote successful! Initiator gets 2 points, others get 1
          const pointsToAward: Array<{ playerId: string; playerName: string; points: number }> = []

          // Award 2 points to initiator
          await prisma.player.update({
            where: { id: emergencyVote!.initiatorId },
            data: { score: { increment: 2 } }
          })
          pointsToAward.push({
            playerId: emergencyVote!.initiatorId,
            playerName: emergencyVote!.initiator.name,
            points: 2
          })

          // Award 1 point to everyone else except the imposter
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

          await prisma.round.update({
            where: { id: round.id },
            data: { status: 'COMPLETE' }
          })

          // Get updated scores
          const updatedPlayers = await prisma.player.findMany({
            where: { lobbyId }
          })
          const scores: Record<string, number> = {}
          updatedPlayers.forEach(p => scores[p.id] = p.score)

          const imposter = updatedPlayers.find(p => p.id === round.imposterId)!
          const roundResult: RoundResult = {
            roundNumber: round.roundNumber,
            word: round.word,
            imposterId: round.imposterId,
            imposterName: imposter.name,
            wasImposterCaught: true,
            votesReceived: voteResults,
            pointsAwarded: pointsToAward,
            newScores: scores,
          }

          // Check if anyone reached target score
          const winner = updatedPlayers.find(p => p.score >= lobby.targetScore)
          if (winner) {
            roundResult.winner = winner.id
            const gameOverEvent: PusherEvent = {
              type: 'GAME_OVER',
              winner: winner,
              finalScores: scores,
            }
            await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', gameOverEvent)
          } else {
            const roundResultsEvent: PusherEvent = {
              type: 'ROUND_RESULTS',
              result: roundResult,
            }
            await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', roundResultsEvent)
          }
        } else {
          // Emergency vote failed - initiator loses a point, imposter wins
          await prisma.player.update({
            where: { id: emergencyVote!.initiatorId },
            data: { score: { increment: -1 } }
          })

          await prisma.player.update({
            where: { id: round.imposterId },
            data: { score: { increment: 1 } }
          })

          await prisma.round.update({
            where: { id: round.id },
            data: { status: 'COMPLETE' }
          })

          const updatedPlayers = await prisma.player.findMany({
            where: { lobbyId }
          })
          const scores: Record<string, number> = {}
          updatedPlayers.forEach(p => scores[p.id] = p.score)

          const imposter = updatedPlayers.find(p => p.id === round.imposterId)!
          const roundResult: RoundResult = {
            roundNumber: round.roundNumber,
            word: round.word,
            imposterId: round.imposterId,
            imposterName: imposter.name,
            wasImposterCaught: false,
            votesReceived: voteResults,
            pointsAwarded: [
              {
                playerId: round.imposterId,
                playerName: imposter.name,
                points: 1,
              },
              {
                playerId: emergencyVote!.initiatorId,
                playerName: emergencyVote!.initiator.name,
                points: -1,
              }
            ],
            newScores: scores,
          }

          // Check if imposter reached target score
          if (imposter.score >= lobby.targetScore) {
            roundResult.winner = imposter.id
            const gameOverEvent: PusherEvent = {
              type: 'GAME_OVER',
              winner: imposter,
              finalScores: scores,
            }
            await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', gameOverEvent)
          } else {
            const roundResultsEvent: PusherEvent = {
              type: 'ROUND_RESULTS',
              result: roundResult,
            }
            await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', roundResultsEvent)
          }
        }
      } else {
        // Regular voting logic
        if (wasImposterCaught) {
          await prisma.round.update({
            where: { id: round.id },
            data: { status: 'GUESSING' },
          })

          // Send private message to imposter to guess
          await pusherServer.trigger(
            `player-${lobbyId}-${round.imposterId}`,
            'private-event',
            { type: 'GUESS_WORD_PROMPT' }
          )
        } else {
          // Imposter wasn't caught - imposter wins the round
          await prisma.player.update({
            where: { id: round.imposterId },
            data: { score: { increment: 1 } },
          })

          await prisma.round.update({
            where: { id: round.id },
            data: { status: 'COMPLETE' },
          })

          // Get updated players and build round result
          const updatedPlayers = await prisma.player.findMany({
            where: { lobbyId },
          })

          const imposter = updatedPlayers.find(p => p.id === round.imposterId)!
          const scores: Record<string, number> = {}
          updatedPlayers.forEach(p => scores[p.id] = p.score)

          const roundResult: RoundResult = {
            roundNumber: round.roundNumber,
            word: round.word,
            imposterId: round.imposterId,
            imposterName: imposter.name,
            wasImposterCaught: false,
            votesReceived: voteResults,
            pointsAwarded: [{
              playerId: round.imposterId,
              playerName: imposter.name,
              points: 1,
            }],
            newScores: scores,
          }

          // Check if imposter reached target score
          if (imposter.score >= lobby.targetScore) {
            roundResult.winner = imposter.id

            // Send game over event
            const gameOverEvent: PusherEvent = {
              type: 'GAME_OVER',
              winner: imposter,
              finalScores: scores,
            }
            await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', gameOverEvent)
          } else {
            // Just send round results
            const roundResultsEvent: PusherEvent = {
              type: 'ROUND_RESULTS',
              result: roundResult,
            }
            await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', roundResultsEvent)
          }
        }
      }
    }

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Error voting:', error)
    return apiError('Failed to vote', 500)
  }
}