'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useParams } from 'next/navigation'

export default function JoinPage() {
  const params = useParams()
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lobbyId, setLobbyId] = useState('')
  const [requiresName, setRequiresName] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [joining, setJoining] = useState(false)

  const code = params.code as string

  useEffect(() => {
    checkLobbyAndPlayer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const checkLobbyAndPlayer = async () => {
    try {
      const playerId = localStorage.getItem('playerId')

      const response = await fetch(`/api/lobby/lookup?code=${code}`)
      if (!response.ok) {
        if (response.status === 404) {
          setError('Lobby not found. Please check the code.')
        } else {
          setError('Failed to find lobby')
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setLobbyId(data.lobbyId)

      if (playerId && data.players.some((p: any) => p.id === playerId)) {
        router.push(`/lobby/${data.lobbyId}`)
      } else {
        setRequiresName(true)
        setLoading(false)
      }
    } catch (err) {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!playerName.trim() || joining) return

    setJoining(true)
    setError('')

    try {
      const response = await fetch('/api/lobby/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyCode: code,
          playerName: playerName.trim()
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to join lobby')
      }

      const data = await response.json()

      localStorage.setItem('playerId', data.playerId)
      localStorage.setItem('playerName', data.playerName)

      router.push(`/lobby/${data.lobbyId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <div className="animate-pulse text-center text-gray-600">
            Finding lobby...
          </div>
        </div>
      </div>
    )
  }

  if (error && !requiresName) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Unable to Join</h1>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  if (requiresName) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Join Lobby</h1>
          <p className="text-gray-600 mb-2">Joining lobby: <span className="font-mono font-bold">{code}</span></p>
          <p className="text-gray-600 mb-6">Enter your name to continue</p>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Your Name
              </label>
              <input
                id="name"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                maxLength={20}
                required
                disabled={joining}
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!playerName.trim() || joining}
              className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {joining ? 'Joining...' : 'Join Game'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return null
}