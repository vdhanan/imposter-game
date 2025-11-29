import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  req: Request,
  { params }: { params: { lobbyId: string } }
) {
  try {
    const lobby = await prisma.lobby.findUnique({
      where: { id: params.lobbyId },
      include: {
        players: {
          orderBy: { joinedAt: 'asc' },
        },
        rounds: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            hints: {
              include: {
                player: true,
              },
              orderBy: { turnIndex: 'asc' },
            },
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    const latestRound = lobby.rounds[0]
    const currentRound = latestRound?.status !== 'COMPLETE' ? latestRound : null

    // Get the last completed round number for display
    const lastCompletedRound = await prisma.round.findFirst({
      where: {
        lobbyId: params.lobbyId,
        status: 'COMPLETE'
      },
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    })

    // Check if any player has reached the target score
    const hasWinner = lobby.players.some(p => p.score >= (lobby.targetScore || 7))

    // Check if game is in progress (players have scores but no winner yet)
    const gameInProgress = lobby.players.some(p => p.score > 0) && !hasWinner

    // Determine game state
    let gameState: string
    if (hasWinner) {
      gameState = 'GAME_OVER'
    } else if (currentRound) {
      // Active round in progress
      gameState = currentRound.status === 'VOTING' ? 'VOTING' :
                  currentRound.status === 'GUESSING' ? 'GUESSING' :
                  currentRound.status === 'HINTS_COMPLETE' ? 'VOTING' :
                  'IN_PROGRESS'
    } else if (gameInProgress) {
      // Between rounds - waiting for next round to start
      gameState = 'ROUND_RESULTS'
    } else {
      // No game started yet
      gameState = 'LOBBY'
    }

    return NextResponse.json({
      id: lobby.id,
      code: lobby.code,
      ownerId: lobby.ownerId,
      targetScore: lobby.targetScore || 7,
      players: lobby.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isOnline: p.isOnline,
      })),
      currentRound: currentRound ? {
        id: currentRound.id,
        roundNumber: currentRound.roundNumber,
        turnOrder: currentRound.turnOrder,
        currentTurn: currentRound.currentTurn,
        hints: currentRound.hints.map(h => ({
          id: h.id,
          playerId: h.playerId,
          playerName: h.player.name,
          text: h.text,
          turnIndex: h.turnIndex,
        })),
        status: currentRound.status,
      } : undefined,
      lastCompletedRoundNumber: lastCompletedRound?.roundNumber,
      state: gameState,
    })
  } catch (error) {
    console.error('Error fetching lobby:', error)
    return NextResponse.json({ error: 'Failed to fetch lobby' }, { status: 500 })
  }
}