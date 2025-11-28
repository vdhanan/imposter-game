'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useGameState } from '@/hooks/useGameState'
import GameRoom from './GameRoom'

interface GameLobbyProps {
  lobbyId: string
}

export default function GameLobby({ lobbyId }: GameLobbyProps) {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const id = localStorage.getItem('playerId')
    const name = localStorage.getItem('playerName')

    if (!id || !name) {
      router.push('/')
      return
    }

    setPlayerId(id)
    setPlayerName(name)
  }, [router])

  const { lobby, role, word, isMyTurn, votingResults, guessPrompt } = useGameState({
    lobbyId,
    playerId: playerId || '',
  })

  const handleStartGame = async () => {
    if (!playerId || !lobby || lobby.ownerId !== playerId) return

    setStarting(true)
    try {
      const response = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lobbyId, playerId }),
      })

      if (!response.ok) {
        const data = await response.json()
        alert(data.error || 'Failed to start game')
      }
    } catch (error) {
      alert('Failed to start game')
    } finally {
      setStarting(false)
    }
  }

  const copyLobbyCode = () => {
    if (lobby) {
      navigator.clipboard.writeText(lobby.code)
      alert('Lobby code copied!')
    }
  }

  if (!playerId || !playerName || !lobby) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  // If game has started, show game room
  if (lobby.state !== 'LOBBY') {
    return (
      <GameRoom
        lobby={lobby}
        playerId={playerId}
        playerName={playerName}
        role={role}
        word={word}
        isMyTurn={isMyTurn}
        votingResults={votingResults}
        guessPrompt={guessPrompt}
      />
    )
  }

  const isOwner = lobby.ownerId === playerId
  const canStart = isOwner && lobby.players.length >= 3

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8 mb-4">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">Game Lobby</h1>
              <p className="text-gray-600">Waiting for players to join...</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600 mb-1">Lobby Code</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-mono font-bold text-purple-600">
                  {lobby.code}
                </span>
                <button
                  onClick={copyLobbyCode}
                  className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-3">
              Players ({lobby.players.length}/10)
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {lobby.players.map((player) => (
                <div
                  key={player.id}
                  className={`p-3 rounded-lg border-2 ${
                    player.id === playerId
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">
                      {player.name}
                      {player.id === playerId && ' (You)'}
                    </span>
                    {player.id === lobby.ownerId && (
                      <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded">
                        Host
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {lobby.players.length < 3 && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-4">
              Need at least 3 players to start the game
            </div>
          )}

          {isOwner && (
            <button
              onClick={handleStartGame}
              disabled={!canStart || starting}
              className="w-full bg-purple-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition duration-200"
            >
              {starting ? 'Starting...' : 'Start Game'}
            </button>
          )}

          {!isOwner && (
            <div className="text-center text-gray-600">
              Waiting for host to start the game...
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-xl p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">How to Play</h3>
          <ul className="space-y-2 text-gray-600">
            <li>• Everyone except the imposter gets a secret word</li>
            <li>• Players take turns giving one-word hints about the word</li>
            <li>• After two rounds of hints, everyone votes for the imposter</li>
            <li>• If caught, the imposter can guess the word to win</li>
            <li>• Score points based on correct guesses and successful deception!</li>
          </ul>
        </div>
      </div>
    </div>
  )
}