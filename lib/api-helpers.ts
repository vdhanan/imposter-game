import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import type { Lobby, Player, Round } from '@prisma/client'
import type { RoundResult, PusherEvent } from '@/lib/types'

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

export const processBetPayouts = async (roundId: string, imposterId: string) => {
  const bets = await prisma.bet.findMany({
    where: { roundId },
    include: { bettor: true, target: true }
  })

  const results = []
  for (const bet of bets) {
    const won = bet.targetId === imposterId
    const payout = won ? bet.amount * 2 : 0
    const scoreChange = won ? bet.amount : -bet.amount

    await prisma.bet.update({
      where: { id: bet.id },
      data: { payout }
    })

    await prisma.player.update({
      where: { id: bet.bettorId },
      data: { score: { increment: scoreChange } }
    })

    results.push({
      bettorId: bet.bettorId,
      bettorName: bet.bettor.name,
      targetId: bet.targetId,
      targetName: bet.target.name,
      amount: bet.amount,
      won,
      payout
    })
  }
  return results
}

export const buildVoteResults = (votes: any[]): Record<string, string[]> => {
  const results: Record<string, string[]> = {}
  for (const vote of votes) {
    if (!results[vote.suspectId]) results[vote.suspectId] = []
    results[vote.suspectId].push(vote.voterId)
  }
  return results
}

export const checkWinner = async (lobbyId: string, targetScore: number) => {
  const players = await prisma.player.findMany({ where: { lobbyId } })
  return players.find(p => p.score >= targetScore)
}

export const buildRoundResult = async (
  round: any,
  lobby: any,
  wasImposterCaught: boolean,
  voteResults: Record<string, string[]>,
  pointsAwarded: any[],
  betResults: any[],
  imposterGuess?: string,
  imposterGuessedCorrectly?: boolean
): Promise<RoundResult> => {
  const players = await prisma.player.findMany({ where: { lobbyId: lobby.id } })
  const scores: Record<string, number> = {}
  players.forEach(p => scores[p.id] = p.score)

  const imposter = players.find(p => p.id === round.imposterId)!
  const winner = players.find(p => p.score >= lobby.targetScore)

  return {
    roundNumber: round.roundNumber,
    word: round.word,
    imposterId: round.imposterId,
    imposterName: imposter.name,
    wasImposterCaught,
    imposterGuess,
    imposterGuessedCorrectly,
    votesReceived: voteResults,
    betResults: betResults.length > 0 ? betResults : undefined,
    pointsAwarded,
    newScores: scores,
    winner: winner?.id
  }
}

export const sendGameEvent = async (lobbyId: string, roundResult: RoundResult) => {
  if (roundResult.winner) {
    const winner = await prisma.player.findUnique({ where: { id: roundResult.winner } })
    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
      type: 'GAME_OVER',
      winner: winner!,
      finalScores: roundResult.newScores
    } as PusherEvent)
  } else {
    await pusherServer.trigger(`lobby-${lobbyId}`, 'game-event', {
      type: 'ROUND_RESULTS',
      result: roundResult
    } as PusherEvent)
  }
}