import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import {
  computeTeamScores, MatchResult, TeamId, ClientGameState, PlayerId, Avatar,
} from 'citadels-common';
import { avatarUrl } from '@/utils/avatarUrl';

type PlayerMeta = ClientGameState['players'][PlayerId];

interface EndScoreRow {
  id: string;
  name: string;
  isSelf: boolean;
  isAi: boolean;
  team: string;
  total: number;
  buildings: number;
  bonusItems: { label: string; value: number }[];
  avatar?: Avatar;
}

interface EndGameModalProps {
  show: boolean;
  gameState: ClientGameState;
  selfId: PlayerId;
  isSpectator: boolean;
  showTeamScores: boolean;
  getPlayerFromId: (id: PlayerId) => PlayerMeta | undefined;
  onClose?: () => void;
  onLeave?: () => void;
}

export default function EndGameModal({
  show,
  gameState,
  selfId,
  isSpectator,
  showTeamScores,
  getPlayerFromId,
  onClose,
  onLeave,
}: EndGameModalProps) {
  const { t } = useTranslation();

  const { isWin, isLose } = useMemo(() => {
    const result = gameState?.matchResult;
    const team = getPlayerFromId(selfId)?.team;
    return {
      isWin: (result === MatchResult.TEAM_A_WIN && team === TeamId.A)
        || (result === MatchResult.TEAM_B_WIN && team === TeamId.B),
      isLose: (result === MatchResult.TEAM_A_WIN && team === TeamId.B)
        || (result === MatchResult.TEAM_B_WIN && team === TeamId.A),
    };
  }, [gameState, selfId, getPlayerFromId]);

  const liveTeamScores = useMemo(() => {
    if (!gameState) return { A: 0, B: 0 };
    const { A, B } = computeTeamScores(gameState);
    const mine = getPlayerFromId(selfId)?.team;
    if (!isSpectator && mine === TeamId.B) {
      return { A: B, B: A };
    }
    return { A, B };
  }, [gameState, selfId, isSpectator, getPlayerFromId]);

  const endTitle = useMemo(() => {
    if (isSpectator) return t('ui.score.game_over');
    if (isWin) return t('ui.score.you_win');
    if (isLose) return t('ui.score.you_lose');
    if (gameState?.matchResult === MatchResult.DRAW) return t('ui.score.draw');
    return t('ui.score.game_over');
  }, [isSpectator, isWin, isLose, gameState, t]);

  const matchSummary = useMemo(() => {
    if (!showTeamScores) return null;
    const { A, B } = liveTeamScores;
    const result = gameState?.matchResult;
    let title = t('ui.score.draw');
    if (result === MatchResult.TEAM_A_WIN) title = t('ui.score.team_a_win');
    if (result === MatchResult.TEAM_B_WIN) title = t('ui.score.team_b_win');
    if (result === MatchResult.CASUAL_END) title = t('ui.score.game_over');
    return { title, detail: t('ui.score.team_totals', { a: A, b: B }) };
  }, [showTeamScores, liveTeamScores, gameState, t]);

  const endSubtitle = matchSummary?.detail || matchSummary?.title || '';

  const endScoreRows = useMemo<EndScoreRow[]>(() => {
    const order = gameState?.board?.playerOrder || [];
    return order.map((pid) => {
      const meta = getPlayerFromId(pid);
      const board = gameState?.board?.players?.[pid];
      const score = board?.score;
      let team = '';
      if (meta?.team === TeamId.A) team = 'A';
      if (meta?.team === TeamId.B) team = 'B';
      const bonusItems: EndScoreRow['bonusItems'] = [];
      if (score?.extraPointsCompleteCity === 4) {
        bonusItems.push({ label: t('ui.score.first'), value: 4 });
      } else if (score?.extraPointsCompleteCity === 2) {
        bonusItems.push({ label: t('ui.score.second'), value: 2 });
      }
      if (score?.extraPointsDistrictTypes === 3) {
        bonusItems.push({ label: t('ui.score.full_colors'), value: 3 });
      }
      return {
        id: pid,
        name: meta?.username || pid,
        isSelf: pid === selfId,
        isAi: Boolean(meta?.isAi),
        team,
        total: score?.total ?? 0,
        buildings: (board?.city || []).length,
        bonusItems,
        avatar: meta?.avatar,
      };
    }).sort((a, b) => b.total - a.total);
  }, [gameState, selfId, getPlayerFromId, t]);

  if (!show) return null;

  return createPortal(
    <div className="endgame-overlay">
      <div className="endgame-dialog">
        <div className={`endgame-header${isWin ? ' endgame-header--win' : ''}${isLose ? ' endgame-header--lose' : ''}`}>
          <h4 className="endgame-title">{endTitle}</h4>
          <button type="button" className="endgame-close" onClick={onClose} aria-label="close">&times;</button>
        </div>
        <div className="endgame-body">
          {endSubtitle && (
            <div className="endgame-subtitle">
              {endSubtitle}
            </div>
          )}
          {showTeamScores && (
            <div className="endgame-team-scores">
              <span className="endgame-team-badge endgame-team-badge--a">
                {isSpectator ? t('ui.team.a') : t('ui.team.mine')} {liveTeamScores.A}
              </span>
              <span className="endgame-team-badge endgame-team-badge--b">
                {isSpectator ? t('ui.team.b') : t('ui.team.enemy')} {liveTeamScores.B}
              </span>
            </div>
          )}
          <table className="endgame-table">
              <thead>
                <tr>
                  <th className="endgame-th endgame-th--player">{t('ui.lobby.players')}</th>
                  {showTeamScores && <th className="endgame-th">{t('ui.stats.team')}</th>}
                  <th className="endgame-th endgame-th--num">{t('ui.score.buildings')}</th>
                  <th className="endgame-th endgame-th--bonus">{t('ui.score.bonus')}</th>
                  <th className="endgame-th endgame-th--num">{t('ui.score.total')}</th>
                </tr>
              </thead>
            <tbody>
              {endScoreRows.map((row, idx) => (
                <tr key={row.id} className={`endgame-row${row.isSelf ? ' endgame-row--self' : ''}`}>
                  <td className="endgame-td endgame-td--player">
                    <span className="endgame-rank">{idx + 1}</span>
                    {row.avatar && <img src={avatarUrl(row.avatar)} alt="" className="endgame-avatar" />}
                    <span className="endgame-name">{row.name}</span>
                    {row.isSelf && <span className="endgame-tag endgame-tag--self">{t('ui.lobby.you')}</span>}
                    {row.isAi && <span className="endgame-tag endgame-tag--ai">AI</span>}
                  </td>
                  {showTeamScores && (
                    <td className="endgame-td endgame-td--center">
                      <span className={`endgame-team-tag${row.team === 'A' ? ' endgame-team-tag--a' : ' endgame-team-tag--b'}`}>
                        {row.team}
                      </span>
                    </td>
                  )}
                  <td className="endgame-td endgame-td--num">{row.buildings}</td>
                  <td className="endgame-td endgame-td--bonus">
                    {row.bonusItems.length > 0 ? (
                      <span className="endgame-bonus-list">
                        {row.bonusItems.map((item, bi) => (
                          <span key={bi} className="endgame-bonus-item">
                            {item.label}<span className="endgame-bonus-val">+{item.value}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="endgame-bonus-none">-</span>
                    )}
                  </td>
                  <td className="endgame-td endgame-td--num endgame-td--total">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="endgame-footer">
          <button type="button" className="endgame-btn endgame-btn--secondary" onClick={onClose}>
            {t('ui.score.keep_browsing')}
          </button>
          <button type="button" className="endgame-btn endgame-btn--primary" onClick={onLeave}>
            {t('ui.score.leave_room')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
