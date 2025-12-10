import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import type { PusherEvent } from '@/lib/types'
import { requireValidPlayer } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const { lobbyId, playerId, text } = await req.json()

    // Validate input
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Hint text is required' }, { status: 400 })
    }

    // Validate player belongs to lobby
    try {
      await requireValidPlayer(lobbyId, playerId)
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Get current round and lobby in one query
    const lobby = await prisma.lobby.findUnique({
      where: { id: lobbyId },
      include: {
        rounds: {
          where: { status: 'IN_PROGRESS' },
          include: { hints: true },
          take: 1
        }
      }
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    const round = lobby.rounds[0]
    if (!round) {
      return NextResponse.json({ error: 'No active round' }, { status: 404 })
    }

    // Verify it's the player's turn
    const currentPlayerIndex = round.currentTurn % round.turnOrder.length
    const currentPlayerId = round.turnOrder[currentPlayerIndex]
    if (currentPlayerId !== playerId) {
      return NextResponse.json({ error: 'Not your turn' }, { status: 403 })
    }

    // Get player info
    const player = await prisma.player.findUnique({
      where: { id: playerId },
    })

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    // Create the hint
    const hint = await prisma.hint.create({
      data: {
        roundId: round.id,
        playerId,
        text: text.trim(),
        turnIndex: round.currentTurn,
      },
    })

    // Calculate next turn
    const nextTurn = round.currentTurn + 1
    const totalTurns = round.turnOrder.length * 2 // Two passes through all players
    const isLastHint = nextTurn >= totalTurns

    // Send hint submitted event
    const hintEvent: PusherEvent = {
      type: 'HINT_SUBMITTED',
      hint: {
        id: hint.id,
        playerId: hint.playerId,
        playerName: player.name,
        text: hint.text,
        turnIndex: hint.turnIndex,
      },
    }
    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', hintEvent)

    if (isLastHint) {
      // Transition to voting phase
      await prisma.round.update({
        where: { id: round.id },
        data: { status: 'VOTING' }
      })

      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', { type: 'VOTING_STARTED' })
    } else {
      // Update turn for next player
      await prisma.round.update({
        where: { id: round.id },
        data: {
          currentTurn: nextTurn,
        },
      })

      // Send turn changed event
      const nextPlayerIndex = nextTurn % round.turnOrder.length
      const nextPlayerId = round.turnOrder[nextPlayerIndex]

      const turnEvent: PusherEvent = {
        type: 'TURN_CHANGED',
        currentTurn: nextTurn,
        playerId: nextPlayerId,
      }
      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', turnEvent)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error submitting hint:', error)
    return NextResponse.json({ error: 'Failed to submit hint' }, { status: 500 })
  }
}