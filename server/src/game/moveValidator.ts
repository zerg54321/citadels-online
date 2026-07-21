import { Move, MoveType, districts } from 'citadels-common';

/**
 * Input validation for `make move` socket events.
 *
 * Only validates TYPE / SHAPE / RANGE of `move.data`, NOT game rules.
 * Game-rule legality (whose turn, can-afford, target valid, etc.) remains
 * the responsibility of `ActionExecutor` / `GameFlowController`, which
 * return `false` for rule violations.
 *
 * Rationale: malformed `move.data` previously flowed into `ActionExecutor`
 * and was rejected only implicitly (returning `false` → generic "invalid
 * move" to the client). Explicit validation gives earlier, specific error
 * messages and guards against type-coercion surprises (e.g. `undefined - 1`
 * yielding `NaN`) that could corrupt internal state if a future refactor
 * removes a downstream guard.
 *
 * IMPORTANT — dual-use MoveTypes:
 * Several MoveTypes are sent by the client in TWO different contexts:
 *   1. As a "mode switch" from the ActionPanel (e.g. clicking the
 *      "assassin_kill" button) — these carry NO data; they just advance
 *      the server's internal turnState so the UI can show the target grid.
 *   2. As the actual action (e.g. clicking a character to kill) — these
 *      carry the target `data`.
 * The server routes by `clientTurnState` in `GameFlowController.step`, so
 * the SAME MoveType legitimately arrives with OR without `data`. This
 * validator therefore treats `data` as OPTIONAL for dual-use types and
 * only validates the SHAPE when `data` is present. If `data` is absent on
 * a real-action attempt, the downstream executor safely returns `false`
 * (it guards against `undefined`).
 *
 * Client character-id convention (see memory `client.character_id_convention`):
 * the client sends 1-based display values (`CharacterType + 1`) for
 * `ASSASSIN_KILL` / `THIEF_ROB`; the server subtracts 1 in `ActionExecutor`.
 */

const VALID_DISTRICT_IDS: ReadonlySet<string> = new Set(Object.keys(districts));

/** Max 8 characters in the deck (ASSASSIN..WARLORD). */
const MAX_CHARACTER_INDEX = 7;
/** Client sends 1-based characterId (1..8). */
const MAX_CHARACTER_ID = 8;
/** PlayerPosition index into playerOrder (0..6 = PLAYER_1..PLAYER_7). */
const MAX_PLAYER_POSITION = 6;

export type ValidationResult = { ok: true } | { ok: false; message: string };

const OK: ValidationResult = { ok: true };

function fail(message: string): ValidationResult {
  return { ok: false, message };
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isDistrictId(value: unknown): value is string {
  return typeof value === 'string' && VALID_DISTRICT_IDS.has(value);
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

/** Pure-no-data types: reject any payload (catches client bugs). */
function rejectData(move: Move): ValidationResult {
  if (!isAbsent(move.data)) {
    return fail(`${MoveType[move.type]} must not carry data`);
  }
  return OK;
}

/** Dual-use helper: allow absent data; validate shape when present. */
function optional(move: Move, validate: (m: Move) => ValidationResult): ValidationResult {
  if (isAbsent(move.data)) return OK;
  return validate(move);
}

function validateCharacterId(move: Move): ValidationResult {
  if (!isSafeInteger(move.data)) {
    return fail(`${MoveType[move.type]} data must be an integer character id`);
  }
  if (move.data < 1 || move.data > MAX_CHARACTER_ID) {
    return fail(`${MoveType[move.type]} data out of range (1..${MAX_CHARACTER_ID})`);
  }
  return OK;
}

function validateCharacterIndex(move: Move): ValidationResult {
  if (!isSafeInteger(move.data)) {
    return fail('CHOOSE_CHARACTER data must be an integer index');
  }
  if (move.data < 0 || move.data > MAX_CHARACTER_INDEX) {
    return fail(`CHOOSE_CHARACTER data out of range (0..${MAX_CHARACTER_INDEX})`);
  }
  return OK;
}

function validatePlayerPosition(move: Move): ValidationResult {
  if (!isSafeInteger(move.data)) {
    return fail(`${MoveType[move.type]} data must be an integer player position`);
  }
  if (move.data < 0 || move.data > MAX_PLAYER_POSITION) {
    return fail(`${MoveType[move.type]} data out of range (0..${MAX_PLAYER_POSITION})`);
  }
  return OK;
}

function validateDistrictId(move: Move): ValidationResult {
  if (!isDistrictId(move.data)) {
    return fail(`${MoveType[move.type]} data must be a valid DistrictId string`);
  }
  return OK;
}

function validateDistrictIdArray(move: Move): ValidationResult {
  if (!Array.isArray(move.data)) {
    return fail(`${MoveType[move.type]} data must be an array of DistrictId`);
  }
  const invalid = move.data.find((card) => !isDistrictId(card));
  if (invalid !== undefined) {
    return fail(`${MoveType[move.type]} data contains an invalid DistrictId`);
  }
  return OK;
}

function validateWarlordDestroy(move: Move): ValidationResult {
  if (!move.data || typeof move.data !== 'object') {
    return fail('WARLORD_DESTROY_DISTRICT data must be an object');
  }
  const { player, card } = move.data as { player?: unknown; card?: unknown };
  if (!isSafeInteger(player) || player < 0 || player > MAX_PLAYER_POSITION) {
    return fail('WARLORD_DESTROY_DISTRICT data.player must be an integer (0..6)');
  }
  if (!isDistrictId(card)) {
    return fail('WARLORD_DESTROY_DISTRICT data.card must be a valid DistrictId string');
  }
  return OK;
}

/**
 * Validate the shape of a `Move` received via the `make move` socket event.
 * `MoveType.AUTO` is rejected here because it is server-internal only.
 */
export function validateMove(move: Move): ValidationResult {
  if (!move || typeof move.type !== 'number') {
    return fail('invalid move format');
  }

  switch (move.type) {
    // --- server-internal ---
    case MoveType.AUTO:
      return fail('AUTO is server-internal');

    // --- always-data (required) ---
    case MoveType.CHOOSE_CHARACTER:
      return validateCharacterIndex(move);

    // --- pure-no-data (reject stray payload) ---
    case MoveType.TAKE_GOLD:
    case MoveType.TAKE_GOLD_EARNINGS:
    case MoveType.MERCHANT_TAKE_1_GOLD:
    case MoveType.ARCHITECT_DRAW_2_CARDS:
    case MoveType.GRAVEYARD_RECOVER_DISTRICT:
    case MoveType.SMITHY_DRAW_CARDS:
    case MoveType.DECLINE:
    case MoveType.FINISH_TURN:
      return rejectData(move);

    // --- dual-use (mode-switch with no data OR real action with data) ---
    case MoveType.DRAW_CARDS:
      return optional(move, validateDistrictId);
    case MoveType.ASSASSIN_KILL:
    case MoveType.THIEF_ROB:
      return optional(move, validateCharacterId);
    case MoveType.MAGICIAN_EXCHANGE_HAND:
      return optional(move, validatePlayerPosition);
    case MoveType.MAGICIAN_DISCARD_CARDS:
      return optional(move, validateDistrictIdArray);
    case MoveType.BUILD_DISTRICT:
    case MoveType.LABORATORY_DISCARD_CARD:
      return optional(move, validateDistrictId);
    case MoveType.WARLORD_DESTROY_DISTRICT:
      return optional(move, validateWarlordDestroy);

    default:
      return fail(`unknown MoveType ${move.type}`);
  }
}
