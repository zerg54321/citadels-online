import { GameSetupData as SerializedGameSetupData, PlayerId } from 'citadels-common';

const DEFAULT_TIMEOUT = 120;
const MIN_TIMEOUT = 10;
const MAX_TIMEOUT = 180;

export default class GameSetupData {
  players: PlayerId[];
  completeCitySize: number;
  actionTimeoutSeconds: number;

  constructor(
    players: PlayerId[],
    completeCitySize: number,
    actionTimeoutSeconds: number = DEFAULT_TIMEOUT,
  ) {
    this.players = players;
    this.completeCitySize = completeCitySize;
    this.actionTimeoutSeconds = GameSetupData.clampTimeout(actionTimeoutSeconds);
  }

  static clampTimeout(sec: number | undefined): number {
    const n = Number(sec);
    if (!Number.isFinite(n)) return DEFAULT_TIMEOUT;
    return Math.min(MAX_TIMEOUT, Math.max(MIN_TIMEOUT, Math.round(n)));
  }

  static fromJSON(obj: SerializedGameSetupData) {
    return new this(obj.players, obj.completeCitySize, obj.actionTimeoutSeconds);
  }
}
