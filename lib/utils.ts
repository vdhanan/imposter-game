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
    'musicGroups': 'Music Group',
    'europeanCities': 'European City',
    'dogBreeds': 'Dog Breed',
    'carBrands': 'Car Brand',
    'movieGenres': 'Movie Genre',
    'sportsTeams': 'Sports Team',
    'techCompanies': 'Tech Company',
    'cuisineTypes': 'Cuisine Type',
    'boardGames': 'Board Game',
    'famousLandmarks': 'Famous Landmark',
    'nflPlayers': 'NFL Player',
    'nbaPlayers': 'NBA Player',
    'professionalGolfers': 'Professional Golfer',
    'olympicEvents': 'Olympic Event',
    'tennisPlayers': 'Tennis Player',
    'soccerPlayers': 'Soccer Player',
    'f1Drivers': 'F1 Driver',
    'baseballPlayers': 'Baseball Player'
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