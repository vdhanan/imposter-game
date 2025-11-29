'use client'

import { useState, useEffect } from 'react'
import type { LobbyData, VoteResults, RoundResult, PlayerData } from '@/lib/types'
import PlayerScoreboard from './GameRoom/PlayerScoreboard'
import HintsSection from './GameRoom/HintsSection'
import VotingSection from './GameRoom/VotingSection'

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
  const [hasVoted, setHasVoted] = useState(votedPlayers.includes(playerId))
  const [guess, setGuess] = useState('')
  const [guessing, setGuessing] = useState(false)
  const [startingNextRound, setStartingNextRound] = useState(false)
  const [restartingGame, setRestartingGame] = useState(false)

  useEffect(() => {
    if (votedPlayers.includes(playerId)) {
      setHasVoted(true)
    } else if (lobby.state === 'VOTING') {
      setHasVoted(false)
    }
  }, [votedPlayers, playerId, lobby.state])

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


  const handleGuess = async () => {
    if (!guess.trim() || guessing) return

    setGuessing(true)
    try {
      const response = await fetch('/api/game/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId: lobby.id,
          playerId,
          guess: guess.trim(),
        }),
      })

      if (response.ok) {
        setGuess('')
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to submit guess')
      }
    } catch (error) {
      alert('Failed to submit guess')
    } finally {
      setGuessing(false)
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
                 lobby.state === 'GAME_OVER' ? `${gameWinner?.name || lobby.players.sort((a, b) => b.score - a.score)[0]?.name} wins!` :
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
              <VotingSection
                players={lobby.players}
                playerId={playerId}
                votedPlayers={votedPlayers}
                votingResults={votingResults}
                onVote={async (suspectId) => {
                  const response = await fetch('/api/game/vote', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      lobbyId: lobby.id,
                      voterId: playerId,
                      suspectId,
                    }),
                  })
                  if (!response.ok) {
                    const data = await response.json()
                    alert(data.error || 'Failed to vote')
                  } else {
                    setHasVoted(true)
                  }
                }}
              />
            )}

            {/* Guessing */}
            {guessPrompt && lobby.state === 'GUESSING' && (
              <>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Guess the Word!</h2>
                <p className="text-gray-600 mb-4">
                  You&apos;ve been caught! Guess the word correctly to still win the round:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    placeholder="Enter your guess..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={handleGuess}
                    disabled={!guess.trim() || guessing}
                    className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                  >
                    {guessing ? 'Guessing...' : 'Submit Guess'}
                  </button>
                </div>
              </>
            )}

            {/* Round Results */}
            {roundResult && lobby.state === 'ROUND_RESULTS' && (
              <>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Round {roundResult.roundNumber} Results</h2>

                {/* The Word */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-600 font-medium">The word was:</p>
                  <p className="text-2xl font-bold text-blue-800">{roundResult.word}</p>
                </div>

                {/* Imposter Info */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-purple-600 font-medium">The imposter was:</p>
                  <p className="text-xl font-bold text-purple-800">{roundResult.imposterName}</p>

                  {roundResult.wasImposterCaught && roundResult.imposterGuess && (
                    <div className="mt-2">
                      <p className="text-sm text-purple-600">Imposter&apos;s guess:
                        <span className="font-bold ml-1">{roundResult.imposterGuess}</span>
                      </p>
                      <p className={`text-sm font-medium ${
                        roundResult.imposterGuessedCorrectly ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {roundResult.imposterGuessedCorrectly ? '✓ Correct!' : '✗ Incorrect'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Voting Results */}
                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Voting Results:</p>
                  <div className="space-y-2">
                    {Object.entries(roundResult.votesReceived).map(([suspectId, voterIds]) => {
                      const suspect = lobby.players.find(p => p.id === suspectId)
                      const voters = voterIds.map(id => lobby.players.find(p => p.id === id)?.name).filter(Boolean)
                      return (
                        <div key={suspectId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className={`font-medium ${suspectId === roundResult.imposterId ? 'text-red-600' : ''}`}>
                            {suspect?.name}
                            {suspectId === roundResult.imposterId && ' (Imposter)'}
                          </span>
                          <span className="text-sm text-gray-600">
                            {voterIds.length} vote{voterIds.length !== 1 ? 's' : ''}
                            {voters.length > 0 && ` (${voters.join(', ')})`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Points Awarded */}
                <div className={`p-4 rounded-lg mb-4 ${
                  roundResult.pointsAwarded.some(p => p.playerId === playerId)
                    ? 'bg-green-100 border border-green-300'
                    : 'bg-gray-100 border border-gray-300'
                }`}>
                  <p className="font-semibold text-gray-800 mb-2">Points Awarded:</p>
                  <div className="space-y-1">
                    {roundResult.pointsAwarded.map(award => (
                      <div key={award.playerId} className="text-sm">
                        <span className="font-medium">
                          {award.playerName}
                          {award.playerId === playerId && ' (You)'}
                        </span>
                        : +{award.points} point{award.points !== 1 ? 's' : ''}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Next Round Button */}
                {isOwner && !roundResult.winner && (
                  <button
                    onClick={handleStartNextRound}
                    disabled={startingNextRound}
                    className="w-full py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                  >
                    {startingNextRound ? 'Starting...' : 'Start Next Round'}
                  </button>
                )}

                {!isOwner && !roundResult.winner && (
                  <div className="text-center text-gray-600">
                    Waiting for host to start the next round...
                  </div>
                )}
              </>
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
                    {lobby.players
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
              <>
                <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">
                  🎉 Game Complete! 🎉
                </h2>

                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6 mb-6 text-center">
                  <p className="text-lg text-yellow-800 mb-2">Winner:</p>
                  <p className="text-3xl font-bold text-yellow-900">
                    👑 {gameWinner?.name || lobby.players.sort((a, b) => b.score - a.score)[0]?.name} 👑
                  </p>
                  <p className="text-xl text-yellow-800 mt-2">
                    Final Score: {gameWinner?.score || lobby.players.sort((a, b) => b.score - a.score)[0]?.score} points
                  </p>
                </div>

                {/* Final Scoreboard */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Final Scoreboard</h3>
                  <div className="space-y-2">
                    {lobby.players
                      .sort((a, b) => b.score - a.score)
                      .map((player, index) => (
                        <div
                          key={player.id}
                          className={`p-3 rounded-lg flex justify-between items-center ${
                            index === 0 ? 'bg-yellow-100 border-2 border-yellow-300' :
                            index === 1 ? 'bg-gray-100 border border-gray-300' :
                            index === 2 ? 'bg-orange-50 border border-orange-200' :
                            'bg-gray-50 border border-gray-200'
                          }`}
                        >
                          <span className="font-medium">
                            {index === 0 && '🥇 '}
                            {index === 1 && '🥈 '}
                            {index === 2 && '🥉 '}
                            {player.name}
                            {player.id === playerId && ' (You)'}
                          </span>
                          <span className="font-bold text-lg">
                            {player.score} points
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Restart Game Button */}
                {isOwner && (
                  <button
                    onClick={handleRestartGame}
                    disabled={restartingGame}
                    className="w-full py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                  >
                    {restartingGame ? 'Restarting...' : 'Play Again'}
                  </button>
                )}

                {!isOwner && (
                  <div className="text-center text-gray-600">
                    Waiting for host to restart the game...
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}