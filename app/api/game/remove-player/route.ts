import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import type { PusherEvent } from '@/lib/types'
import type { Round, Bet, Hint, Vote, EmergencyVote, Player, Lobby } from '@prisma/client'

// Type for Round with its relations
type RoundWithRelations = Round & {
  hints: Hint[]
  votes: Vote[]
  bets: Bet[]
  emergencyVote: EmergencyVote | null
}

// Type for Lobby with its relations
type LobbyWithRelations = Lobby & {
  players: Player[]
  rounds: RoundWithRelations[]
}

// Helper function to handle imposter removal
async function handleImposterRemoval(
  currentRound: RoundWithRelations,
  playerIdToRemove: string,
  lobbyId: string,
  onlinePlayers: Player[]
) {
  const isImposter = currentRound.imposterId === playerIdToRemove

  if (!isImposter) return { roundEnded: false, endReason: '' }

  let endReason = ''

  if (currentRound.status === 'GUESSING') {
    // Imposter forfeits during guessing
    endReason = 'Imposter forfeited during guessing'

    // Award points to civilians
    const civilians = onlinePlayers.filter(p => p.id !== playerIdToRemove)
    for (const civilian of civilians) {
      await prisma.player.update({
        where: { id: civilian.id },
        data: { score: { increment: 1 } }
      })
    }
  } else {
    // Imposter removed during other phases - civilians win
    endReason = 'Imposter left the game - Civilians win!'

    // Award points to remaining civilians
    const civilians = onlinePlayers.filter(p => p.id !== playerIdToRemove)
    for (const civilian of civilians) {
      await prisma.player.update({
        where: { id: civilian.id },
        data: { score: { increment: 1 } }
      })
    }
  }

  // End the round
  await prisma.round.update({
    where: { id: currentRound.id },
    data: { status: 'COMPLETE' }
  })

  return { roundEnded: true, endReason }
}

// Helper function to adjust turn order during HINTS phase
async function adjustTurnOrder(
  currentRound: RoundWithRelations,
  playerIdToRemove: string,
  lobbyId: string
) {
  if (currentRound.status !== 'IN_PROGRESS') return

  const turnOrder = [...currentRound.turnOrder]
  const playerIndex = turnOrder.indexOf(playerIdToRemove)

  if (playerIndex === -1) return

  const currentPlayerIndex = currentRound.currentTurn % turnOrder.length
  const isCurrentPlayer = turnOrder[currentPlayerIndex] === playerIdToRemove

  // Remove from turn order
  turnOrder.splice(playerIndex, 1)

  // Adjust current turn if needed
  let newCurrentTurn = currentRound.currentTurn
  if (isCurrentPlayer) {
    // Skip to next player (same index now points to next)
  } else if (playerIndex < currentPlayerIndex) {
    // Player removed before current turn, adjust index
    newCurrentTurn = Math.max(0, currentRound.currentTurn - 1)
  }

  await prisma.round.update({
    where: { id: currentRound.id },
    data: {
      turnOrder,
      currentTurn: newCurrentTurn
    }
  })

  // If it was their turn, notify next player
  if (isCurrentPlayer && turnOrder.length > 0) {
    const nextPlayerIndex = newCurrentTurn % turnOrder.length
    const nextPlayerId = turnOrder[nextPlayerIndex]

    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
      type: 'TURN_CHANGED',
      currentTurn: newCurrentTurn,
      playerId: nextPlayerId
    } as PusherEvent)
  }
}

// Helper function to check and complete voting if needed
async function checkVotingCompletion(
  currentRound: RoundWithRelations,
  playerIdToRemove: string,
  lobbyId: string,
  onlinePlayers: Player[]
) {
  if (currentRound.status !== 'VOTING' && currentRound.status !== 'EMERGENCY_VOTING') {
    return
  }

  // Use transaction to prevent race conditions
  await prisma.$transaction(async (tx) => {
    // Get fresh round data within transaction
    const round = await tx.round.findUnique({
      where: { id: currentRound.id },
      include: { votes: true }
    })

    if (!round) return

    // Check if voting should complete - only count votes from remaining online players
    const remainingPlayers = onlinePlayers.filter(p => p.id !== playerIdToRemove)
    const remainingPlayerIds = new Set(remainingPlayers.map(p => p.id))

    // Only count votes from players who are still in the game
    const validVotes = round.votes.filter(v => remainingPlayerIds.has(v.voterId))
    const votesNeeded = remainingPlayers.length

    // Only complete voting if ALL remaining players have voted
    if (validVotes.length >= votesNeeded) {
      // Build vote results
      const voteResults: Record<string, string[]> = {}
      for (const vote of round.votes) {
        if (!voteResults[vote.suspectId]) {
          voteResults[vote.suspectId] = []
        }
        voteResults[vote.suspectId].push(vote.voterId)
      }

      // Determine who was voted out
      const voteCounts: Record<string, number> = {}
      for (const [suspectId, voters] of Object.entries(voteResults)) {
        voteCounts[suspectId] = voters.length
      }
      const maxVotes = Math.max(...Object.values(voteCounts))
      const winners = Object.entries(voteCounts)
        .filter(([_, count]) => count === maxVotes)
        .map(([playerId]) => playerId)
      const votedOutPlayerId = winners.length === 1 ? winners[0] : null

      const wasImposterCaught = votedOutPlayerId === round.imposterId
      const mostVoted = votedOutPlayerId || ''

      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
        type: 'VOTING_COMPLETE',
        results: {
          votes: voteResults,
          correctGuess: wasImposterCaught,
          imposterId: round.imposterId,
          mostVoted
        }
      } as PusherEvent)

      // Handle round completion based on vote outcome
      if (votedOutPlayerId === round.imposterId) {
        await tx.round.update({
          where: { id: round.id },
          data: { status: 'GUESSING' }
        })

        await pusherServer.trigger(
          `player-${lobbyId}-${round.imposterId}`,
          'private-event',
          { type: 'GUESS_WORD_PROMPT' }
        )
      } else {
        await tx.round.update({
          where: { id: round.id },
          data: { status: 'COMPLETE' }
        })
      }
    }
  })
}

