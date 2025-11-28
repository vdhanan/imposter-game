import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { getMostVotedPlayer } from '@/lib/utils'
import type { PusherEvent } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const { lobbyId, voterId, suspectId } = await req.json()

    // Get current round
    const round = await prisma.round.findFirst({
      where: {
        lobbyId,
        status: 'VOTING',
      },
      include: {
        votes: true,
      },
    })

    if (!round) {
      return NextResponse.json({ error: 'No active voting round' }, { status: 404 })
    }

    // Check if player already voted
    const existingVote = round.votes.find(v => v.voterId === voterId)
    if (existingVote) {
      return NextResponse.json({ error: 'Already voted' }, { status: 400 })
    }

    // Prevent self-voting
    if (voterId === suspectId) {
      return NextResponse.json({ error: 'Cannot vote for yourself' }, { status: 400 })
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

    // Check if all players voted
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: { players: true },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

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
      const correctGuess = mostVoted === round.imposterId

      // If imposter was correctly identified, they get to guess the word
      if (correctGuess) {
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
        // Imposter wins - update scores
        await prisma.player.update({
          where: { id: round.imposterId },
          data: { score: { increment: 1 } },
        })

        await prisma.round.update({
          where: { id: round.id },
          data: { status: 'COMPLETE' },
        })
      }

      // Get updated scores
      const players = await prisma.player.findMany({
        where: { lobbyId },
      })

      const scores: Record<string, number> = {}
      players.forEach(p => {
        scores[p.id] = p.score
      })

      // Broadcast voting results
      const resultsEvent: PusherEvent = {
        type: 'VOTING_COMPLETE',
        results: {
          votes: voteResults,
          correctGuess,
          imposterId: round.imposterId,
          mostVoted,
        },
      }

      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', resultsEvent)

      if (!correctGuess) {
        // Round complete if imposter wasn't caught
        const completeEvent: PusherEvent = {
          type: 'ROUND_COMPLETE',
          scores,
        }
        await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', completeEvent)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error voting:', error)
    return NextResponse.json({ error: 'Failed to vote' }, { status: 500 })
  }
}