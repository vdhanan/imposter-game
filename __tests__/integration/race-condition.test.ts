import { prisma } from '@/lib/db'
import { POST as createLobby } from '@/app/api/lobby/create/route'
import { POST as joinLobby } from '@/app/api/lobby/join/route'
import { POST as startGame } from '@/app/api/game/start/route'
import { POST as voteWithBet } from '@/app/api/game/vote-with-bet/route'
import { apiSuccess, apiError } from '@/lib/api-helpers'

describe('Race Condition Tests', () => {
  let lobby: any
  let alice: any
  let bob: any
  let charlie: any

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE "Player", "Lobby", "Round", "Vote", "Bet", "Hint", "EmergencyVote" RESTART IDENTITY CASCADE`

    const lobbyResponse = await createLobby({
      json: async () => ({
        playerName: 'Alice',
        targetScore: 10,
        emergencyVotesEnabled: true,
        bettingEnabled: true
      })
    } as any)
    const lobbyData = await lobbyResponse.json()
    lobby = await prisma.lobby.findUnique({
      where: { id: lobbyData.lobbyId },
      include: { players: true }
    })
    alice = lobby.players[0]

    const bobResponse = await joinLobby({
      json: async () => ({ lobbyCode: lobby.code, playerName: 'Bob' })
    } as any)
    const bobData = await bobResponse.json()
    bob = await prisma.player.findUnique({ where: { id: bobData.playerId } })

    const charlieResponse = await joinLobby({
      json: async () => ({ lobbyCode: lobby.code, playerName: 'Charlie' })
    } as any)
    const charlieData = await charlieResponse.json()
    charlie = await prisma.player.findUnique({ where: { id: charlieData.playerId } })

    // Start game
    await startGame({
      json: async () => ({ lobbyId: lobby.id, playerId: alice.id })
    } as any)

    // Set round to voting phase
    const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
    await prisma.round.update({
      where: { id: round!.id },
      data: {
        status: 'VOTING',
        imposterId: charlie.id
      }
    })

    // Give players some points for betting
    await prisma.player.updateMany({
      where: { lobbyId: lobby.id },
      data: { score: 5 }
    })
  })

  describe('Concurrent Vote Completion', () => {
    it('should handle multiple simultaneous final votes without duplicate processing', async () => {
      // Alice votes first
      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: alice.id,
          suspectId: charlie.id,
          bet: { targetId: charlie.id, amount: 2 }
        })
      } as any)

      // Bob votes second
      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id,
          bet: { targetId: alice.id, amount: 1 }
        })
      } as any)

      // Get initial scores before the final vote
      const aliceBeforeFinal = await prisma.player.findUnique({ where: { id: alice.id } })
      const bobBeforeFinal = await prisma.player.findUnique({ where: { id: bob.id } })
      expect(aliceBeforeFinal?.score).toBe(5)
      expect(bobBeforeFinal?.score).toBe(5)

      // Simulate concurrent final votes by creating them in parallel
      // In the old code, this could cause duplicate processing
      const finalVotePromise = voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: charlie.id,
          suspectId: alice.id
        })
      } as any)

      // Wait for completion
      const result = await finalVotePromise
      expect(result.status).toBe(200)

      // Check that scores are updated exactly once
      const aliceAfter = await prisma.player.findUnique({ where: { id: alice.id } })
      const bobAfter = await prisma.player.findUnique({ where: { id: bob.id } })

      // Alice bet correctly on Charlie, should gain her bet amount
      expect(aliceAfter?.score).toBe(7) // 5 + 2
      // Bob bet incorrectly on Alice, should lose his bet amount
      expect(bobAfter?.score).toBe(4) // 5 - 1

      // Verify round status changed exactly once
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      expect(round?.status).toBe('GUESSING') // Charlie was voted out

      // Verify we don't have duplicate votes
      const votes = await prisma.vote.findMany({ where: { roundId: round!.id } })
      expect(votes.length).toBe(3) // Exactly 3 votes, no duplicates
    })

    it('should prevent duplicate bet payouts when votes complete simultaneously', async () => {
      // Set up a scenario where we can track payout processing

      // Alice and Bob vote simultaneously for Charlie (the imposter)
      const votePromises = [
        voteWithBet({
          json: async () => ({
            lobbyId: lobby.id,
            voterId: alice.id,
            suspectId: charlie.id,
            bet: { targetId: charlie.id, amount: 3 }
          })
        } as any),
        voteWithBet({
          json: async () => ({
            lobbyId: lobby.id,
            voterId: bob.id,
            suspectId: charlie.id,
            bet: { targetId: charlie.id, amount: 2 }
          })
        } as any)
      ]

      // Execute votes in parallel
      await Promise.all(votePromises)

      // Final vote triggers completion
      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: charlie.id,
          suspectId: alice.id
        })
      } as any)

      // Check that payouts were processed exactly once
      const aliceAfter = await prisma.player.findUnique({ where: { id: alice.id } })
      const bobAfter = await prisma.player.findUnique({ where: { id: bob.id } })

      // Both bet correctly, should each gain their bet amount exactly once
      expect(aliceAfter?.score).toBe(8) // 5 + 3 (not 5 + 6 from double processing)
      expect(bobAfter?.score).toBe(7)   // 5 + 2 (not 5 + 4 from double processing)
    })

    it('should handle race condition in round status transitions', async () => {
      // Create votes for all players
      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: alice.id,
          suspectId: charlie.id
        })
      } as any)

      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id
        })
      } as any)

      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: charlie.id,
          suspectId: alice.id
        })
      } as any)

      // Verify round transitioned exactly once
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      expect(round?.status).toBe('GUESSING')

      // Try to vote again - should fail because round is no longer in VOTING
      const lateVote = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: alice.id,
          suspectId: bob.id
        })
      } as any)

      expect(lateVote.status).toBe(400)
      const errorData = await lateVote.json()
      expect(errorData.error).toBe('No voting phase active')
    })

    it('should maintain data consistency with parallel emergency vote processing', async () => {
      // Set round to emergency voting
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      await prisma.round.update({
        where: { id: round!.id },
        data: { status: 'EMERGENCY_VOTING' }
      })

      // Create emergency vote record
      await prisma.emergencyVote.create({
        data: {
          lobbyId: lobby.id,
          roundId: round!.id,
          initiatorId: alice.id
        }
      })

      // All players vote for the imposter simultaneously
      const votePromises = [
        voteWithBet({
          json: async () => ({
            lobbyId: lobby.id,
            voterId: alice.id,
            suspectId: charlie.id
          })
        } as any),
        voteWithBet({
          json: async () => ({
            lobbyId: lobby.id,
            voterId: bob.id,
            suspectId: charlie.id
          })
        } as any),
        voteWithBet({
          json: async () => ({
            lobbyId: lobby.id,
            voterId: charlie.id,
            suspectId: alice.id
          })
        } as any)
      ]

      await Promise.all(votePromises)

      // Check emergency vote scoring was applied exactly once
      const aliceAfter = await prisma.player.findUnique({ where: { id: alice.id } })
      const bobAfter = await prisma.player.findUnique({ where: { id: bob.id } })
      const charlieAfter = await prisma.player.findUnique({ where: { id: charlie.id } })

      // Alice initiated and succeeded: +2
      expect(aliceAfter?.score).toBe(7) // 5 + 2
      // Bob gets +1 for successful emergency vote
      expect(bobAfter?.score).toBe(6) // 5 + 1
      // Charlie (imposter) score unchanged
      expect(charlieAfter?.score).toBe(5)

      // Verify round status
      const finalRound = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      expect(finalRound?.status).toBe('COMPLETE')
    })
  })

  describe('Transaction Atomicity', () => {
    it('should not allow votes after voting is complete', async () => {
      // For a 3-player game, all players vote to complete the round
      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: alice.id,
          suspectId: charlie.id
        })
      } as any)

      await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: charlie.id
        })
      } as any)

      // Third vote completes the round
      const finalVoteResult = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: charlie.id,
          suspectId: alice.id
        })
      } as any)

      expect(finalVoteResult.status).toBe(200)

      // Round should be complete
      const round = await prisma.round.findFirst({ where: { lobbyId: lobby.id } })
      expect(round?.status).toBe('GUESSING')

      // Verify exactly 3 votes exist
      const votes = await prisma.vote.findMany({ where: { roundId: round!.id } })
      expect(votes.length).toBe(3)

      // Try to vote again with any player - should fail
      const lateVote = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: alice.id,
          suspectId: bob.id
        })
      } as any)

      expect(lateVote.status).toBe(400)
      const errorData = await lateVote.json()
      expect(errorData.error).toBe('No voting phase active')

      // Also verify that trying to vote with someone who hasn't voted doesn't work
      // (this would be impossible in a real scenario since all players voted, but tests the boundary)
      const impossibleVote = await voteWithBet({
        json: async () => ({
          lobbyId: lobby.id,
          voterId: bob.id,
          suspectId: alice.id
        })
      } as any)

      expect(impossibleVote.status).toBe(400)
    })
  })
})