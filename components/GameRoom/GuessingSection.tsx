'use client'

import { useState } from 'react'

interface GuessingSectionProps {
  lobbyId: string
  playerId: string
  onGuessSubmit: () => void
}

export default function GuessingSection({
  lobbyId,
  playerId,
  onGuessSubmit,
}: GuessingSectionProps) {
  const [guess, setGuess] = useState('')
  const [guessing, setGuessing] = useState(false)

  const handleGuess = async () => {
    if (!guess.trim() || guessing) return

    setGuessing(true)
    try {
      const response = await fetch('/api/game/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyId,
          playerId,
          guess: guess.trim(),
        }),
      })

      if (response.ok) {
        setGuess('')
        onGuessSubmit()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to submit guess')
      }
    } catch (error) {
      alert('Failed to submit guess')
    } finally {
      setGuessing(false)
    }
  }

  return (
    <>
      <h2 className="text-xl font-bold text-gray-800 mb-4">Guess the Word!</h2>
      <p className="text-gray-600 mb-4">
        You&apos;ve been caught! Guess the word correctly to still win the round:
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          placeholder="Enter your guess..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
        />
        <button
          onClick={handleGuess}
          disabled={!guess.trim() || guessing}
          className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-400"
        >
          {guessing ? 'Guessing...' : 'Submit Guess'}
        </button>
      </div>
    </>
  )
}