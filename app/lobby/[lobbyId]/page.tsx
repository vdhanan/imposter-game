import GameLobby from '@/components/GameLobby'

export default function LobbyPage({ params }: { params: { lobbyId: string } }) {
  return <GameLobby lobbyId={params.lobbyId} />
}