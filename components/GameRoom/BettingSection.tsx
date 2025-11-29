'use client'

import { useState, useEffect } from 'react'
import type { PlayerData, BetData } from '@/lib/types'

interface BettingSectionProps {
  lobbyId: string
  playerId: string
  players: PlayerData[]
  currentPlayerScore: number
  bets: BetData[]
  onBetPlaced: (bet: BetData) => void
}

export default function BettingSection({
  lobbyId,
  playerId,
  players,
  currentPlayerScore,
  bets,
  onBetPlaced,
}: BettingSectionProps) {
  const [selectedTarget, setSelectedTarget] = useState<string>('')
  const [selectedAmount, setSelectedAmount] = useState<number>(1)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string>('')
  const [timeLeft, setTimeLeft] = useState(20)

  const myBet = bets.find(b => b.bettorId === playerId)
  const otherPlayers = players.filter(p => p.id !== playerId)

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = Math.max(0, prev - 1)
        if (newTime === 0 && !myBet) {
          // Time's up - transition to voting
          fetch('/api/game/betting-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lobbyId }),
          })
        }
        return newTime
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [lobbyId, myBet])
  const maxBet = Math.min(3, currentPlayerScore)

  const handlePlaceBet = async () => {
    if (!selectedTarget || placing || myBet) return

    setPlacing(true)
    setError('')

    try {
      const response = await fetch('/api/game/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId,
          bettorId: playerId,
          targetId: selectedTarget,
          amount: selectedAmount,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to place bet')
      }

      const data = await response.json()
      if (data.bet) {
        onBetPlaced(data.bet)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place bet')
    } finally {
      setPlacing(false)
    }
  }

  return (
    <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">
          💰 Betting Phase
        </h2>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-600">Time left:</span>
          <span className={`font-bold ${timeLeft <= 10 ? 'text-red-600 animate-pulse' : 'text-gray-800'}`}>
            {timeLeft}s
          </span>
        </div>
      </div>

      {currentPlayerScore === 0 ? (
        <p className="text-gray-600 text-center py-4">
          You don&apos;t have any points to bet. Skipping betting phase.
        </p>
      ) : myBet ? (
        <div className="bg-green-100 border border-green-400 rounded-lg p-4">
          <p className="text-green-800 font-semibold">
            ✅ You bet {myBet.amount} point{myBet.amount > 1 ? 's' : ''} on {myBet.targetName}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Who is the imposter?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {otherPlayers.map((player) => (
                <button
                  key={player.id}
                  onClick={() => setSelectedTarget(player.id)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    selectedTarget === player.id
                      ? 'border-purple-600 bg-purple-100'
                      : 'border-gray-300 bg-white hover:border-purple-400'
                  }`}
                >
                  <span className="font-medium">{player.name}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({player.score} pts)
                  </span>
                </button>
              ))}
            </div>
          </div>

          {selectedTarget && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bet amount (Max: {maxBet})
              </label>
              <div className="flex space-x-2">
                {[1, 2, 3].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setSelectedAmount(amount)}
                    disabled={amount > maxBet}
                    className={`px-6 py-3 rounded-lg font-bold transition-all ${
                      amount > maxBet
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : selectedAmount === amount
                        ? 'bg-purple-600 text-white'
                        : 'bg-white border-2 border-gray-300 hover:border-purple-400'
                    }`}
                  >
                    {amount} pt{amount > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            onClick={handlePlaceBet}
            disabled={!selectedTarget || placing || myBet !== undefined}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
              !selectedTarget || placing || myBet
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {placing ? 'Placing bet...' : 'Place Bet (Win 2x)'}
          </button>
        </div>
      )}
    </div>
  )
}