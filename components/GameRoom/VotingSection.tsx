import { useState } from 'react'
import type { PlayerData, VoteResults } from '@/lib/types'

interface VotingSectionProps {
  players: PlayerData[]
  playerId: string
  votedPlayers: string[]
  votingResults: VoteResults | null
  onVote: (suspectId: string) => Promise<void>
}

export default function VotingSection({
  players,
  playerId,
  votedPlayers,
  votingResults,
  onVote
}: VotingSectionProps) {
  const [selectedVote, setSelectedVote] = useState<string | null>(null)
  const [voting, setVoting] = useState(false)
  const hasVoted = votedPlayers.includes(playerId)

  const handleVote = async () => {
    if (!selectedVote || voting) return
    setVoting(true)
    await onVote(selectedVote)
    setVoting(false)
  }

  if (votingResults) {
    return (
      <>
        <h2 className="text-xl font-bold text-gray-800 mb-4">Voting Results</h2>
        <div className="space-y-3 mb-4">
          {Object.entries(votingResults.votes).map(([suspectId, voterIds]) => {
            const suspect = players.find(p => p.id === suspectId)
            return (
              <div key={suspectId} className="p-3 bg-gray-50 rounded-lg">
                <span className="font-medium">
                  {suspect?.name}: {voterIds.length} vote{voterIds.length !== 1 ? 's' : ''}
                </span>
              </div>
            )
          })}
        </div>
        <div className={`p-4 rounded-lg ${
          votingResults.correctGuess ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {votingResults.correctGuess ?
            'Imposter was caught! They can now guess the word...' :
            'Wrong guess! The imposter wins this round!'}
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="text-xl font-bold text-gray-800 mb-4">Vote for the Imposter</h2>

      <div className="mb-4 p-3 bg-gray-100 rounded-lg">
        <p className="text-sm font-semibold text-gray-700 mb-2">Waiting for votes from:</p>
        <div className="flex flex-wrap gap-2">
          {players
            .filter(p => !votedPlayers.includes(p.id))
            .map((player) => (
              <span
                key={player.id}
                className={`px-2 py-1 text-xs rounded ${
                  player.id === playerId ? 'bg-blue-200 text-blue-800' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {player.name} {player.id === playerId && '(You)'}
              </span>
            ))}
        </div>
      </div>

      {hasVoted ? (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          <p className="font-semibold">✓ Your vote has been submitted</p>
          <p className="text-sm">Waiting for other players to vote...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {players
              .filter(p => p.id !== playerId)
              .map((player) => (
                <button
                  key={player.id}
                  onClick={() => setSelectedVote(player.id)}
                  className={`p-4 rounded-lg border-2 transition ${
                    selectedVote === player.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {player.name}
                </button>
              ))}
          </div>
          <button
            onClick={handleVote}
            disabled={!selectedVote || voting || hasVoted}
            className="w-full py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
          >
            {voting ? 'Voting...' : hasVoted ? 'Vote Submitted' : 'Submit Vote'}
          </button>
        </>
      )}
    </>
  )
}