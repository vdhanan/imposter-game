'use client'

import type { PlayerData } from '@/lib/types'

interface GameOverProps {
  gameWinner: PlayerData | null
  players: PlayerData[]
  playerId: string
  isOwner: boolean
  onRestartGame: () => void
  restartingGame: boolean
}

export default function GameOver({
  gameWinner,
  players,
  playerId,
  isOwner,
  onRestartGame,
  restartingGame,
}: GameOverProps) {
  const winner = gameWinner || [...players].sort((a, b) => b.score - a.score)[0]

  return (
    <>
      <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">
        🎉 Game Complete! 🎉
      </h2>

      <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6 mb-6 text-center">
        <p className="text-lg text-yellow-800 mb-2">Winner:</p>
        <p className="text-3xl font-bold text-yellow-900">
          👑 {winner?.name} 👑
        </p>
        <p className="text-xl text-yellow-800 mt-2">
          Final Score: {winner?.score} points
        </p>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">Final Scoreboard</h3>
        <div className="space-y-2">
          {[...players]
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

      {isOwner && (
        <button
          onClick={onRestartGame}
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
  )
}