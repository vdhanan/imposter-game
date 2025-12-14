import type { PlayerData } from '@/lib/types'

interface PlayerScoreboardProps {
  players: PlayerData[]
  currentPlayerId?: string
  playerId: string
  targetScore: number
  gameWinner?: PlayerData | null
  gameOver?: boolean
  isHost?: boolean
  lobbyId?: string
  onRemovePlayer?: (playerId: string) => void
}

export default function PlayerScoreboard({
  players,
  currentPlayerId,
  playerId,
  targetScore,
  gameWinner,
  gameOver = false,
  isHost = false,
  lobbyId,
  onRemovePlayer
}: PlayerScoreboardProps) {
  const onlinePlayers = players.filter(p => p.isOnline)
  return (
    <div className="bg-white rounded-lg shadow-xl p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Scoreboard</h2>
      <div className="space-y-2">
        {[...players]
          .sort((a, b) => b.score - a.score)
          .map((player) => {
            const isWinner = gameWinner?.id === player.id ||
                           (gameOver && player.score >= targetScore)
            const isCurrentTurn = currentPlayerId === player.id
            const isMe = player.id === playerId

            return (
              <div
                key={player.id}
                className={`p-3 rounded-lg border-2 ${
                  isWinner ? 'border-yellow-500 bg-yellow-50' :
                  isCurrentTurn ? 'border-purple-500 bg-purple-50' :
                  isMe ? 'border-blue-500 bg-blue-50' :
                  !player.isOnline ? 'border-gray-300 bg-gray-100 opacity-60' :
                  'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        player.isOnline ? 'bg-green-500' : 'bg-gray-400'
                      }`}
                      title={player.isOnline ? 'Online' : 'Offline'}
                    />
                    <span className="font-medium">
                      {isWinner && '👑 '}
                      {player.name}
                      {isMe && ' (You)'}
                      {!player.isOnline && ' (Offline)'}
                      {isCurrentTurn && !gameOver && ' 🎯'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-purple-600">
                      {player.score}
                    </span>
                    <span className="text-xs text-gray-500">
                      / {targetScore}
                    </span>
                    {/* Remove button for host */}
                    {isHost &&
                     player.id !== playerId &&
                     !gameOver &&
                     onlinePlayers.length > 3 &&
                     onRemovePlayer && (
                      <button
                        onClick={() => onRemovePlayer(player.id)}
                        className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded"
                        title="Remove player"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}