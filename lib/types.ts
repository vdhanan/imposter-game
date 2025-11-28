export type GameState = 'LOBBY' | 'IN_PROGRESS' | 'HINTS' | 'VOTING' | 'GUESSING' | 'ROUND_END'

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
  state: GameState
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

export type PusherEvent =
  | { type: 'PLAYER_JOINED'; player: PlayerData }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'GAME_STARTED'; round: RoundData }
  | { type: 'HINT_SUBMITTED'; hint: HintData }
  | { type: 'TURN_CHANGED'; currentTurn: number; playerId: string }
  | { type: 'VOTING_STARTED' }
  | { type: 'VOTE_CAST'; voterId: string }
  | { type: 'VOTING_COMPLETE'; results: VoteResults }
  | { type: 'IMPOSTER_GUESSING' }
  | { type: 'ROUND_COMPLETE'; scores: Record<string, number>; nextRound?: RoundData }
  | { type: 'GAME_COMPLETE'; finalScores: Record<string, number> }

export interface VoteResults {
  votes: Record<string, string[]> // suspectId -> voterIds
  correctGuess: boolean
  imposterId: string
  mostVoted: string
}