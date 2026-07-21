import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface ScoreBreakdown {
  total?: number;
  base?: number;
  extraPointsDistrictTypes?: number;
  extraPointsCompleteCity?: number;
}

interface ScoreLine {
  title: string;
  value: number;
}

interface PlayerScoreProps {
  score?: ScoreBreakdown | null;
}

// Pure presentational — mirrors Vue elements/PlayerScore.vue. The `lines`
// computed becomes a useMemo.
export default function PlayerScore({ score }: PlayerScoreProps) {
  const { t } = useTranslation();

  const lines = useMemo<ScoreLine[]>(() => {
    const s = score || {};
    const result: ScoreLine[] = [];
    if (s.base != null) result.push({ title: 'base', value: s.base });
    if (s.extraPointsDistrictTypes) {
      result.push({ title: 'extra_district_types', value: s.extraPointsDistrictTypes });
    }
    if (s.extraPointsCompleteCity) {
      result.push({ title: 'extra_complete_city', value: s.extraPointsCompleteCity });
    }
    return result;
  }, [score]);

  return (
    <div className="card bg-dark border-0">
      <div className="list-group list-group-flush text-dark">
        <div className="list-group-item list-group-item-warning p-1 px-2 d-flex justify-content-between align-items-center">
          <span className="small font-weight-bold">{t('ui.score.total')}</span>
          <span className="badge badge-warning">{score?.total ?? 0}</span>
        </div>
        {lines.map((line, i) => (
          <div
            key={i}
            className="list-group-item list-group-item-dark p-1 px-2 d-flex justify-content-between align-items-center small"
          >
            <span className="text-muted">{t(`ui.score.${line.title}`)}</span>
            <span className="badge badge-secondary">{line.value ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
