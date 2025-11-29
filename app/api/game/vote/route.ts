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

    const round = await getCurrentRound(lobbyId, 'VOTING')
    if (!round) {
      return apiError('No active voting round', 404)
    }

    if (round.votes.find(v => v.voterId === voterId)) {
      return apiError('Already voted')
    }

    // Create vote
    await prisma.vote.create({
      data: {
        roundId: round.id,
        voterId,
        suspectId,
      },
    })

    // Notify others that this player voted
    const voteEvent: PusherEvent = {
      type: 'VOTE_CAST',
      voterId,
    }
    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', voteEvent)

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

      // Broadcast voting results first
      const resultsEvent: PusherEvent = {
        type: 'VOTING_COMPLETE',
        results: {
          votes: voteResults,
          correctGuess: wasImposterCaught,
          imposterId: round.imposterId,
          mostVoted,
        },
      }
      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', resultsEvent)

      // If imposter was correctly identified, they get to guess the word
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

    return apiSuccess({ success: true })
  } catch (error) {
    console.error('Error voting:', error)
    return apiError('Failed to vote', 500)
  }
}