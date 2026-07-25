import { type ActionFeedLine } from 'citadels-common';
import { ALL_DISTRICTS } from './DistrictCard';

// NOTE: CHARACTER_NAMES_ZH / DISTRICT_NAMES_ZH / roleNameZh / districtLabelZh
// are used only by buildRoundSummary(), which feeds lastRoundSummary — a
// server-internal/debug string NOT shown in the client UI (no client-react
// reference exists). The action feed itself is now i18n-driven: logCharacterCall
// pushes structured { kind, params } entries that the client localizes via
// formatActionFeedLine(). Do not add new UI-facing Chinese here.
const CHARACTER_NAMES_ZH = ['刺客', '盗贼', '魔术师', '国王', '主教', '商人', '建筑师', '军阀'];

const DISTRICT_NAMES_ZH: Record<string, string> = {
  manor: '庄园',
  castle: '城堡',
  palace: '宫殿',
  temple: '神庙',
  church: '教堂',
  monastery: '修道院',
  cathedral: '大教堂',
  tavern: '酒馆',
  market: '市场',
  trading_post: '商栈',
  docks: '码头',
  harbor: '港口',
  town_hall: '市政厅',
  watchtower: '瞭望塔',
  prison: '监狱',
  barracks: '兵营',
  fortress: '要塞',
  dragon_gate: '龙门',
  university: '大学',
  map_room: '地图室',
  imperial_treasury: '帝国宝库',
  haunted_quarter: '闹鬼城区',
  school_of_magic: '魔法学校',
  keep: '要塞堡垒',
  great_wall: '长城',
  graveyard: '墓地',
  observatory: '天文台',
  library: '图书馆',
  laboratory: '实验室',
  smithy: '铁匠铺',
};

export function roleNameZh(ch: number): string {
  return CHARACTER_NAMES_ZH[ch] || `角色${ch + 1}`;
}

export function districtLabelZh(cardId: string): string {
  const name = DISTRICT_NAMES_ZH[cardId] || cardId;
  const card = ALL_DISTRICTS.get(cardId)?.card;
  const cost = card?.cost ?? '?';
  const color = ['?', '黄', '蓝', '绿', '红', '紫'][card?.type ?? 0] || '?';
  return `${name}（${color}${cost}）`;
}

export function playerName(players: Map<string, { username: string }>, playerId: string): string {
  return players.get(playerId)?.username || playerId;
}

export function buildRoundSummary(
  players: Map<string, { username: string }>,
  board: {
    playerOrder: string[];
    players: Map<string, { city: string[]; stash: number; score?: { total?: number } }>;
    characterManager: { killedCharacter: number; robbedCharacter: number };
  },
): string {
  const cm = board.characterManager;
  const names = ['刺客', '盗贼', '魔术师', '国王', '主教', '商人', '建筑师', '军阀'];
  const parts: string[] = [];
  if (cm.killedCharacter >= 0) {
    parts.push(`被刺：${names[cm.killedCharacter] || cm.killedCharacter}`);
  }
  if (cm.robbedCharacter >= 0) {
    parts.push(`被偷：${names[cm.robbedCharacter] || cm.robbedCharacter}`);
  }
  board.playerOrder.forEach((pid) => {
    const meta = players.get(pid);
    const boardPlayer = board.players.get(pid);
    if (!meta || !boardPlayer) return;
    parts.push(
      `${meta.username} 城${boardPlayer.city.length} 金${boardPlayer.stash} 分${boardPlayer.score?.total ?? 0}`,
    );
  });
  return parts.join(' · ');
}

export function logCharacterCall(
  players: Map<string, { username: string }>,
  board: {
    playerOrder: string[];
    characterManager: {
      killedCharacter: number;
      getCurrentCharacter: () => number;
      characters: number[];
    };
  },
  character: number,
  actionFeed: ActionFeedLine[],
) {
  if (character < 0) return;
  const cm = board.characterManager;
  const pos = cm.characters[character];
  const seat = pos - 3; // CharacterPosition.PLAYER_1 = 3
  const ownerId = board.playerOrder[seat] ?? null;
  // role is a 1-based client id (characters i18n array is 1-indexed, matching
  // CharacterManager's face-up card ids); the raw `character` enum value is
  // 0-based, so add 1 for the param. The killedCharacter comparison above/below
  // uses the raw 0-based enum value and must NOT be shifted.
  const clientRole = character + 1;
  if (ownerId == null) {
    actionFeed.push({ kind: 'call_empty', params: { role: clientRole } });
    return;
  }
  const name = playerName(players, ownerId);
  if (character === cm.killedCharacter) {
    actionFeed.push({ kind: 'call_killed', params: { player: name, role: clientRole } });
    return;
  }
  actionFeed.push({ kind: 'call', params: { player: name, role: clientRole } });
}
