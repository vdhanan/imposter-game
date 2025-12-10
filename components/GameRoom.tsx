'use client'

import { useState, useEffect } from 'react'
import type { LobbyData, VoteResults, RoundResult, PlayerData, BetData } from '@/lib/types'
import PlayerScoreboard from './GameRoom/PlayerScoreboard'
import HintsSection from './GameRoom/HintsSection'
import VotingPhaseSection from './GameRoom/VotingPhaseSection'
import RoundResults from './GameRoom/RoundResults'
import GameOver from './GameRoom/GameOver'
import GuessingSection from './GameRoom/GuessingSection'

interface GameRoomProps {
  lobby: LobbyData
  playerId: string
  playerName: string
  role: 'CIVILIAN' | 'IMPOSTER' | null
  word: string | null
  category: string | null
  isMyTurn: boolean
  votingResults: VoteResults | null
  guessPrompt: boolean
  votedPlayers: string[]
  roundResult: RoundResult | null
  gameWinner: PlayerData | null
}

export default function GameRoom({
  lobby,
  playerId,
  playerName,
  role,
  word,
  category,
  isMyTurn,
  votingResults,
  guessPrompt,
  votedPlayers,
  roundResult,
  gameWinner,
}: GameRoomProps) {
  const [startingNextRound, setStartingNextRound] = useState(false)
  const [restartingGame, setRestartingGame] = useState(false)


  const handleSubmitHint = async (hint: string) => {
    const response = await fetch('/api/game/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lobbyId: lobby.id,
        playerId,
        text: hint,
      }),
    })

    if (!response.ok) {
      const data = await response.json()
      alert(data.error || 'Failed to submit hint')
    }
  }

  const handleEmergencyVote = async () => {
    if (window.confirm('Are you sure? You will lose 1 point if the imposter is not caught!')) {
      const response = await fetch('/api/game/emergency-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId: lobby.id,
          initiatorId: playerId,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        alert(data.error || 'Failed to initiate emergency vote')
      }
    }
  }



  const handleStartNextRound = async () => {
    if (!playerId || !lobby || lobby.ownerId !== playerId) return

    setStartingNextRound(true)
    try {
      const response = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobbyId: lobby.id, playerId }),
      })

      if (!response.ok) {
        const data = await response.json()
        alert(data.error || 'Failed to start next round')
      }
    } catch (error) {
      alert('Failed to start next round')
    } finally {
      setStartingNextRound(false)
    }
  }

  const handleRestartGame = async () => {
    if (!playerId || !lobby || lobby.ownerId !== playerId) return

    setRestartingGame(true)
    try {
      const response = await fetch('/api/game/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobbyId: lobby.id, playerId }),
      })

      if (!response.ok) {
        const data = await response.json()
        alert(data.error || 'Failed to restart game')
      }
    } catch (error) {
      alert('Failed to restart game')
    } finally {
      setRestartingGame(false)
    }
  }

  const getCurrentPlayer = () => {
    if (!lobby.currentRound) return null
    const currentIndex = lobby.currentRound.currentTurn % lobby.currentRound.turnOrder.length
    const currentPlayerId = lobby.currentRound.turnOrder[currentIndex]
    return lobby.players.find(p => p.id === currentPlayerId)
  }

  const currentPlayer = getCurrentPlayer()
  const currentPass = Math.floor((lobby.currentRound?.currentTurn || 0) / (lobby.currentRound?.turnOrder.length || 1)) + 1
  const isOwner = lobby.ownerId === playerId

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-xl p-6 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                {lobby.state === 'GAME_OVER'
                  ? 'Game Over!'
                  : lobby.state === 'ROUND_RESULTS' && !lobby.currentRound
                  ? `After Round ${lobby.lastCompletedRoundNumber || 1}`
                  : `Round ${lobby.currentRound?.roundNumber || 1}`}
              </h1>
              <p className="text-gray-600">
                {lobby.state === 'VOTING' ? 'Vote for the imposter!' :
                 lobby.state === 'EMERGENCY_VOTING' ? '🚨 Emergency Vote! Vote for the imposter!' :
                 lobby.state === 'GUESSING' ? 'Imposter is guessing...' :
                 lobby.state === 'ROUND_RESULTS' ? 'Round Complete!' :
                 lobby.state === 'GAME_OVER' ? `${gameWinner?.name || [...lobby.players].sort((a, b) => b.score - a.score)[0]?.name} wins!` :
                 `Pass ${currentPass} of 2`}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                First to {lobby.targetScore || 7} points wins
              </p>
            </div>
            <div className="text-right">
              {role && lobby.state !== 'GAME_OVER' && (
                <div className={`px-4 py-2 rounded-lg ${
                  role === 'IMPOSTER' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                }`}>
                  <p className="text-sm font-medium">You are</p>
                  <p className="text-lg font-bold">{role}</p>
                </div>
              )}
              {category && lobby.state !== 'GAME_OVER' && lobby.state !== 'ROUND_RESULTS' && (
                <div className="mt-2 bg-yellow-100 text-yellow-700 px-4 py-2 rounded-lg">
                  <p className="text-sm">Category</p>
                  <p className="text-lg font-bold">{category}</p>
                </div>
              )}
              {word && lobby.state !== 'GAME_OVER' && lobby.state !== 'ROUND_RESULTS' && (
                <div className="mt-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-lg">
                  <p className="text-sm">The word is</p>
                  <p className="text-xl font-bold">{word}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Players & Scores */}
          <PlayerScoreboard
            players={lobby.players}
            currentPlayerId={currentPlayer?.id}
            playerId={playerId}
            targetScore={lobby.targetScore || 7}
            gameWinner={gameWinner}
            gameOver={lobby.state === 'GAME_OVER'}
          />

          {/* Game Area */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-xl p-6">
            {lobby.state === 'IN_PROGRESS' && (
              <HintsSection
                hints={lobby.currentRound?.hints || []}
                isMyTurn={isMyTurn}
                currentPlayer={currentPlayer}
                onSubmitHint={handleSubmitHint}
                emergencyVotesEnabled={lobby.emergencyVotesEnabled}
                onEmergencyVote={handleEmergencyVote}
                canInitiateEmergencyVote={role === 'CIVILIAN'}
              />
            )}

            {(lobby.state === 'VOTING' || lobby.state === 'EMERGENCY_VOTING' || (votingResults && lobby.state !== 'ROUND_RESULTS')) && (
              <VotingPhaseSection
                lobbyId={lobby.id}
                players={lobby.players}
                playerId={playerId}
                currentPlayerScore={lobby.players.find(p => p.id === playerId)?.score || 0}
                bettingEnabled={lobby.bettingEnabled}
                isEmergencyVote={lobby.state === 'EMERGENCY_VOTING'}
              />
            )}

            {/* Guessing */}
            {guessPrompt && lobby.state === 'GUESSING' && (
              <GuessingSection
                lobbyId={lobby.id}
                playerId={playerId}
                onGuessSubmit={() => {}}
              />
            )}

            {/* Round Results */}
            {roundResult && lobby.state === 'ROUND_RESULTS' && (
              <RoundResults
                roundResult={roundResult}
                players={lobby.players}
                playerId={playerId}
                isOwner={isOwner}
                onStartNextRound={handleStartNextRound}
                startingNextRound={startingNextRound}
              />
            )}

            {/* Between rounds - no round result data (e.g., after refresh) */}
            {!roundResult && lobby.state === 'ROUND_RESULTS' && !lobby.currentRound && (
              <div className="text-center py-8">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  Ready for Round {(lobby.lastCompletedRoundNumber || 0) + 1}!
                </h2>
                <div className="mb-6 p-4 bg-gray-100 rounded-lg">
                  <p className="text-gray-600 mb-2">Current Scores:</p>
                  <div className="space-y-1">
                    {[...lobby.players]
                      .sort((a, b) => b.score - a.score)
                      .map(player => (
                        <div key={player.id} className="text-sm">
                          <span className="font-medium">{player.name}</span>: {player.score} points
                        </div>
                      ))}
                  </div>
                </div>
                {isOwner && (
                  <button
                    onClick={handleStartNextRound}
                    disabled={startingNextRound}
                    className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                  >
                    {startingNextRound ? 'Starting...' : 'Start Next Round'}
                  </button>
                )}
                {!isOwner && (
                  <p className="text-gray-600">Waiting for host to start the next round...</p>
                )}
              </div>
            )}

            {/* Game Over */}
            {lobby.state === 'GAME_OVER' && (
              <GameOver
                gameWinner={gameWinner}
                players={lobby.players}
                playerId={playerId}
                isOwner={isOwner}
                onRestartGame={handleRestartGame}
                restartingGame={restartingGame}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}