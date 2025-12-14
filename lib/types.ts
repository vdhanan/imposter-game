export type GameState = 'LOBBY' | 'IN_PROGRESS' | 'HINTS' | 'VOTING' | 'EMERGENCY_VOTING' | 'GUESSING' | 'ROUND_RESULTS' | 'GAME_OVER'

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
  emergencyVotesEnabled: boolean
  bettingEnabled: boolean
  emergencyVoteInitiated?: string // ID of the player who initiated the emergency vote
}

export interface RoundData {
  id: string
  roundNumber: number
  word?: string // Only sent to non-imposters
  category: string // Category is sent to all players, including imposters
  imposterId: string
  turnOrder: string[]
  currentTurn: number
  hints: HintData[]
  bets?: BetData[]
  status: 'WAITING' | 'IN_PROGRESS' | 'HINTS_COMPLETE' | 'VOTING' | 'EMERGENCY_VOTING' | 'GUESSING' | 'COMPLETE'
}

export interface HintData {
  id: string
  playerId: string
  playerName: string
  text: string
  turnIndex: number
}

export interface BetData {
  id: string
  bettorId: string
  bettorName: string
  targetId: string
  targetName: string
  amount: number
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
  betResults?: { // Results of betting
    bettorId: string
    bettorName: string
    targetId: string
    targetName: string
    amount: number
    won: boolean
    payout: number
  }[]
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
  | { type: 'PLAYER_REMOVED'; playerId: string; playerName: string }
  | { type: 'HOST_CHANGED'; newHostId: string }
  | { type: 'GAME_STARTED'; round: RoundData; targetScore: number }
  | { type: 'HINT_SUBMITTED'; hint: HintData }
  | { type: 'TURN_CHANGED'; currentTurn: number; playerId: string }
  | { type: 'HINTS_COMPLETE' }
  | { type: 'BETTING_STARTED' }
  | { type: 'BET_PLACED'; bet: BetData }
  | { type: 'BET_RESULTS'; results: Array<{
      bettorId: string
      bettorName: string
      targetId: string
      targetName: string
      amount: number
      isCorrect: boolean
      payout: number
    }> }
  | { type: 'VOTING_STARTED' }
  | { type: 'VOTE_CAST'; voterId: string }
  | { type: 'VOTING_COMPLETE'; results: VoteResults }
  | { type: 'IMPOSTER_GUESSING' }
  | { type: 'ROUND_RESULTS'; result: RoundResult }
  | { type: 'GAME_OVER'; winner: PlayerData; finalScores: Record<string, number> }
  | { type: 'GAME_RESTARTED' }
  | { type: 'EMERGENCY_VOTE_INITIATED'; initiatorId: string; initiatorName: string }
  | { type: 'EMERGENCY_VOTING_STARTED' }

export interface VoteResults {
  votes: Record<string, string[]> // suspectId -> voterIds
  correctGuess: boolean
  imposterId: string
  mostVoted: string
}