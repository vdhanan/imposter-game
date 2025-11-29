import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import type { PusherEvent } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const { lobbyId, playerId, text } = await req.json()

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Hint text is required' }, { status: 400 })
    }

    const round = await prisma.round.findFirst({
      where: {
        lobbyId,
        status: 'IN_PROGRESS',
      },
      include: {
        hints: true,
      },
    })

    if (!round) {
      return NextResponse.json({ error: 'No active round' }, { status: 404 })
    }

    const currentPlayerIndex = round.currentTurn % round.turnOrder.length
    const currentPlayerId = round.turnOrder[currentPlayerIndex]
    if (currentPlayerId !== playerId) {
      return NextResponse.json({ error: 'Not your turn' }, { status: 403 })
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
    })

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    const hint = await prisma.hint.create({
      data: {
        roundId: round.id,
        playerId,
        text: text.trim(),
        turnIndex: round.currentTurn,
      },
    })

    const nextTurn = round.currentTurn + 1
    const totalTurns = round.turnOrder.length * 2 // Go through order twice

    let newStatus = round.status
    if (nextTurn >= totalTurns) {
      newStatus = 'HINTS_COMPLETE'
    }

    await prisma.round.update({
      where: { id: round.id },
      data: {
        currentTurn: nextTurn,
        status: newStatus,
      },
    })

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

    if (newStatus === 'HINTS_COMPLETE') {
      setTimeout(async () => {
        await prisma.round.update({
          where: { id: round.id },
          data: { status: 'VOTING' },
        })

        const votingEvent: PusherEvent = { type: 'VOTING_STARTED' }
        await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', votingEvent)
      }, 2000) // 2 second delay before voting
    } else {
      const nextPlayerId = round.turnOrder[nextTurn % round.turnOrder.length]
      const turnEvent: PusherEvent = {
        type: 'TURN_CHANGED',
        currentTurn: nextTurn,
        playerId: nextPlayerId,
      }
      await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', turnEvent)
    }

    return NextResponse.json({
      hintId: hint.id,
      nextTurn,
      isComplete: newStatus === 'HINTS_COMPLETE',
    })
  } catch (error) {
    console.error('Error submitting hint:', error)
    return NextResponse.json({ error: 'Failed to submit hint' }, { status: 500 })
  }
}