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
  const categoryMap: Record<string, string> = {
    'objects': 'Object',
    'foods': 'Food & Drink',
    'places': 'Place',
    'animals': 'Animal',
    'common': 'Common Thing'
  }

  const categories = Object.keys(wordsList) as Array<keyof typeof wordsList>
  const category = categories[Math.floor(Math.random() * categories.length)]
  const words = wordsList[category]

  return {
    word: words[Math.floor(Math.random() * words.length)],
    category: categoryMap[category] || category
  }
}

export const shuffleArray = <T>(array: T[]): T[] =>
  [...array].sort(() => Math.random() - 0.5)

export const getMostVotedPlayer = (votes: Record<string, string[]>): string =>
  Object.entries(votes).reduce(
    (max, [id, voters]) => voters.length > (votes[max]?.length || 0) ? id : max,
    ''
  )