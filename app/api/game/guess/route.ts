import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import type { PusherEvent, RoundResult } from '@/lib/types'

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

    // Build vote results for round result
    const voteResults: Record<string, string[]> = {}
    for (const vote of votes) {
      if (!voteResults[vote.suspectId]) {
        voteResults[vote.suspectId] = []
      }
      voteResults[vote.suspectId].push(vote.voterId)
    }

    // Determine who gets points and update scores
    let pointsAwarded: RoundResult['pointsAwarded'] = []
    let winner: string | undefined

    if (imposterGuessedCorrectly) {
      // Imposter guessed correctly - imposter gets a point
      await prisma.player.update({
        where: { id: round.imposterId },
        data: { score: { increment: 1 } },
      })

      const imposter = lobby.players.find(p => p.id === round.imposterId)!
      pointsAwarded.push({
        playerId: round.imposterId,
        playerName: imposter.name,
        points: 1,
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

      pointsAwarded = lobby.players
        .filter(p => p.id !== round.imposterId)
        .map(p => ({
          playerId: p.id,
          playerName: p.name,
          points: 1,
        }))
    }

    // Mark round as complete
    await prisma.round.update({
      where: { id: round.id },
      data: { status: 'COMPLETE' },
    })

    // Get updated scores
    const updatedPlayers = await prisma.player.findMany({
      where: { lobbyId },
    })

    const scores: Record<string, number> = {}
    updatedPlayers.forEach(p => scores[p.id] = p.score)

    // Find the imposter player
    const imposter = updatedPlayers.find(p => p.id === round.imposterId)!

    // Check if anyone reached target score
    const potentialWinner = updatedPlayers.find(p => p.score >= lobby.targetScore)
    if (potentialWinner) {
      winner = potentialWinner.id
    }

    // Build round result
    const roundResult: RoundResult = {
      roundNumber: round.roundNumber,
      word: round.word,
      imposterId: round.imposterId,
      imposterName: imposter.name,
      wasImposterCaught: true, // They were caught, that's why they're guessing
      imposterGuess: guess.trim(),
      imposterGuessedCorrectly,
      votesReceived: voteResults,
      pointsAwarded,
      newScores: scores,
      winner,
    }

    // Send appropriate event based on game state
    if (winner) {
      const winnerPlayer = updatedPlayers.find(p => p.id === winner)!
      const gameOverEvent: PusherEvent = {
        type: 'GAME_OVER',
        winner: winnerPlayer,
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

    return NextResponse.json({
      correct: imposterGuessedCorrectly,
      actualWord: round.word,
      scores,
      winner,
    })
  } catch (error) {
    console.error('Error submitting guess:', error)
    return NextResponse.json({ error: 'Failed to submit guess' }, { status: 500 })
  }
}