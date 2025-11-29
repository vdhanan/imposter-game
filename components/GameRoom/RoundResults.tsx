'use client'

import type { RoundResult, PlayerData } from '@/lib/types'

interface RoundResultsProps {
  roundResult: RoundResult
  players: PlayerData[]
  playerId: string
  isOwner: boolean
  onStartNextRound: () => void
  startingNextRound: boolean
}

export default function RoundResults({
  roundResult,
  players,
  playerId,
  isOwner,
  onStartNextRound,
  startingNextRound,
}: RoundResultsProps) {
  return (
    <>
      <h2 className="text-xl font-bold text-gray-800 mb-4">Round {roundResult.roundNumber} Results</h2>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-600 font-medium">The word was:</p>
        <p className="text-2xl font-bold text-blue-800">{roundResult.word}</p>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-purple-600 font-medium">The imposter was:</p>
        <p className="text-xl font-bold text-purple-800">{roundResult.imposterName}</p>

        {roundResult.wasImposterCaught && roundResult.imposterGuess && (
          <div className="mt-2">
            <p className="text-sm text-purple-600">Imposter&apos;s guess:
              <span className="font-bold ml-1">{roundResult.imposterGuess}</span>
            </p>
            <p className={`text-sm font-medium ${
              roundResult.imposterGuessedCorrectly ? 'text-green-600' : 'text-red-600'
            }`}>
              {roundResult.imposterGuessedCorrectly ? '✓ Correct!' : '✗ Incorrect'}
            </p>
          </div>
        )}
      </div>

      <div className="mb-4">
        <p className="text-sm font-semibold text-gray-700 mb-2">Voting Results:</p>
        <div className="space-y-2">
          {Object.entries(roundResult.votesReceived).map(([suspectId, voterIds]) => {
            const suspect = players.find(p => p.id === suspectId)
            const voters = voterIds.map(id => players.find(p => p.id === id)?.name).filter(Boolean)
            return (
              <div key={suspectId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className={`font-medium ${suspectId === roundResult.imposterId ? 'text-red-600' : ''}`}>
                  {suspect?.name}
                  {suspectId === roundResult.imposterId && ' (Imposter)'}
                </span>
                <span className="text-sm text-gray-600">
                  {voterIds.length} vote{voterIds.length !== 1 ? 's' : ''}
                  {voters.length > 0 && ` (${voters.join(', ')})`}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {roundResult.betResults && roundResult.betResults.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">💰 Betting Results:</p>
          <div className="space-y-2">
            {roundResult.betResults.map((bet, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="flex items-center">
                  <span className="font-medium">{bet.bettorName}</span>
                  <span className="text-gray-500 mx-1">bet {bet.amount}pt{bet.amount > 1 ? 's' : ''} on</span>
                  <span className="font-medium">{bet.targetName}</span>
                </span>
                <span className={`font-bold ${bet.won ? 'text-green-600' : 'text-red-600'}`}>
                  {bet.won ? `+${bet.amount}` : `-${bet.amount}`} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`p-4 rounded-lg mb-4 ${
        roundResult.pointsAwarded.some(p => p.playerId === playerId)
          ? 'bg-green-100 border border-green-300'
          : 'bg-gray-100 border border-gray-300'
      }`}>
        <p className="font-semibold text-gray-800 mb-2">Points Awarded:</p>
        <div className="space-y-1">
          {roundResult.pointsAwarded.map(award => (
            <div key={award.playerId} className="text-sm">
              <span className="font-medium">
                {award.playerName}
                {award.playerId === playerId && ' (You)'}
              </span>
              : +{award.points} point{award.points !== 1 ? 's' : ''}
            </div>
          ))}
        </div>
      </div>

      {isOwner && !roundResult.winner && (
        <button
          onClick={onStartNextRound}
          disabled={startingNextRound}
          className="w-full py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
        >
          {startingNextRound ? 'Starting...' : 'Start Next Round'}
        </button>
      )}

      {!isOwner && !roundResult.winner && (
        <div className="text-center text-gray-600">
          Waiting for host to start the next round...
        </div>
      )}
    </>
  )
}