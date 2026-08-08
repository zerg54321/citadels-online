// Module-level record of the locally-issued assassin kill target (1-based
// role id, matching `callable[].id` and `call_killed.params.role`), so the AV
// feed dispatcher can identify the local player as the assassin (perpetrator)
// when `call_killed` arrives — that feed entry carries only the victim (the
// owner of the killed character) and the killed role, never the assassin's
// identity (D9: feed has no perpetrator field for kills; the assassin must be
// self-identified from the locally-submitted move).
//
// Recorded by gameSlice.sendMove on ASSASSIN_KILL; cleared at each round
// boundary by useAvFeedDispatch (a new round means a fresh assassin pick).

let lastIssuedKillRole: number | null = null;

export function recordIssuedKill(role: number): void {
  lastIssuedKillRole = role;
}

export function getLastIssuedKillRole(): number | null {
  return lastIssuedKillRole;
}

export function clearIssuedKill(): void {
  lastIssuedKillRole = null;
}
