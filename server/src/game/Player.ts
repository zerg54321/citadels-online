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
    return p;
  }
}
