'use client'

import { useState, useEffect } from 'react'
import { useGameStore } from '@/lib/store/gameStore'
import type { PlayerData } from '@/lib/types'

interface VotingPhaseSectionProps {
  lobbyId: string
  players: PlayerData[]
  playerId: string
  currentPlayerScore: number
  bettingEnabled: boolean
  isEmergencyVote: boolean
}

export default function VotingPhaseSection({
  lobbyId,
  players,
  playerId,
  currentPlayerScore,
  bettingEnabled,
  isEmergencyVote,
}: VotingPhaseSectionProps) {
  const { votedPlayers, lobby, role } = useGameStore()

  // Core state - simplified to just selecting and submitted
  const [selectedVote, setSelectedVote] = useState<string | null>(null)
  const [selectedBet, setSelectedBet] = useState<string | null>(null)
  const [betAmount, setBetAmount] = useState<number>(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Derived state
  const hasSubmitted = votedPlayers.includes(playerId)
  const isImposter = role === 'IMPOSTER'
  const canBet = bettingEnabled && !isEmergencyVote && currentPlayerScore > 0 && !isImposter
  const otherPlayers = players.filter(p => p.id !== playerId)
  const isHedging = selectedBet && selectedVote && selectedBet !== selectedVote

  // Single submit handler for both bet and vote
  const handleSubmit = async () => {
    if (!selectedVote || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/game/vote-with-bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId,
          voterId: playerId,
          suspectId: selectedVote,
          bet: canBet && selectedBet ? {
            targetId: selectedBet,
            amount: betAmount
          } : null
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit')
      }
    } catch (error) {
      console.error('Failed to submit:', error)
      setError(error instanceof Error ? error.message : 'Failed to submit. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (hasSubmitted) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">
          {isEmergencyVote ? '🚨 Emergency Vote' : '🗳️ Voting Phase'}
        </h2>
        <p className="text-gray-600">
          Waiting for other players to vote...
        </p>
        <div className="mt-4">
          <div className="text-sm text-gray-500">Players who haven&apos;t voted:</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {players
              .filter(p => !votedPlayers.includes(p.id))
              .map(p => (
                <span key={p.id} className="px-2 py-1 bg-gray-100 rounded text-sm">
                  {p.name}
                </span>
              ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">
        {isEmergencyVote ? '🚨 Emergency Vote' : '🗳️ Voting Phase'}
      </h2>

      {/* Betting Section (only if enabled and not emergency) */}
      {canBet && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium mb-3 text-blue-900">
            💰 Optional: Place a bet (You have {currentPlayerScore} points)
          </h3>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedBet(null)}
                className={`px-3 py-2 rounded ${
                  selectedBet === null
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                No bet
              </button>
              {otherPlayers.map(player => (
                <button
                  key={player.id}
                  onClick={() => setSelectedBet(player.id)}
                  className={`px-3 py-2 rounded transition-colors ${
                    selectedBet === player.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                >
                  {player.name}
                </button>
              ))}
            </div>
            {selectedBet && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bet amount:
                </label>
                <select
                  value={betAmount}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  className="px-3 py-2 border rounded-md"
                >
                  {[1, 2, 3].map(amount => (
                    <option
                      key={amount}
                      value={amount}
                      disabled={amount > currentPlayerScore}
                    >
                      {amount} point{amount !== 1 ? 's' : ''}
                      {amount > currentPlayerScore ? ' (insufficient points)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Voting Section */}
      <div className="mb-6">
        <h3 className="font-medium mb-3">
          {isImposter
            ? "🎭 Vote for someone (you&apos;re the imposter!)"
            : "Who do you think is the imposter?"}
        </h3>
        <div className="flex flex-wrap gap-2">
          {otherPlayers.map(player => (
            <button
              key={player.id}
              onClick={() => setSelectedVote(player.id)}
              disabled={isSubmitting}
              className={`px-4 py-2 rounded transition-colors ${
                selectedVote === player.id
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              {player.name}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Section - Shows what will be submitted */}
      {(selectedVote || selectedBet) && (
        <div className="mb-4 p-3 bg-gray-50 rounded">
          <div className="text-sm space-y-1">
            {selectedVote && (
              <div>
                <span className="font-medium">Vote:</span>{' '}
                {players.find(p => p.id === selectedVote)?.name}
              </div>
            )}
            {selectedBet && (
              <div>
                <span className="font-medium">Bet:</span>{' '}
                {players.find(p => p.id === selectedBet)?.name} ({betAmount} point{betAmount !== 1 ? 's' : ''})
              </div>
            )}
            {isHedging && (
              <div className="text-amber-600 font-medium mt-2">
                ⚠️ Hedging strategy: You&apos;re betting on {players.find(p => p.id === selectedBet)?.name} but voting for {players.find(p => p.id === selectedVote)?.name}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Single Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!selectedVote || isSubmitting}
        className={`w-full py-3 rounded font-medium transition-colors ${
          !selectedVote || isSubmitting
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {isSubmitting
          ? 'Submitting...'
          : selectedBet && selectedVote
            ? `Submit Vote & Bet`
            : selectedVote
              ? 'Submit Vote'
              : 'Select a player to vote for'}
      </button>
    </div>
  )
}