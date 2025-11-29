import wordsList from './words.json'
import { GAME_CONFIG } from './constants'

export const generateLobbyCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from(
    { length: GAME_CONFIG.LOBBY_CODE_LENGTH },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}

export const getRandomWord = () => {
  const words = Object.values(wordsList).flat()
  return words[Math.floor(Math.random() * words.length)]
}

export const shuffleArray = <T>(array: T[]): T[] =>
  [...array].sort(() => Math.random() - 0.5)

export const getMostVotedPlayer = (votes: Record<string, string[]>): string =>
  Object.entries(votes).reduce(
    (max, [id, voters]) => voters.length > (votes[max]?.length || 0) ? id : max,
    ''
  )