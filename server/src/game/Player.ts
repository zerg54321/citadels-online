import {
  Avatar,
  PlayerId,
  PlayerRole,
  TeamId,
} from 'citadels-common';

export default class Player {
  id: PlayerId;
  username: string;
  manager: boolean;
  online: boolean;
  role: PlayerRole;
  userId?: string;
  team: TeamId;
  isAi: boolean;
  /** P4: player is in autoplay (manual or forced timeout) */
  isAutoplay: boolean;
  /** P4: AI actually took at least one action for this player */
  hadEffectiveAiControl: boolean;
  /** 超时/掉线触发强制的托管次数(本局累积,每局 setupGame 重置)。
   *  达到 AUTOPLAY_TIMEOUT_LOCK_THRESHOLD 后锁定为托管,玩家无法手动取消,
   *  防止恶意消极游戏或反复掉线拖累其他玩家。仅 forceAutoplayForTimeout 递增。 */
  autoplayTimeoutCount: number;
  /** Avatar from the user record; undefined for AI / anonymous spectators. */
  avatar?: Avatar;

  constructor(
    id: PlayerId,
    username: string,
    manager: boolean,
    online: boolean,
    role: PlayerRole,
    userId?: string,
    team: TeamId = TeamId.NONE,
    avatar?: Avatar,
  ) {
    this.id = id;
    this.username = username;
    this.manager = manager;
    this.online = online;
    this.role = role;
    this.userId = userId;
    this.team = team;
    this.isAi = false;
    this.isAutoplay = false;
    this.hadEffectiveAiControl = false;
    this.autoplayTimeoutCount = 0;
    this.avatar = avatar;
  }

  toString() {
    return `Player ${this.username}[${this.id}]`;
  }

  clone(): Player {
    const p = new Player(
      this.id, this.username, this.manager, this.online,
      this.role, this.userId, this.team, this.avatar,
    );
    p.isAi = this.isAi;
    p.isAutoplay = this.isAutoplay;
    p.hadEffectiveAiControl = this.hadEffectiveAiControl;
    p.autoplayTimeoutCount = this.autoplayTimeoutCount;
    return p;
  }
}
