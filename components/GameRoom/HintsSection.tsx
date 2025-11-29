import { useState } from 'react'
import { GAME_CONFIG } from '@/lib/constants'
import type { HintData, PlayerData } from '@/lib/types'

interface HintsSectionProps {
  hints: HintData[]
  isMyTurn: boolean
  currentPlayer?: PlayerData | null
  onSubmitHint: (hint: string) => Promise<void>
  emergencyVotesEnabled?: boolean
  onEmergencyVote?: () => void
  canInitiateEmergencyVote?: boolean
}

export default function HintsSection({
  hints,
  isMyTurn,
  currentPlayer,
  onSubmitHint,
  emergencyVotesEnabled,
  onEmergencyVote,
  canInitiateEmergencyVote
}: HintsSectionProps) {
  const [hint, setHint] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!hint.trim() || submitting) return
    setSubmitting(true)
    await onSubmitHint(hint.trim())
    setHint('')
    setSubmitting(false)
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Word Hints</h2>
        {emergencyVotesEnabled && canInitiateEmergencyVote && onEmergencyVote && (
          <button
            onClick={onEmergencyVote}
            className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition duration-200"
            title="Skip hints and vote immediately. Risky: You lose a point if wrong!"
          >
            🚨 Emergency Vote
          </button>
        )}
      </div>
      <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
        {hints.length > 0 ? (
          hints.map((hint) => (
            <div key={hint.id} className="p-3 bg-gray-50 rounded-lg">
              <span className="font-medium text-gray-700">{hint.playerName}:</span>{' '}
              <span className="text-gray-900">{hint.text}</span>
            </div>
          ))
        ) : (
          <p className="text-gray-500 italic">No hints yet...</p>
        )}
      </div>

      {isMyTurn ? (
        <div className="border-t pt-4">
          <p className="text-sm text-gray-600 mb-2">It&apos;s your turn! Give a one-word hint:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Enter your hint..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              maxLength={GAME_CONFIG.MAX_HINT_LENGTH}
            />
            <button
              onClick={handleSubmit}
              disabled={!hint.trim() || submitting}
              className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
            >
              {submitting ? 'Sending...' : 'Submit'}
            </button>
          </div>
        </div>
      ) : currentPlayer ? (
        <div className="border-t pt-4">
          <p className="text-gray-600">
            Waiting for <span className="font-bold">{currentPlayer.name}</span> to give a hint...
          </p>
        </div>
      ) : null}
    </>
  )
}