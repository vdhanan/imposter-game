import type { PlayerData } from '@/lib/types'

interface PlayerScoreboardProps {
  players: PlayerData[]
  currentPlayerId?: string
  playerId: string
  targetScore: number
  gameWinner?: PlayerData | null
  gameOver?: boolean
}

export default function PlayerScoreboard({
  players,
  currentPlayerId,
  playerId,
  targetScore,
  gameWinner,
  gameOver = false
}: PlayerScoreboardProps) {
  return (
    <div className="bg-white rounded-lg shadow-xl p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Scoreboard</h2>
      <div className="space-y-2">
        {players
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
                  'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">
                    {isWinner && '👑 '}
                    {player.name}
                    {isMe && ' (You)'}
                    {isCurrentTurn && !gameOver && ' 🎯'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-purple-600">
                      {player.score}
                    </span>
                    <span className="text-xs text-gray-500">
                      / {targetScore}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}