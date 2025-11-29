import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { processBetPayouts, buildVoteResults, buildRoundResult, sendGameEvent } from '@/lib/api-helpers'

export async function POST(req: Request) {
  try {
    const { lobbyId, playerId, guess } = await req.json()

    if (!guess || guess.trim().length === 0) {
      return NextResponse.json({ error: 'Guess is required' }, { status: 400 })
    }

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

    const imposterGuessedCorrectly = guess.trim().toLowerCase() === round.word.toLowerCase()

    // Get lobby and all votes for this round
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: { players: true },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    const votes = await prisma.vote.findMany({
      where: { roundId: round.id },
    })

    const voteResults = buildVoteResults(votes)

    const betResults = lobby.bettingEnabled
      ? await processBetPayouts(round.id, round.imposterId)
      : []

    let pointsAwarded: Array<{ playerId: string; playerName: string; points: number }> = []
    const imposter = lobby.players.find(p => p.id === round.imposterId)!

    if (imposterGuessedCorrectly) {
      await prisma.player.update({
        where: { id: round.imposterId },
        data: { score: { increment: 1 } },
      })
      pointsAwarded.push({
        playerId: round.imposterId,
        playerName: imposter.name,
        points: 1,
      })
    } else {
      await prisma.player.updateMany({
        where: {
          lobbyId,
          id: { not: round.imposterId },
        },
        data: { score: { increment: 1 } },
      })
      pointsAwarded = lobby.players
        .filter(p => p.id !== round.imposterId)
        .map(p => ({
          playerId: p.id,
          playerName: p.name,
          points: 1,
        }))
    }

    await prisma.round.update({
      where: { id: round.id },
      data: { status: 'COMPLETE' },
    })

    const roundResult = await buildRoundResult(
      round,
      lobby,
      true, // wasImposterCaught - they were caught, that's why they're guessing
      voteResults,
      pointsAwarded,
      betResults,
      guess.trim(),
      imposterGuessedCorrectly
    )

    await sendGameEvent(lobbyId, roundResult)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error submitting guess:', error)
    return NextResponse.json({ error: 'Failed to submit guess' }, { status: 500 })
  }
}