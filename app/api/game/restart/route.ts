import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import type { PusherEvent } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const { lobbyId, playerId } = await req.json()

    // Verify the player is the owner
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: { players: true },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (lobby.ownerId !== playerId) {
      return NextResponse.json({ error: 'Only the host can restart the game' }, { status: 403 })
    }

    // Reset all player scores
    await prisma.player.updateMany({
      where: { lobbyId },
      data: { score: 0 },
    })

    // Delete all rounds for this lobby
    await prisma.round.deleteMany({
      where: { lobbyId },
    })

    // Broadcast game restart event
    const restartEvent: PusherEvent = {
      type: 'GAME_RESTARTED',
    }
    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', restartEvent)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error restarting game:', error)
    return NextResponse.json({ error: 'Failed to restart game' }, { status: 500 })
  }
}