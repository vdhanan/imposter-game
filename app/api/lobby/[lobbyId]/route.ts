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
          where: { status: { not: 'COMPLETE' } },
          take: 1,
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

    const currentRound = lobby.rounds[0]

    return NextResponse.json({
      id: lobby.id,
      code: lobby.code,
      ownerId: lobby.ownerId,
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
      state: currentRound ?
        (currentRound.status === 'VOTING' ? 'VOTING' :
         currentRound.status === 'GUESSING' ? 'GUESSING' :
         currentRound.status === 'HINTS_COMPLETE' ? 'VOTING' :
         'IN_PROGRESS') : 'LOBBY',
    })
  } catch (error) {
    console.error('Error fetching lobby:', error)
    return NextResponse.json({ error: 'Failed to fetch lobby' }, { status: 500 })
  }
}