/**
 * Emergency Vote Validation Tests
 */

import { prisma } from '@/lib/db'
import { cleanDatabase, createTestLobby, createTestPlayer } from '../utils/test-helpers'
import { POST as startGame } from '@/app/api/game/start/route'
import { POST as callEmergencyVote } from '@/app/api/game/emergency-vote/route'

describe('Emergency Vote Validation', () => {
  beforeEach(async () => {
    await cleanDatabase()
  })

  afterEach(async () => {
    await cleanDatabase()
  })

  it('should not allow emergency vote during voting phase', async () => {
    const lobby = await createTestLobby('EMRV1', {
      emergencyVotesEnabled: true
    })
    const alice = await createTestPlayer('Alice', lobby.id, true)
    const bob = await createTestPlayer('Bob', lobby.id)
    const charlie = await createTestPlayer('Charlie', lobby.id)

    await startGame({
      json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
    } as any)

    const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })

    // Set to voting phase
    await prisma.round.update({
      where: { id: round!.id },
      data: { status: 'VOTING', imposterId: charlie.id }
    })

    // Try to call emergency vote during voting
    const response = await callEmergencyVote({
      json: async () => ({
        lobbyId: lobby.id,
        initiatorId: bob.id
      })
    } as any)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Emergency votes can only be called during hint phase, not during voting')
  })

  it('should allow emergency vote during hint phase', async () => {
    const lobby = await createTestLobby('EMRV2', {
      emergencyVotesEnabled: true
    })
    const alice = await createTestPlayer('Alice', lobby.id, true)
    const bob = await createTestPlayer('Bob', lobby.id)
    const charlie = await createTestPlayer('Charlie', lobby.id)

    await startGame({
      json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
    } as any)

    const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })

    // Make sure Charlie is the imposter, not Bob
    await prisma.round.update({
      where: { id: round!.id },
      data: { imposterId: charlie.id }
    })

    // Should be IN_PROGRESS (hint phase) by default
    expect(round?.status).toBe('IN_PROGRESS')

    // Call emergency vote during hint phase - should succeed
    const response = await callEmergencyVote({
      json: async () => ({
        lobbyId: lobby.id,
        initiatorId: bob.id
      })
    } as any)

    expect(response.status).toBe(200)

    // Verify emergency vote was created
    const emergencyVote = await prisma.emergencyVote.findFirst({
      where: { roundId: round!.id }
    })
    expect(emergencyVote).toBeTruthy()
    expect(emergencyVote?.initiatorId).toBe(bob.id)

    // Verify round is now in EMERGENCY_VOTING
    const updatedRound = await prisma.round.findUnique({ where: { id: round!.id } })
    expect(updatedRound?.status).toBe('EMERGENCY_VOTING')
  })

  it('should not allow emergency vote during EMERGENCY_VOTING phase', async () => {
    const lobby = await createTestLobby('EMRV3', {
      emergencyVotesEnabled: true
    })
    const alice = await createTestPlayer('Alice', lobby.id, true)
    const bob = await createTestPlayer('Bob', lobby.id)
    const charlie = await createTestPlayer('Charlie', lobby.id)

    await startGame({
      json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
    } as any)

    const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })

    // Ensure Charlie is the imposter so Bob can call emergency vote
    // This is necessary because imposters cannot call emergency votes
    await prisma.round.update({
      where: { id: round!.id },
      data: { imposterId: charlie.id }
    })

    // First emergency vote
    await callEmergencyVote({
      json: async () => ({
        lobbyId: lobby.id,
        initiatorId: bob.id
      })
    } as any)

    // Verify we're in EMERGENCY_VOTING
    const updatedRound = await prisma.round.findUnique({ where: { id: round!.id } })
    expect(updatedRound?.status).toBe('EMERGENCY_VOTING')

    // Try to call another emergency vote
    const response = await callEmergencyVote({
      json: async () => ({
        lobbyId: lobby.id,
        initiatorId: charlie.id
      })
    } as any)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Emergency vote already in progress')
  })
})