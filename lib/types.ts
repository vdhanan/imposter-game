export type GameState = 'LOBBY' | 'IN_PROGRESS' | 'HINTS' | 'VOTING' | 'GUESSING' | 'ROUND_RESULTS' | 'GAME_OVER'

export interface PlayerData {
  id: string
  name: string
  score: number
  isOnline: boolean
}

export interface LobbyData {
  id: string
  code: string
  ownerId: string
  players: PlayerData[]
  currentRound?: RoundData
  lastCompletedRoundNumber?: number
  state: GameState
  targetScore: number // First to this score wins (default 7)
}

export interface RoundData {
  id: string
  roundNumber: number
  word?: string // Only sent to non-imposters
  imposterId: string
  turnOrder: string[]
  currentTurn: number
  hints: HintData[]
  status: 'WAITING' | 'IN_PROGRESS' | 'HINTS_COMPLETE' | 'VOTING' | 'GUESSING' | 'COMPLETE'
}

export interface HintData {
  id: string
  playerId: string
  playerName: string
  text: string
  turnIndex: number
}

export interface VoteData {
  voterId: string
  suspectId: string
}

export interface RoundResult {
  roundNumber: number
  word: string
  imposterId: string
  imposterName: string
  wasImposterCaught: boolean
  imposterGuess?: string
  imposterGuessedCorrectly?: boolean
  votesReceived: Record<string, string[]> // playerId -> voterIds
  pointsAwarded: {
    playerId: string
    playerName: string
    points: number
  }[]
  newScores: Record<string, number>
  winner?: string // Player ID if someone reached target score
}

export type PusherEvent =
  | { type: 'PLAYER_JOINED'; player: PlayerData }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'GAME_STARTED'; round: RoundData; targetScore: number }
  | { type: 'HINT_SUBMITTED'; hint: HintData }
  | { type: 'TURN_CHANGED'; currentTurn: number; playerId: string }
  | { type: 'VOTING_STARTED' }
  | { type: 'VOTE_CAST'; voterId: string }
  | { type: 'VOTING_COMPLETE'; results: VoteResults }
  | { type: 'IMPOSTER_GUESSING' }
  | { type: 'ROUND_RESULTS'; result: RoundResult }
  | { type: 'GAME_OVER'; winner: PlayerData; finalScores: Record<string, number> }
  | { type: 'GAME_RESTARTED' }

export interface VoteResults {
  votes: Record<string, string[]> // suspectId -> voterIds
  correctGuess: boolean
  imposterId: string
  mostVoted: string
}