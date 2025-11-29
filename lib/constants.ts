export const GAME_CONFIG = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 10,
  DEFAULT_TARGET_SCORE: 7,
  LOBBY_CODE_LENGTH: 6,
  MAX_HINT_LENGTH: 30,
  MAX_PLAYER_NAME_LENGTH: 20,
  HINT_PASSES: 2,
} as const

export const PUSHER_CHANNELS = {
  lobby: (lobbyId: string) => `lobby-${lobbyId}`,
  player: (lobbyId: string, playerId: string) => `player-${lobbyId}-${playerId}`,
} as const

export const ERROR_MESSAGES = {
  LOBBY_NOT_FOUND: 'Lobby not found',
  NOT_OWNER: 'Only lobby owner can perform this action',
  MIN_PLAYERS: `Need at least ${GAME_CONFIG.MIN_PLAYERS} players`,
  ALREADY_VOTED: 'Already voted',
  SELF_VOTE: 'Cannot vote for yourself',
  GAME_IN_PROGRESS: 'Game already in progress',
  NO_ACTIVE_ROUND: 'No active round',
  INVALID_TURN: 'Not your turn',
} as const