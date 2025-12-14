import { NextResponse } from 'next/server'
import { pusherServer } from '@/lib/pusher'
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const socketId = formData.get('socket_id') as string
    const channel = formData.get('channel_name') as string

    // Extract lobby ID from channel name (format: presence-lobby-{lobbyId})
    const lobbyMatch = channel.match(/^presence-lobby-(.+)$/)
    if (!lobbyMatch) {
      return NextResponse.json({ error: 'Invalid channel' }, { status: 403 })
    }

    const lobbyId = lobbyMatch[1]

    // Get player info from headers (client should use localStorage)
    const playerId = req.headers.get('x-player-id')
    const playerName = req.headers.get('x-player-name')

    if (!playerId || !playerName) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Verify player exists and belongs to the lobby
    const player = await prisma.player.findFirst({
      where: {
        id: playerId,
        lobbyId: lobbyId,
      },
      include: {
        lobby: true
      }
    })

    if (!player) {
      return NextResponse.json({ error: 'Player not in lobby' }, { status: 403 })
    }

    // Additional validation: ensure the player name matches
    if (player.name !== playerName) {
      return NextResponse.json({ error: 'Invalid player credentials' }, { status: 403 })
    }

    // Check if lobby exists and is active
    if (!player.lobby || player.lobby.state === 'GAME_OVER') {
      return NextResponse.json({ error: 'Lobby is not active' }, { status: 403 })
    }

    // Authorize the presence channel with user data
    const authResponse = pusherServer.authorizeChannel(socketId, channel, {
      user_id: playerId,
      user_info: {
        name: player.name,
        isHost: player.lobby.ownerId === playerId,
      },
    })

    return NextResponse.json(authResponse)
  } catch (error) {
    console.error('Pusher auth error:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}