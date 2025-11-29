import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')

    if (!code) {
      return NextResponse.json({ error: 'Lobby code is required' }, { status: 400 })
    }

    const lobby = await prisma.lobby.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        players: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    return NextResponse.json({
      lobbyId: lobby.id,
      code: lobby.code,
      players: lobby.players,
    })
  } catch (error) {
    console.error('Error looking up lobby:', error)
    return NextResponse.json({ error: 'Failed to lookup lobby' }, { status: 500 })
  }
}