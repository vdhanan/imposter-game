import wordsList from './words.json'

export function generateLobbyCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export function getRandomWord(): string {
  const allCategories = Object.values(wordsList).flat()
  return allCategories[Math.floor(Math.random() * allCategories.length)]
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function getMostVotedPlayer(votes: Record<string, string[]>): string {
  let maxVotes = 0
  let mostVoted = ''

  for (const [suspectId, voters] of Object.entries(votes)) {
    if (voters.length > maxVotes) {
      maxVotes = voters.length
      mostVoted = suspectId
    }
  }

  return mostVoted
}