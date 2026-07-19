import * as fs from 'fs';
import * as path from 'path';
import { districts } from 'citadels-common';
import { TrainingEngine } from '../trainingEngine';
import {
  EngineAction, EngineActionType, EngineObservation, EnginePhase,
} from '../types';
import {
  ReplayEvent,
  ReplayEventTarget,
  ReplayFrame,
  ReplayMajorRound,
  ReplayPlayerFrame,
  ReplayRecord,
} from './types';

const CARD_COST: Record<string, number> = Object.fromEntries(
  Object.entries(districts).map(([id, d]) => [id, (d as { cost?: number }).cost ?? 99]),
);

const CHAR_NAMES = ['刺客', '盗贼', '魔术师', '国王', '主教', '商人', '建筑师', '军阀'];

export class ReplayRecorder {
  private engine: TrainingEngine;
  private replay: ReplayRecord;
  private stepIndex = 0;
  private playerNames: string[];

  constructor(playerNames: string[]) {
    this.playerNames = playerNames;
    this.engine = new TrainingEngine(playerNames);
    this.replay = {
      createdAt: new Date().toISOString(),
      version: 2,
      players: playerNames,
      teamMap: this.engine.getTeamMap(),
      rounds: [],
      finished: false,
      maxCity: 0,
      steps: [],
    };
  }

  runToEnd(maxSteps = 5000): ReplayRecord {
    let major: ReplayMajorRound | undefined;
    let eventOrder = 0;
    let lastPhase: string | null = null;

    while (this.stepIndex < maxSteps && !this.engine.isFinished()) {
      const beforeObs = this.engine.getObservation();
      const legal = beforeObs.legalActions;
      if (!legal.length) break;

      const ordered = this.orderActions(legal, beforeObs);
      let action: EngineAction | undefined;
      let afterObs: EngineObservation | undefined;
      for (const candidate of ordered) {
        const attempt = this.engine.applyAction(candidate);
        if (attempt.ok) {
          action = candidate;
          afterObs = attempt.observation ?? this.engine.captureObservation();
          break;
        }
      }
      if (!action || !afterObs) break;

      this.stepIndex += 1;
      this.replay.steps?.push({
        step: this.stepIndex,
        phase: beforeObs.phase,
        type: action.type,
        playerId: action.playerId ?? beforeObs.currentPlayerId,
      });

      // new major round when entering character_selection from actions/setup, or first event
      const enteringSelection = beforeObs.phase === EnginePhase.CHARACTER_SELECTION
        && lastPhase !== EnginePhase.CHARACTER_SELECTION;
      if (!major || enteringSelection) {
        if (major) {
          major.frameEnd = this.toFrame(beforeObs);
          major.summary = this.summarizeMajor(major);
          major.characterBlocks = this.buildCharacterBlocks(major);
          this.replay.rounds.push(major);
        }
        const roundNum = this.replay.rounds.length + 1;
        major = {
          round: roundNum,
          title: `第 ${roundNum} 大轮`,
          summary: '',
          frameStart: this.toFrame(beforeObs),
          frameEnd: this.toFrame(beforeObs),
          events: [],
          characterBlocks: [],
        };
        eventOrder = 0;
      }

      eventOrder += 1;
      const event = this.buildEvent(eventOrder, action, beforeObs, afterObs);
      major.events.push(event);
      major.frameEnd = event.frameAfter;
      lastPhase = beforeObs.phase;
    }

    if (major && major.events.length > 0) {
      major.summary = this.summarizeMajor(major);
      major.characterBlocks = this.buildCharacterBlocks(major);
      this.replay.rounds.push(major);
    }

    const finalObs = this.engine.captureObservation();
    this.replay.maxCity = Math.max(0, ...finalObs.players.map((p) => p.citySize));
    this.replay.finished = this.engine.isFinished();
    const match = this.engine.getMatchResult();
    this.replay.teamScores = match.teamScores;
    this.replay.matchResult = match.matchResult as number;
    this.replay.summary = [
      `${this.replay.rounds.length} 大轮 / ${this.stepIndex} 步`,
      this.replay.finished ? '已终局' : '未终局',
      `最大城建 ${this.replay.maxCity}`,
      match.teamScores ? `队分 A:${match.teamScores.A} B:${match.teamScores.B}` : '',
    ].filter(Boolean).join(' · ');

    return this.replay;
  }

