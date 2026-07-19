import { DistrictId } from 'citadels-common';
import { ALL_DISTRICTS } from './DistrictCard';

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
  actionFeed: { text: string; kind?: string }[],
) {
  if (character < 0) return;
  const cm = board.characterManager;
  const role = roleNameZh(character);
  const pos = cm.characters[character];
  const seat = pos - 3; // CharacterPosition.PLAYER_1 = 3
  const ownerId = board.playerOrder[seat] ?? null;
  if (ownerId == null) {
    actionFeed.push({ text: `本轮无人选择${role}`, kind: 'info' });
    return;
  }
  const name = playerName(players, ownerId);
  if (character === cm.killedCharacter) {
    actionFeed.push({ text: `${name} 的${role}被刺杀，本轮不能行动`, kind: 'kill' });
    return;
  }
  actionFeed.push({ text: `${name} 的${role}开始行动` });
}
