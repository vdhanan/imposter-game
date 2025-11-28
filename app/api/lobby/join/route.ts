import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { v4 as uuidv4 } from 'uuid'
import type { PusherEvent } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const { lobbyCode, playerName } = await req.json()

    if (!lobbyCode || !playerName) {
      return NextResponse.json({ error: 'Lobby code and player name are required' }, { status: 400 })
    }

    // Find lobby
    const lobby = await prisma.lobby.findUnique({
      where: { code: lobbyCode.toUpperCase() },
      include: {
        players: true,
        rounds: {
          where: { status: { not: 'COMPLETE' } },
          take: 1,
        }
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    // Check if game already started
    if (lobby.rounds.length > 0) {
      return NextResponse.json({ error: 'Game already in progress' }, { status: 400 })
    }

    // Check if player name already exists
    const existingPlayer = lobby.players.find(p => p.name === playerName.trim())
    if (existingPlayer) {
      return NextResponse.json({ error: 'Player name already taken' }, { status: 400 })
    }

    // Check max players
    if (lobby.players.length >= 10) {
      return NextResponse.json({ error: 'Lobby is full' }, { status: 400 })
    }

    const playerId = uuidv4()

    // Add player to lobby
    const player = await prisma.player.create({
      data: {
        id: playerId,
        lobbyId: lobby.id,
        name: playerName.trim(),
      },
    })

    // Notify other players via Pusher
    const event: PusherEvent = {
      type: 'PLAYER_JOINED',
      player: {
        id: player.id,
        name: player.name,
        score: player.score,
        isOnline: player.isOnline,
      },
    }

    await pusherServer.trigger(`lobby-${lobby.id}`, 'game-event', event)

    return NextResponse.json({
      lobbyId: lobby.id,
      lobbyCode: lobby.code,
      playerId: player.id,
      playerName: player.name,
      ownerId: lobby.ownerId,
      players: [...lobby.players, player].map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isOnline: p.isOnline,
      })),
    })
  } catch (error) {
    console.error('Error joining lobby:', error)
    return NextResponse.json({ error: 'Failed to join lobby' }, { status: 500 })
  }
}