'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CreateLobby() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || loading) return

    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/lobby/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName: name }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create lobby')
      }

      const data = await response.json()

      // Store player info in localStorage
      localStorage.setItem('playerId', data.playerId)
      localStorage.setItem('playerName', data.playerName)

      // Redirect to lobby
      router.push(`/lobby/${data.lobbyId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
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
              maxLength={20}
              required
            />
          </div>

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