import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { Lobby, Player, Round } from '@prisma/client'

export const apiError = (message: string, status: number = 400) =>
  NextResponse.json({ error: message }, { status })

export const apiSuccess = <T = any>(data: T) =>
  NextResponse.json(data)

export const getLobbyWithPlayers = async (lobbyId: string) => {
  const lobby = await prisma.lobby.findUnique({
    where: { id: lobbyId },
    include: { players: true }
  })

  if (!lobby) throw new Error('Lobby not found')
  return lobby
}

export const getCurrentRound = async (lobbyId: string, status?: string) => {
  const query = status
    ? { lobbyId, status }
    : { lobbyId, status: { not: 'COMPLETE' } }

  return prisma.round.findFirst({
    where: query as any,
    include: { votes: true, hints: true }
  })
}

export const verifyLobbyOwner = (lobby: Lobby, playerId: string) => {
  if (lobby.ownerId !== playerId) {
    throw new Error('Only lobby owner can perform this action')
  }
}

export const verifyMinPlayers = (players: Player[], minPlayers: number = 3) => {
  if (players.length < minPlayers) {
    throw new Error(`Need at least ${minPlayers} players`)
  }
}