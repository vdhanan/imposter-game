import { prisma } from '@/lib/db'

export async function cleanDatabase() {
  await prisma.bet.deleteMany()
  await prisma.emergencyVote.deleteMany()
  await prisma.vote.deleteMany()
  await prisma.hint.deleteMany()
  await prisma.round.deleteMany()
  await prisma.player.deleteMany()
  await prisma.lobby.deleteMany()
}

export async function createTestLobby(code: string, ownerId?: string) {
  // If no ownerId provided, create a temporary one
  const finalOwnerId = ownerId || 'temp-owner-' + Math.random().toString(36)

  return prisma.lobby.create({
    data: {
      code,
      ownerId: finalOwnerId,
      targetScore: 7,
      emergencyVotesEnabled: false,
      bettingEnabled: false,
    },
  })
}

export async function createTestPlayer(name: string, lobbyId: string, isOwner = false) {
  const player = await prisma.player.create({
    data: {
      lobbyId,
      name,
      score: 0,
      isOnline: true,
    },
  })

  // If this player should be the owner, update the lobby
  if (isOwner) {
    await prisma.lobby.update({
      where: { id: lobbyId },
      data: { ownerId: player.id }
    })
  }

  return player
}