  writeToFile(filePath: string): string {
    const absolutePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, JSON.stringify(this.replay, null, 2), 'utf8');
    return absolutePath;
  }

  private toFrame(obs: EngineObservation): ReplayFrame {
    return {
      players: obs.players.map((p): ReplayPlayerFrame => ({
        id: p.id,
        name: p.name,
        team: p.team,
        stash: p.stash,
        hand: [...(p.hand || [])],
        handCount: p.handCount,
        city: [...(p.city || [])],
        citySize: p.citySize,
        complete: p.complete,
        characters: [...(p.characters || [])],
        hasCrown: p.hasCrown,
      })),
      deckCount: obs.deckCount,
      graveyard: obs.graveyard,
      killedCharacter: obs.killedCharacterId,
      killedCharacterName: obs.killedCharacterName,
      robbedCharacter: obs.robbedCharacterId,
      robbedCharacterName: obs.robbedCharacterName,
      crownPlayerId: obs.crownPlayerId,
      phase: obs.phase,
      currentCharacter: obs.currentCharacterId,
      currentCharacterName: obs.currentCharacter,
      currentPlayerId: obs.currentPlayerId,
    };
  }

  private buildEvent(
    order: number,
    action: EngineAction,
    before: EngineObservation,
    after: EngineObservation,
  ): ReplayEvent {
    const actorId = action.playerId || before.currentPlayerId || null;
    const beforeP = before.players.find((p) => p.id === actorId);
    const afterP = after.players.find((p) => p.id === actorId);
    const goldDelta = (afterP?.stash ?? 0) - (beforeP?.stash ?? 0);
    const handDelta = (afterP?.handCount ?? 0) - (beforeP?.handCount ?? 0);
    const { added, removed } = this.cityDiff(beforeP?.city || [], afterP?.city || []);
    const targets = this.resolveTargets(action, before, after);
    const charId = before.currentCharacterId;
    const charName = before.phase === EnginePhase.ACTIONS
      ? (before.currentCharacter || (charId !== undefined ? CHAR_NAMES[charId] : undefined))
      : undefined;

    return {
      step: this.stepIndex,
      order,
      phase: before.phase,
      type: action.type,
      summary: this.summarizeAction(action, beforeP, afterP, targets, charName),
      detail: this.detailAction(action, beforeP, afterP, targets),
      playerId: actorId,
      playerName: afterP?.name || beforeP?.name,
      characterId: charId,
      characterName: charName,
      data: action.data,
      targets: targets.length ? targets : undefined,
      deltas: {
        gold: goldDelta,
        hand: handDelta,
        cityAdded: added,
        cityRemoved: removed,
      },
      frameAfter: this.toFrame(after),
    };
  }

  private resolveTargets(
    action: EngineAction,
    before: EngineObservation,
    after: EngineObservation,
  ): ReplayEventTarget[] {
    const targets: ReplayEventTarget[] = [];
    switch (action.type) {
      case EngineActionType.ASSASSIN_KILL: {
        const cid = Number(action.data) - 1;
        targets.push({
          characterId: cid,
          characterName: CHAR_NAMES[cid] || String(action.data),
        });
        break;
      }
      case EngineActionType.THIEF_ROB: {
        const cid = Number(action.data) - 1;
        targets.push({
          characterId: cid,
          characterName: CHAR_NAMES[cid] || String(action.data),
        });
        break;
      }
      case EngineActionType.MAGICIAN_EXCHANGE_HAND: {
        const idx = Number(action.data);
        const pid = before.players[idx]?.id;
        const name = before.players[idx]?.name;
        targets.push({ playerId: pid, playerName: name, playerIndex: idx });
        break;
      }
      case EngineActionType.WARLORD_DESTROY_DISTRICT: {
        const data = action.data as { player?: number; card?: string } | undefined;
        if (data) {
          const idx = data.player ?? -1;
          targets.push({
            playerId: before.players[idx]?.id,
            playerName: before.players[idx]?.name,
            playerIndex: idx,
            card: data.card,
          });
        }
        break;
      }
      case EngineActionType.BUILD_DISTRICT: {
        if (action.data != null) {
          targets.push({ card: String(action.data) });
        }
        break;
      }
      default:
        break;
    }
    // also surface killed/robbed changes
    if (after.killedCharacterId !== before.killedCharacterId && after.killedCharacterName) {
      if (!targets.some((t) => t.characterName === after.killedCharacterName)) {
        targets.push({
          characterId: after.killedCharacterId,
          characterName: after.killedCharacterName,
        });
      }
    }
    return targets;
  }

  private cityDiff(before: string[], after: string[]) {
    const bc = new Map<string, number>();
    const ac = new Map<string, number>();
    before.forEach((c) => bc.set(c, (bc.get(c) || 0) + 1));
    after.forEach((c) => ac.set(c, (ac.get(c) || 0) + 1));
    const added: string[] = [];
    const removed: string[] = [];
    const keys = new Set([...bc.keys(), ...ac.keys()]);
    keys.forEach((k) => {
      const d = (ac.get(k) || 0) - (bc.get(k) || 0);
      if (d > 0) for (let i = 0; i < d; i += 1) added.push(k);
      if (d < 0) for (let i = 0; i < -d; i += 1) removed.push(k);
    });
    return { added, removed };
  }

  private summarizeAction(
    action: EngineAction,
    beforeP?: EngineObservation['players'][0],
    afterP?: EngineObservation['players'][0],
    targets: ReplayEventTarget[] = [],
    charName?: string,
  ): string {
    const who = afterP?.name || beforeP?.name || '玩家';
    const role = charName ? `【${charName}】` : '';
    switch (action.type) {
      case EngineActionType.CHOOSE_CHARACTER:
        return `${who} 选择角色（索引 ${action.data}）`;
      case EngineActionType.TAKE_GOLD:
        return `${who}${role} 领取 2 金币`;
      case EngineActionType.DRAW_CARDS:
        return action.data != null && action.data !== null
          ? `${who}${role} 选入手牌 ${action.data}`
          : `${who}${role} 抽区域卡`;
      case EngineActionType.TAKE_GOLD_EARNINGS:
        return `${who}${role} 收取城市产出`;
      case EngineActionType.BUILD_DISTRICT:
        return action.data != null
          ? `${who}${role} 建造 ${action.data}`
          : `${who}${role} 进入建造`;
      case EngineActionType.ASSASSIN_KILL:
        return `${who}${role} 刺杀 ${targets[0]?.characterName || action.data}`;
      case EngineActionType.THIEF_ROB:
        return `${who}${role} 标记偷窃 ${targets[0]?.characterName || action.data}`;
      case EngineActionType.MAGICIAN_EXCHANGE_HAND:
        return `${who}${role} 与 ${targets[0]?.playerName || '他人'} 交换手牌`;
      case EngineActionType.MAGICIAN_DISCARD_CARDS:
        return `${who}${role} 弃牌重摸`;
      case EngineActionType.WARLORD_DESTROY_DISTRICT:
        return `${who}${role} 拆除 ${targets[0]?.playerName || ''} 的 ${targets[0]?.card || '建筑'}`;
      case EngineActionType.FINISH_TURN:
        return `${who}${role} 结束回合`;
      case EngineActionType.DECLINE:
        return `${who}${role} 取消/跳过`;
      default:
        return `${who}${role} ${action.type}`;
    }
  }

  private detailAction(
    action: EngineAction,
    beforeP?: EngineObservation['players'][0],
    afterP?: EngineObservation['players'][0],
    targets: ReplayEventTarget[] = [],
  ): string {
    const g0 = beforeP?.stash ?? 0;
    const g1 = afterP?.stash ?? 0;
    const h0 = beforeP?.handCount ?? 0;
    const h1 = afterP?.handCount ?? 0;
    const c0 = beforeP?.citySize ?? 0;
    const c1 = afterP?.citySize ?? 0;
    const parts = [
      `金币 ${g0}→${g1}`,
      `手牌 ${h0}→${h1}`,
      `城建 ${c0}→${c1}`,
    ];
    if (targets.length) {
      parts.push(`目标: ${targets.map((t) => t.characterName || t.playerName || t.card || '?').join(', ')}`);
    }
    if (afterP?.city?.length) {
      parts.push(`城市: ${afterP.city.join(', ')}`);
    }
    return parts.join(' · ');
  }

  private buildCharacterBlocks(major: ReplayMajorRound) {
    const map = new Map<string, {
      characterId: number;
      characterName: string;
      playerId: string | null;
      playerName: string;
      killed: boolean;
      eventOrders: number[];
    }>();

    major.events.forEach((ev) => {
      if (ev.phase !== EnginePhase.ACTIONS) return;
      if (ev.characterId === undefined || ev.characterId < 0) return;
      const key = String(ev.characterId);
      if (!map.has(key)) {
        map.set(key, {
          characterId: ev.characterId,
          characterName: ev.characterName || CHAR_NAMES[ev.characterId] || key,
          playerId: ev.playerId,
          playerName: ev.playerName || '?',
          killed: false,
          eventOrders: [],
        });
      }
      map.get(key)!.eventOrders.push(ev.order);
      if (ev.playerId) {
        map.get(key)!.playerId = ev.playerId;
        map.get(key)!.playerName = ev.playerName || map.get(key)!.playerName;
      }
    });

    // mark killed from frame
    const killed = major.frameEnd.killedCharacter;
    if (killed !== undefined && killed >= 0 && !map.has(String(killed))) {
      map.set(String(killed), {
        characterId: killed,
        characterName: CHAR_NAMES[killed] || String(killed),
        playerId: null,
        playerName: '（被刺杀未行动）',
        killed: true,
        eventOrders: [],
      });
    } else if (killed !== undefined && map.has(String(killed))) {
      // if somehow present
    }

    return [...map.values()].sort((a, b) => a.characterId - b.characterId);
  }

  private summarizeMajor(major: ReplayMajorRound): string {
    const builds = major.events.filter((e) => e.type === EngineActionType.BUILD_DISTRICT && e.data != null).length;
    const kills = major.events.filter((e) => e.type === EngineActionType.ASSASSIN_KILL).length;
    return `${major.events.length} 次行动 · 建造 ${builds} · 刺杀 ${kills}`;
  }

  private orderActions(legalActions: EngineAction[], observation: EngineObservation): EngineAction[] {
    if (!legalActions.length) return [];
    const player = observation.players.find((p) => p.id === observation.currentPlayerId);
    const ordered: EngineAction[] = [];
    const used = new Set<EngineAction>();
    const take = (pred: (a: EngineAction) => boolean) => {
      legalActions.filter(pred).forEach((a) => {
        if (!used.has(a)) {
          used.add(a);
          ordered.push(a);
        }
      });
    };

    take((a) => a.type === EngineActionType.CHOOSE_CHARACTER);
    take((a) => a.type === EngineActionType.TAKE_GOLD_EARNINGS);
    take((a) => a.type === EngineActionType.BUILD_DISTRICT && a.data === undefined);
    legalActions
      .filter((a) => a.type === EngineActionType.BUILD_DISTRICT && a.data != null)
      .sort((a, b) => (CARD_COST[String(a.data)] ?? 99) - (CARD_COST[String(b.data)] ?? 99))
      .forEach((a) => {
        if (!used.has(a)) {
          used.add(a);
          ordered.push(a);
        }
      });
    legalActions
      .filter((a) => a.type === EngineActionType.DRAW_CARDS && a.data != null)
      .sort((a, b) => (CARD_COST[String(a.data)] ?? 99) - (CARD_COST[String(b.data)] ?? 99))
      .forEach((a) => {
        if (!used.has(a)) {
          used.add(a);
          ordered.push(a);
        }
      });
    if (player && player.handCount === 0) {
      take((a) => a.type === EngineActionType.DRAW_CARDS && a.data === undefined);
      take((a) => a.type === EngineActionType.TAKE_GOLD);
    } else {
      take((a) => a.type === EngineActionType.TAKE_GOLD);
      take((a) => a.type === EngineActionType.DRAW_CARDS && a.data === undefined);
    }
    take((a) => a.type === EngineActionType.FINISH_TURN);
    take((a) => a.type === EngineActionType.DECLINE);
    legalActions.forEach((a) => {
      if (!used.has(a)) ordered.push(a);
    });
    return ordered;
  }
}
