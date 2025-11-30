import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { validatePlayer } from '@/lib/auth'

export async function GET(
  req: Request,
  { params }: { params: { lobbyId: string } }
) {
  try {
    // Get playerId from query params
    const url = new URL(req.url)
    const playerId = url.searchParams.get('playerId')

    const lobby = await prisma.lobby.findUnique({
      where: { id: params.lobbyId },
      include: {
        players: {
          orderBy: { joinedAt: 'asc' },
        },
        rounds: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            hints: {
              include: {
                player: true,
              },
              orderBy: { turnIndex: 'asc' },
            },
            bets: {
              include: {
                bettor: true,
                target: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    const latestRound = lobby.rounds[0]
    const currentRound = latestRound?.status !== 'COMPLETE' ? latestRound : null

    // Get the last completed round number for display
    const lastCompletedRound = await prisma.round.findFirst({
      where: {
        lobbyId: params.lobbyId,
        status: 'COMPLETE'
      },
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    })

    // Determine game state
    const hasWinner = lobby.players.some(p => p.score >= (lobby.targetScore || 7))
    const gameInProgress = lobby.players.some(p => p.score > 0) && !hasWinner

    const getGameState = () => {
      if (hasWinner) return 'GAME_OVER'
      if (!currentRound) return gameInProgress ? 'ROUND_RESULTS' : 'LOBBY'

      const statusMap = {
        'BETTING': 'BETTING',
        'VOTING': 'VOTING',
        'EMERGENCY_VOTING': 'EMERGENCY_VOTING',
        'GUESSING': 'GUESSING',
        'HINTS_COMPLETE': lobby.bettingEnabled ? 'BETTING' : 'VOTING',
        'IN_PROGRESS': 'IN_PROGRESS',
        'WAITING': 'IN_PROGRESS',
        'COMPLETE': 'ROUND_RESULTS'
      }

      return statusMap[currentRound.status] || 'IN_PROGRESS'
    }

    const gameState = getGameState()

    // Add player-specific data only if playerId is valid for this lobby
    let playerData: { role?: string; word?: string | null; category?: string } | undefined
    if (playerId && currentRound) {
      const isValidPlayer = await validatePlayer(params.lobbyId, playerId)
      if (isValidPlayer) {
        const isImposter = currentRound.imposterId === playerId
        playerData = {
          role: isImposter ? 'IMPOSTER' : 'CIVILIAN',
          word: isImposter ? null : currentRound.word,
          category: currentRound.category,
        }
      }
    }

    return NextResponse.json({
      id: lobby.id,
      code: lobby.code,
      ownerId: lobby.ownerId,
      targetScore: lobby.targetScore || 7,
      emergencyVotesEnabled: lobby.emergencyVotesEnabled,
      bettingEnabled: lobby.bettingEnabled,
      players: lobby.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        isOnline: p.isOnline,
      })),
      currentRound: currentRound ? {
        id: currentRound.id,
        roundNumber: currentRound.roundNumber,
        turnOrder: currentRound.turnOrder,
        currentTurn: currentRound.currentTurn,
        hints: currentRound.hints.map(h => ({
          id: h.id,
          playerId: h.playerId,
          playerName: h.player.name,
          text: h.text,
          turnIndex: h.turnIndex,
        })),
        bets: currentRound.bets?.map(b => ({
          id: b.id,
          bettorId: b.bettorId,
          bettorName: b.bettor.name,
          targetId: b.targetId,
          targetName: b.target.name,
          amount: b.amount,
        })),
        status: currentRound.status,
      } : undefined,
      lastCompletedRoundNumber: lastCompletedRound?.roundNumber,
      state: gameState,
      ...(playerData && { playerData }), // Include player-specific data if available
    })
  } catch (error) {
    console.error('Error fetching lobby:', error)
    return NextResponse.json({ error: 'Failed to fetch lobby' }, { status: 500 })
  }
}