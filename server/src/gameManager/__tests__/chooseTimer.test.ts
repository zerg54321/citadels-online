import { describe, it, expect } from 'vitest';
import {
  GameProgress, GamePhase, CharacterChoosingStateType as CCST,
} from 'citadels-common';
import GameState from '../../game/GameState';
import GameSetupData from '../../game/GameSetupData';
import Room from '../Room';
import { getTurnTimer, disposeTurnTimer } from '../TurnTimer';

// Minimal io mock: sendRoomStateToAllClients iterates rooms/sockets maps that
// stay empty, so no client receives a push — we only care that update() arms
// the deadline (turnDeadlineAt) before it would send.
function makeMockIo() {
  return {
    sockets: {
      adapter: { rooms: { get: () => undefined } },
      sockets: { get: () => undefined },
    },
  } as unknown as import('socket.io').Server;
}

function makeRoom(roomId: string): Room {
  const room = new Room(roomId as never, makeMockIo());
  const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'];
  const ids = names.map((_, i) => `p${i + 1}`);
  ids.forEach((id, i) => room.gameState.addPlayer(id, names[i], i === 0, true));
  const setup = new GameSetupData(ids, 8);
  room.gameState.setupGame(setup);
  room.gameState.progress = GameProgress.IN_GAME;
  // jump straight into choose-characters (skip initial card selection)
  room.gameState.board!.gamePhase = GamePhase.CHOOSE_CHARACTERS;
  room.gameState.board!.initialCardSelectionQueue = [];
  return room;
}

describe('choose-characters action timer', () => {
  it('arms deadline on entering a PLAYER choose substate (emits SET, not null)', () => {
    const room = makeRoom('timer-diag-1');
    const gs = room.gameState;
    const cm = gs.board!.characterManager;
    try {
      // choosingState starts at INITIAL(SPECTATOR). Step to first PLAYER substate
      // (6P: PUT_ASIDE_FACE_DOWN / PLAYER_1).
      cm.choosingState.step();
      expect(cm.choosingState.getState().type).not.toBe(CCST.INITIAL);

      // update() must arm the deadline BEFORE it would send, so the emitted
      // turnDeadlineAt is SET (regression: previously null because send ran
      // before arm).
      room.update();
      expect(gs.turnDeadlineAt).not.toBeNull();
      expect(gs.turnDeadlineAt!).toBeGreaterThan(Date.now());
    } finally {
      disposeTurnTimer('timer-diag-1');
    }
  });

  it('clears deadline on DONE (no flash of a stale SET after last pick)', () => {
    const room = makeRoom('timer-diag-2');
    const gs = room.gameState;
    const cm = gs.board!.characterManager;
    try {
      cm.choosingState.step();
      // walk every PLAYER substate until DONE
      let guard = 0;
      while (cm.choosingState.getState().type !== CCST.DONE && guard < 30) {
        guard += 1;
        const st = cm.choosingState.getState();
        if (st.type === CCST.CHOOSE_CHARACTER) cm.chooseCharacter(0);
        else cm.chooseRandomCharacter();
      }
      expect(cm.choosingState.getState().type).toBe(CCST.DONE);
      room.update();
      // DONE is system work → deadline cleared, so the post-pick push emits null
      // (regression: previously emitted a stale SET for ~one frame).
      expect(gs.turnDeadlineAt).toBeNull();
    } finally {
      disposeTurnTimer('timer-diag-2');
    }
  });
});