// Helper function to handle bet adjustments
async function handleBetAdjustments(
  currentRound: RoundWithRelations,
  playerIdToRemove: string,
  lobbyId: string
) {
  if (!currentRound.bets || currentRound.bets.length === 0) return

  // Forfeit bets placed by removed player
  const playerBets = currentRound.bets.filter(b => b.bettorId === playerIdToRemove)
  for (const bet of playerBets) {
    await prisma.bet.update({
      where: { id: bet.id },
      data: { payout: -bet.amount }
    })

    // Deduct points immediately
    await prisma.player.update({
      where: { id: bet.bettorId },
      data: { score: { decrement: bet.amount } }
    })
  }

  // Refund bets placed ON removed player
  const betsOnPlayer = currentRound.bets.filter(b => b.targetId === playerIdToRemove)
  for (const bet of betsOnPlayer) {
    // Mark bet as refunded (no payout, no loss)
    await prisma.bet.update({
      where: { id: bet.id },
      data: { payout: 0 }
    })
    // Note: We don't change the score here because:
    // - The bet amount was already deducted when the bet was placed
    // - Setting payout to 0 means no additional win/loss
    // - The player effectively gets their bet back (neutral outcome)
  }
}

// Helper function to handle host transfer
async function transferHostIfNeeded(
  lobby: LobbyWithRelations,
  playerIdToRemove: string
) {
  if (lobby.ownerId !== playerIdToRemove) return

  // Transfer host to next online player
  const newHost = lobby.players.find(p => p.isOnline && p.id !== playerIdToRemove)

  if (newHost) {
    await prisma.lobby.update({
      where: { id: lobby.id },
      data: { ownerId: newHost.id }
    })

    await pusherServer.trigger(`lobby-${lobby.id}`, 'game-event', {
      type: 'HOST_CHANGED',
      newHostId: newHost.id
    } as PusherEvent)
  }
}

export async function POST(req: Request) {
  try {
    const { lobbyId, hostId, playerIdToRemove } = await req.json()

    // Get lobby with all related data
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: {
        players: true,
        rounds: {
          orderBy: { createdAt: 'desc' },
          include: {
            hints: true,
            votes: true,
            bets: true,
            emergencyVote: true
          },
          take: 1
        }
      }
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    // Verify host permission
    if (lobby.ownerId !== hostId) {
      return NextResponse.json({ error: 'Only the host can remove players' }, { status: 403 })
    }

    // Check minimum player requirement (count only online players)
    const onlinePlayers = lobby.players.filter(p => p.isOnline)
    if (onlinePlayers.length <= 3) {
      return NextResponse.json({ error: 'Cannot remove player: minimum 3 players required' }, { status: 400 })
    }

    const currentRound = lobby.rounds[0]

    // Block removal during certain phases
    if (currentRound && currentRound.status === 'COMPLETE') {
      return NextResponse.json({ error: 'Cannot remove players during results phase' }, { status: 400 })
    }

    const playerToRemove = lobby.players.find(p => p.id === playerIdToRemove)
    if (!playerToRemove) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    // Mark player as offline
    await prisma.player.update({
      where: { id: playerIdToRemove },
      data: { isOnline: false }
    })

    // Handle different game state adjustments
    let roundEnded = false
    let endReason = ''

    if (currentRound) {
      // Handle imposter removal
      const imposterResult = await handleImposterRemoval(
        currentRound,
        playerIdToRemove,
        lobbyId,
        onlinePlayers
      )
      roundEnded = imposterResult.roundEnded
      endReason = imposterResult.endReason

      if (!roundEnded) {
        // Only adjust game state if round didn't end
        await adjustTurnOrder(currentRound, playerIdToRemove, lobbyId)
        await checkVotingCompletion(currentRound, playerIdToRemove, lobbyId, onlinePlayers)
        await handleBetAdjustments(currentRound, playerIdToRemove, lobbyId)
      }
    }

    // Handle host transfer if needed
    await transferHostIfNeeded(lobby, playerIdToRemove)

    // Notify all players
    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
      type: 'PLAYER_REMOVED',
      playerId: playerIdToRemove,
      playerName: playerToRemove.name
    } as PusherEvent)

    return NextResponse.json({
      success: true,
      roundEnded,
      reason: endReason
    })
  } catch (error) {
    console.error('Error removing player:', error)
    return NextResponse.json({ error: 'Failed to remove player' }, { status: 500 })
  }
}