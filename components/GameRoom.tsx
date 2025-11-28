'use client'

import { useState } from 'react'
import type { LobbyData, VoteResults } from '@/lib/types'

interface GameRoomProps {
  lobby: LobbyData
  playerId: string
  playerName: string
  role: 'CIVILIAN' | 'IMPOSTER' | null
  word: string | null
  isMyTurn: boolean
  votingResults: VoteResults | null
  guessPrompt: boolean
}

export default function GameRoom({
  lobby,
  playerId,
  playerName,
  role,
  word,
  isMyTurn,
  votingResults,
  guessPrompt,
}: GameRoomProps) {
  const [hint, setHint] = useState('')
  const [submittingHint, setSubmittingHint] = useState(false)
  const [selectedVote, setSelectedVote] = useState<string | null>(null)
  const [voting, setVoting] = useState(false)
  const [guess, setGuess] = useState('')
  const [guessing, setGuessing] = useState(false)

  const handleSubmitHint = async () => {
    if (!hint.trim() || !isMyTurn || submittingHint) return

    setSubmittingHint(true)
    try {
      const response = await fetch('/api/game/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId: lobby.id,
          playerId,
          text: hint.trim(),
        }),
      })

      if (response.ok) {
        setHint('')
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to submit hint')
      }
    } catch (error) {
      alert('Failed to submit hint')
    } finally {
      setSubmittingHint(false)
    }
  }

  const handleVote = async () => {
    if (!selectedVote || voting) return

    setVoting(true)
    try {
      const response = await fetch('/api/game/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId: lobby.id,
          voterId: playerId,
          suspectId: selectedVote,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        alert(data.error || 'Failed to vote')
      }
    } catch (error) {
      alert('Failed to vote')
    } finally {
      setVoting(false)
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

  const getCurrentPlayer = () => {
    if (!lobby.currentRound) return null
    const currentIndex = lobby.currentRound.currentTurn % lobby.currentRound.turnOrder.length
    const currentPlayerId = lobby.currentRound.turnOrder[currentIndex]
    return lobby.players.find(p => p.id === currentPlayerId)
  }

  const currentPlayer = getCurrentPlayer()
  const round = Math.floor((lobby.currentRound?.currentTurn || 0) / (lobby.currentRound?.turnOrder.length || 1)) + 1

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-xl p-6 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Round {lobby.currentRound?.roundNumber || 1}
              </h1>
              <p className="text-gray-600">
                {lobby.state === 'VOTING' ? 'Vote for the imposter!' :
                 lobby.state === 'GUESSING' ? 'Imposter is guessing...' :
                 lobby.state === 'ROUND_END' ? 'Round Complete!' :
                 `Round ${round} of 2`}
              </p>
            </div>
            <div className="text-right">
              {role && (
                <div className={`px-4 py-2 rounded-lg ${
                  role === 'IMPOSTER' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                }`}>
                  <p className="text-sm font-medium">You are</p>
                  <p className="text-lg font-bold">{role}</p>
                </div>
              )}
              {word && (
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
          <div className="bg-white rounded-lg shadow-xl p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Players</h2>
            <div className="space-y-2">
              {lobby.players.map((player) => (
                <div
                  key={player.id}
                  className={`p-3 rounded-lg border-2 ${
                    currentPlayer?.id === player.id
                      ? 'border-purple-500 bg-purple-50'
                      : player.id === playerId
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">
                      {player.name}
                      {player.id === playerId && ' (You)'}
                      {currentPlayer?.id === player.id && ' 🎯'}
                    </span>
                    <span className="text-lg font-bold text-purple-600">
                      {player.score}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Game Area */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-xl p-6">
            {/* Hints Display */}
            {lobby.state === 'IN_PROGRESS' && (
              <>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Hints</h2>
                <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                  {lobby.currentRound?.hints.map((hint) => (
                    <div key={hint.id} className="p-3 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-700">
                        {hint.playerName}:
                      </span>{' '}
                      <span className="text-gray-900">{hint.text}</span>
                    </div>
                  ))}
                  {lobby.currentRound?.hints.length === 0 && (
                    <p className="text-gray-500 italic">No hints yet...</p>
                  )}
                </div>

                {isMyTurn && (
                  <div className="border-t pt-4">
                    <p className="text-sm text-gray-600 mb-2">It's your turn! Give a hint:</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={hint}
                        onChange={(e) => setHint(e.target.value)}
                        placeholder="Enter your hint..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                        maxLength={30}
                      />
                      <button
                        onClick={handleSubmitHint}
                        disabled={!hint.trim() || submittingHint}
                        className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                      >
                        {submittingHint ? 'Sending...' : 'Submit'}
                      </button>
                    </div>
                  </div>
                )}

                {!isMyTurn && currentPlayer && (
                  <div className="border-t pt-4">
                    <p className="text-gray-600">
                      Waiting for <span className="font-bold">{currentPlayer.name}</span> to give a hint...
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Voting */}
            {lobby.state === 'VOTING' && !votingResults && (
              <>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Vote for the Imposter</h2>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {lobby.players
                    .filter(p => p.id !== playerId)
                    .map((player) => (
                      <button
                        key={player.id}
                        onClick={() => setSelectedVote(player.id)}
                        className={`p-4 rounded-lg border-2 transition ${
                          selectedVote === player.id
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {player.name}
                      </button>
                    ))}
                </div>
                <button
                  onClick={handleVote}
                  disabled={!selectedVote || voting}
                  className="w-full py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
                >
                  {voting ? 'Voting...' : 'Submit Vote'}
                </button>
              </>
            )}

            {/* Voting Results */}
            {votingResults && (
              <>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Voting Results</h2>
                <div className="space-y-3 mb-4">
                  {Object.entries(votingResults.votes).map(([suspectId, voterIds]) => {
                    const suspect = lobby.players.find(p => p.id === suspectId)
                    return (
                      <div key={suspectId} className="p-3 bg-gray-50 rounded-lg">
                        <span className="font-medium">
                          {suspect?.name}: {voterIds.length} vote{voterIds.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className={`p-4 rounded-lg ${
                  votingResults.correctGuess ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {votingResults.correctGuess ?
                    'Imposter was caught! They can now guess the word...' :
                    'Wrong guess! The imposter wins this round!'}
                </div>
              </>
            )}

            {/* Guessing */}
            {guessPrompt && lobby.state === 'GUESSING' && (
              <>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Guess the Word!</h2>
                <p className="text-gray-600 mb-4">
                  You've been caught! Guess the word correctly to still win the round:
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

            {/* Round End */}
            {lobby.state === 'ROUND_END' && (
              <>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Round Complete!</h2>
                <div className="text-center py-8">
                  <p className="text-2xl font-bold text-gray-800 mb-4">Scores Updated!</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700"
                  >
                    Play Next Round
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}