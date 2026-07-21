import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import {
  computeTeamScores, MatchResult, TeamId, ClientGameState, PlayerId,
} from 'citadels-common';

// Player meta is an inline type inside ClientGameState['players']; extract it
// rather than inventing a name that common doesn't export.
type PlayerMeta = ClientGameState['players'][PlayerId];

interface EndScoreRow {
  id: string;
  name: string;
  isSelf: boolean;
  isAi: boolean;
  team: string;
  total: number;
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

// Mirrors Vue EndGameModal.vue. Uses createPortal (same as Modal) rather than
// the shared Modal component because this dialog has a bespoke table body.
// getPlayerFromId is passed as a prop (parent already has the selector) to
// avoid a store dependency inside this presentational component.
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
    return {
      title,
      detail: t('ui.score.team_totals', { a: A, b: B }),
    };
  }, [showTeamScores, liveTeamScores, gameState, t]);

  const endSubtitle = matchSummary?.detail || matchSummary?.title || '';
  const endHeaderClass = isWin ? 'bg-success text-white'
    : isLose ? 'bg-danger text-white'
      : 'bg-secondary text-white';

  const endScoreRows = useMemo<EndScoreRow[]>(() => {
    const order = gameState?.board?.playerOrder || [];
    return order.map((pid) => {
      const meta = getPlayerFromId(pid);
      const board = gameState?.board?.players?.[pid];
      let team = '';
      if (meta?.team === TeamId.A) team = 'A';
      if (meta?.team === TeamId.B) team = 'B';
      return {
        id: pid,
        name: meta?.username || pid,
        isSelf: pid === selfId,
        isAi: Boolean(meta?.isAi),
        team,
        total: board?.score?.total ?? 0,
      };
    }).sort((a, b) => b.total - a.total);
  }, [gameState, selfId, getPlayerFromId]);

  if (!show) return null;

  return createPortal(
    <div className="modal fade show d-block" style={{ background: 'rgba(0,0,0,0.65)', zIndex: 1050 }}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className={`modal-header ${endHeaderClass}`}>
            <h4 className="modal-title mb-0">{endTitle}</h4>
            <button type="button" className="close text-white" onClick={onClose} aria-label="close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body">
            <div className="text-center mb-3">
              <div className="h5">{endSubtitle}</div>
              {showTeamScores && (
                <div className="mt-2">
                  <span className="badge badge-primary badge-pill px-3 py-2 mr-2">
                    {isSpectator ? t('ui.team.a') : t('ui.team.mine')} {liveTeamScores.A}
                  </span>
                  <span className="badge badge-danger badge-pill px-3 py-2">
                    {isSpectator ? t('ui.team.b') : t('ui.team.enemy')} {liveTeamScores.B}
                  </span>
                </div>
              )}
            </div>
            <table className="table table-sm table-striped mb-0">
              <thead>
                <tr>
                  <th>{t('ui.lobby.players')}</th>
                  {showTeamScores && <th>{t('ui.stats.team')}</th>}
                  <th className="text-right">{t('ui.score.total')}</th>
                </tr>
              </thead>
              <tbody>
                {endScoreRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.name}
                      {row.isSelf && <span className="badge badge-info ml-1">{t('ui.lobby.you')}</span>}
                      {row.isAi && <span className="badge badge-dark ml-1">AI</span>}
                    </td>
                    {showTeamScores && (
                      <td>
                        <span className={`badge ${row.team === 'A' ? 'badge-primary' : 'badge-danger'}`}>
                          {row.team}
                        </span>
                      </td>
                    )}
                    <td className="text-right font-weight-bold">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              {t('ui.score.keep_browsing')}
            </button>
            <button type="button" className="btn btn-primary" onClick={onLeave}>
              {t('ui.score.leave_room')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
