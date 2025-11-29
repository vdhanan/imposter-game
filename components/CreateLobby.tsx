'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GAME_CONFIG } from '@/lib/constants'
import { useAsyncAction } from '@/lib/hooks'

export default function CreateLobby() {
  const [name, setName] = useState('')
  const [targetScore, setTargetScore] = useState<string>(GAME_CONFIG.DEFAULT_TARGET_SCORE.toString())
  const [emergencyVotesEnabled, setEmergencyVotesEnabled] = useState(false)
  const [bettingEnabled, setBettingEnabled] = useState(false)
  const router = useRouter()
  const { execute, loading, error } = useAsyncAction()

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || loading) return

    const score = parseInt(targetScore) || GAME_CONFIG.DEFAULT_TARGET_SCORE

    const data = await execute(async () => {
      const response = await fetch('/api/lobby/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: name,
          targetScore: score,
          emergencyVotesEnabled,
          bettingEnabled
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create lobby')
      }

      return response.json()
    })

    if (data) {
      localStorage.setItem('playerId', data.playerId)
      localStorage.setItem('playerName', data.playerName)
      router.push(`/lobby/${data.lobbyId}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Imposter Game</h1>
        <p className="text-gray-600 mb-6">Create a new lobby to start playing!</p>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              maxLength={GAME_CONFIG.MAX_PLAYER_NAME_LENGTH}
              required
            />
          </div>

          <div>
            <label htmlFor="targetScore" className="block text-sm font-medium text-gray-700 mb-2">
              Points to Win
            </label>
            <input
              type="number"
              id="targetScore"
              value={targetScore}
              onChange={(e) => setTargetScore(e.target.value)}
              onBlur={() => {
                const num = parseInt(targetScore) || GAME_CONFIG.DEFAULT_TARGET_SCORE
                setTargetScore(Math.min(20, Math.max(2, num)).toString())
              }}
              min="2"
              max="20"
              placeholder="7"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              2-20 points
            </p>
          </div>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={emergencyVotesEnabled}
              onChange={(e) => setEmergencyVotesEnabled(e.target.checked)}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">Emergency Votes 🚨</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={bettingEnabled}
              onChange={(e) => setBettingEnabled(e.target.checked)}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-700">Betting 💰</span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full bg-purple-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition duration-200"
          >
            {loading ? 'Creating...' : 'Create Lobby'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600">Have a lobby code?</p>
          <button
            onClick={() => router.push('/join')}
            className="text-purple-600 hover:text-purple-700 font-semibold mt-1"
          >
            Join Existing Lobby
          </button>
        </div>
      </div>
    </div>
  )
}