import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import type { PusherEvent } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const { lobbyId, playerId, guess } = await req.json()

    if (!guess || guess.trim().length === 0) {
      return NextResponse.json({ error: 'Guess is required' }, { status: 400 })
    }

    // Get current round
    const round = await prisma.round.findFirst({
      where: {
        lobbyId,
        status: 'GUESSING',
      },
    })

    if (!round) {
      return NextResponse.json({ error: 'No active guessing round' }, { status: 404 })
    }

    // Verify player is the imposter
    if (round.imposterId !== playerId) {
      return NextResponse.json({ error: 'Only imposter can guess' }, { status: 403 })
    }

    // Check if guess is correct
    const correctGuess = guess.trim().toLowerCase() === round.word.toLowerCase()

    // Update scores
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: { players: true },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (correctGuess) {
      // Imposter guessed correctly - imposter gets a point
      await prisma.player.update({
        where: { id: round.imposterId },
        data: { score: { increment: 1 } },
      })
    } else {
      // Imposter guessed wrong - everyone else gets a point
      await prisma.player.updateMany({
        where: {
          lobbyId,
          id: { not: round.imposterId },
        },
        data: { score: { increment: 1 } },
      })
    }

    // Mark round as complete
    await prisma.round.update({
      where: { id: round.id },
      data: { status: 'COMPLETE' },
    })

    // Get updated scores
    const players = await prisma.player.findMany({
      where: { lobbyId },
    })

    const scores: Record<string, number> = {}
    players.forEach(p => {
      scores[p.id] = p.score
    })

    // Broadcast round complete
    const completeEvent: PusherEvent = {
      type: 'ROUND_COMPLETE',
      scores,
    }

    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', completeEvent)

    // Also send the actual word and guess result
    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
      type: 'GUESS_RESULT',
      guess: guess.trim(),
      actualWord: round.word,
      correct: correctGuess,
      imposterId: round.imposterId,
    })

    return NextResponse.json({
      correct: correctGuess,
      actualWord: round.word,
      scores,
    })
  } catch (error) {
    console.error('Error submitting guess:', error)
    return NextResponse.json({ error: 'Failed to submit guess' }, { status: 500 })
  }
}