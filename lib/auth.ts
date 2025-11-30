import { prisma } from '@/lib/db'

/**
 * Simple validation to ensure a player exists in a lobby
 * This prevents impersonation by validating the playerId belongs to the lobby
 */
export async function validatePlayer(lobbyId: string, playerId: string): Promise<boolean> {
  if (!lobbyId || !playerId) return false

  const player = await prisma.player.findFirst({
    where: {
      id: playerId,
      lobbyId: lobbyId,
    },
  })

  return !!player
}

/**
 * Middleware helper to validate player in API routes
 */
export async function requireValidPlayer(lobbyId: string, playerId: string) {
  const isValid = await validatePlayer(lobbyId, playerId)

  if (!isValid) {
    throw new Error('Invalid player or lobby')
  }

  return true
}