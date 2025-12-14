'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useGameSync } from '@/hooks/useGameSync'
import { useGameStore } from '@/lib/store/gameStore'
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

  // Initialize game sync for Pusher events
  useGameSync({ lobbyId, playerId: playerId || '' })

  // Get state from Zustand store
  const lobby = useGameStore((state) => state.lobby)
  const role = useGameStore((state) => state.role)
  const word = useGameStore((state) => state.word)
  const category = useGameStore((state) => state.category)
  const isMyTurn = useGameStore((state) => state.isMyTurn)
  const votingResults = useGameStore((state) => state.votingResults)
  const guessPrompt = useGameStore((state) => state.guessPrompt)
  const votedPlayers = useGameStore((state) => state.votedPlayers)
  const roundResult = useGameStore((state) => state.roundResult)
  const gameWinner = useGameStore((state) => state.gameWinner)

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

  const handleRemovePlayer = async (playerIdToRemove: string) => {
    if (!playerId || !lobby || lobby.ownerId !== playerId) return

    if (confirm('Are you sure you want to remove this player?')) {
      try {
        const response = await fetch('/api/game/remove-player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lobbyId,
            hostId: playerId,
            playerIdToRemove
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          alert(data.error || 'Failed to remove player')
        }
      } catch (error) {
        alert('Failed to remove player')
      }
    }
  }

  const copyLobbyLink = () => {
    if (lobby) {
      const url = `${window.location.origin}/join/${lobby.code}`
      navigator.clipboard.writeText(url)
      alert('Lobby link copied!')
    }
  }

  if (!playerId || !playerName || !lobby) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (lobby.state !== 'LOBBY') {
    return (
      <GameRoom
        lobby={lobby}
        playerId={playerId}
        playerName={playerName}
        role={role}
        word={word}
        category={category}
        isMyTurn={isMyTurn}
        votingResults={votingResults}
        guessPrompt={guessPrompt}
        votedPlayers={votedPlayers}
        roundResult={roundResult}
        gameWinner={gameWinner}
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
              <p className="text-sm text-gray-500 mt-1">
                Playing to <span className="font-semibold">{lobby.targetScore}</span> points
                {lobby.emergencyVotesEnabled && (
                  <span className="ml-2 text-red-600 font-semibold">• Emergency Votes Enabled</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600 mb-1">Share Lobby</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-mono font-bold text-purple-600">
                  {lobby.code}
                </span>
                <button
                  onClick={copyLobbyLink}
                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
                >
                  Copy Link
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
                  className={`p-3 rounded-lg border-2 relative ${
                    player.id === playerId
                      ? 'border-purple-500 bg-purple-50'
                      : player.isOnline
                      ? 'border-gray-200 bg-gray-50'
                      : 'border-gray-300 bg-gray-100 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {/* Online indicator */}
                      <div
                        className={`w-2 h-2 rounded-full ${
                          player.isOnline ? 'bg-green-500' : 'bg-gray-400'
                        }`}
                        title={player.isOnline ? 'Online' : 'Offline'}
                      />
                      <span className="font-medium text-gray-800">
                        {player.name}
                        {player.id === playerId && ' (You)'}
                        {!player.isOnline && ' (Offline)'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {player.id === lobby.ownerId && (
                        <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded">
                          Host
                        </span>
                      )}
                      {/* Remove button for host */}
                      {isOwner && player.id !== playerId && lobby.players.filter(p => p.isOnline).length > 3 && (
                        <button
                          onClick={() => handleRemovePlayer(player.id)}
                          className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded ml-1"
                          title="Remove player"
                        >
                          ×
                        </button>
                      )}
                    </div>
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