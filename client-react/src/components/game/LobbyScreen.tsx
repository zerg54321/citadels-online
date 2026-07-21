// Placeholder — full LobbyScreen migration is a future batch. Renders a
// minimal shell so GameScreen can mount during IN_LOBBY without crashing.
export default function LobbyScreen() {
  return (
    <div className="lobby-screen-stub p-4 text-center">
      <h2 className="text-gold">Lobby</h2>
      <p className="text-muted">LobbyScreen — to be migrated</p>
    </div>
  );
}
