import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateLobbyCode } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: Request) {
  try {
    const { playerName } = await req.json()

    if (!playerName || playerName.trim().length < 1) {
      return NextResponse.json({ error: 'Player name is required' }, { status: 400 })
    }

    let code: string
    let existingLobby

    // Generate unique lobby code
    do {
      code = generateLobbyCode()
      existingLobby = await prisma.lobby.findUnique({ where: { code } })
    } while (existingLobby)

    const playerId = uuidv4()

    // Create lobby with owner as first player
    const lobby = await prisma.lobby.create({
      data: {
        code,
        ownerId: playerId,
        players: {
          create: {
            id: playerId,
            name: playerName.trim(),
          },
        },
      },
      include: {
        players: true,
      },
    })

    return NextResponse.json({
      lobbyId: lobby.id,
      lobbyCode: lobby.code,
      playerId,
      playerName: playerName.trim(),
    })
  } catch (error) {
    console.error('Error creating lobby:', error)
    return NextResponse.json({ error: 'Failed to create lobby' }, { status: 500 })
  }
}