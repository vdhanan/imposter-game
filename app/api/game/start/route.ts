import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { getRandomWord, shuffleArray } from '@/lib/utils'
import type { PusherEvent } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const { lobbyId, playerId } = await req.json()

    // Verify lobby and player is owner
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: {
        players: true,
        rounds: {
          where: { status: { not: 'COMPLETE' } },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (lobby.ownerId !== playerId) {
      return NextResponse.json({ error: 'Only lobby owner can start game' }, { status: 403 })
    }

    if (lobby.players.length < 3) {
      return NextResponse.json({ error: 'Need at least 3 players to start' }, { status: 400 })
    }

    if (lobby.rounds.length > 0) {
      return NextResponse.json({ error: 'Game already in progress' }, { status: 400 })
    }

    // Get next round number
    const lastRound = await prisma.round.findFirst({
      where: { lobbyId },
      orderBy: { roundNumber: 'desc' },
    })
    const roundNumber = lastRound ? lastRound.roundNumber + 1 : 1

    // Select random word and imposter
    const word = getRandomWord()
    const playerIds = lobby.players.map(p => p.id)
    const imposterId = playerIds[Math.floor(Math.random() * playerIds.length)]
    const turnOrder = shuffleArray(playerIds)

    // Create round
    const round = await prisma.round.create({
      data: {
        lobbyId,
        roundNumber,
        word,
        imposterId,
        turnOrder,
        status: 'IN_PROGRESS',
      },
    })

    // Send private messages to each player
    for (const player of lobby.players) {
      const isImposter = player.id === imposterId
      await pusherServer.trigger(
        `player-${lobbyId}-${player.id}`,
        'private-event',
        {
          type: 'ROLE_ASSIGNED',
          role: isImposter ? 'IMPOSTER' : 'CIVILIAN',
          word: isImposter ? null : word,
        }
      )
    }

    // Broadcast game start to all players
    const event: PusherEvent = {
      type: 'GAME_STARTED',
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        imposterId: round.imposterId,
        turnOrder: round.turnOrder,
        currentTurn: 0,
        hints: [],
        status: round.status,
      },
    }

    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', event)

    return NextResponse.json({
      roundId: round.id,
      roundNumber: round.roundNumber,
      turnOrder,
      firstPlayer: turnOrder[0],
    })
  } catch (error) {
    console.error('Error starting game:', error)
    return NextResponse.json({ error: 'Failed to start game' }, { status: 500 })
  }
}