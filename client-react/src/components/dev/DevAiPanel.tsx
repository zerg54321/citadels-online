// DEV AI Panel — development-only AI thinking viewer.
//
// Shows the live decision stream broadcast by an AI_DEBUG=1 server
// ('ai-explain' events, produced by server/src/game/AiExplainer.ts):
// for every AI decision — the ranked candidates with their real scores,
// the chosen one, and the note explaining special cases (hardcoded assassin
// first pick, MCTS override, priority order semantics).
//
// Mounts only under import.meta.env.DEV (see App.tsx) and portals to
// document.body so it escapes the GameStage scale layer, exactly like
// DevAvPanel. Records live only in the client store (cleared when the
// store is reset); nothing is persisted to game archives.

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store';
import type { AiExplainFactor, AiExplainRecord } from '@/store/aiExplainSlice';
import { cn } from '@/utils/cn';

// 决策类型 → 展示配色（关键决策高亮，方便扫视）
const DECISION_TONE: Record<string, 'gold' | 'red' | 'blue' | 'green' | 'gray'> = {
  '选角': 'gold',
  '天绝扣牌(明置)': 'gray',
  '扣牌(暗置)': 'gray',
  '末位选角(先选1扣1)': 'gray',
  '刺客目标': 'red',
  '盗贼目标': 'red',
  '魔术师交换目标': 'blue',
  '军阀拆房目标': 'red',
  '建造顺序': 'green',
  '二选一选牌': 'green',
  '资源行动(优先级序)': 'blue',
  '可选行动(优先级序)': 'blue',
};

function toneClass(decision: string): string {
  return `dev-ai__tone--${DECISION_TONE[decision] ?? 'gray'}`;
}

function fmtScore(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/** 因子明细行："= EV 5.2 + 座位权重 3 + 同色截断 -1.5" */
function FactorRow({ factors }: { factors: AiExplainFactor[] }) {
  return (
    <div className="dev-ai__factors">
      {factors.map((f, i) => (
        <span
          key={i}
          className={cn('dev-ai__factor', f.value < 0 && 'is-negative')}
        >
          {f.label} {fmtScore(f.value)}
        </span>
      ))}
    </div>
  );
}

function RecordEntry({ record, index, expanded, onToggle }: {
  record: AiExplainRecord;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasScores = record.candidates.some((c) => c.score !== undefined);
  const maxAbs = hasScores
    ? Math.max(...record.candidates.map((c) => Math.abs(c.score ?? 0)), 1)
    : 1;

  return (
    <div className={cn('dev-ai__entry', expanded && 'is-expanded')}>
      <button type="button" className="dev-ai__entry-head" onClick={onToggle}>
        <span className="dev-ai__entry-round">R{record.round}</span>
        <span className={cn('dev-ai__entry-decision', toneClass(record.decision))}>
          {record.decision}
        </span>
        <span className="dev-ai__entry-actor">@{record.actor}</span>
        <span className="dev-ai__entry-chosen">{record.chosen}</span>
      </button>

      {expanded && (
        <div className="dev-ai__entry-body">
          {record.candidates.map((c, i) => {
            const chosen = c.label === record.chosen;
            return (
              <div key={`${index}-${i}`} className={cn('dev-ai__cand', chosen && 'is-chosen')}>
                <div className="dev-ai__cand-row">
                  <span className="dev-ai__cand-label">
                    {chosen ? '▸ ' : ''}{c.label}
                  </span>
                  {c.score !== undefined && (
                    <span className="dev-ai__cand-bar-wrap">
                      <span
                        className={cn('dev-ai__cand-bar', c.score < 0 && 'is-negative')}
                        style={{ width: `${Math.max(Math.abs(c.score) / maxAbs * 100, 2)}%` }}
                      />
                    </span>
                  )}
                  <span className="dev-ai__cand-score">
                    {c.score !== undefined ? fmtScore(c.score) : '—'}
                  </span>
                </div>
                {c.factors && c.factors.length > 0 && <FactorRow factors={c.factors} />}
              </div>
            );
          })}
          {record.note && <div className="dev-ai__entry-note">{record.note}</div>}
        </div>
      )}
    </div>
  );
}

export default function DevAiPanel() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>('全部');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const records = useAppStore((s) => s.aiExplainRecords);
  const clearAiExplain = useAppStore((s) => s.clearAiExplain);

  const decisionTypes = useMemo(() => {
    const seen: string[] = [];
    records.forEach((r) => { if (!seen.includes(r.decision)) seen.push(r.decision); });
    return seen;
  }, [records]);

  // 最新在最上：实时流无需自动滚动，新决策直接出现在顶部
  const visible = useMemo(() => {
    const list = filter === '全部'
      ? records
      : records.filter((r) => r.decision === filter);
    return list.map((r, i) => ({ r, idx: i })).reverse();
  }, [records, filter]);

  return createPortal(
    <div className="dev-ai">
      {!open && (
        <button
          type="button"
          className="dev-ai__fab"
          title="DEV AI 思考面板"
          onClick={() => setOpen(true)}
        >
          AI{records.length > 0 && <span className="dev-ai__fab-count">{records.length}</span>}
        </button>
      )}

      {open && (
        <div className="dev-ai__panel medieval-panel">
          <div className="dev-ai__head">
            <span className="dev-ai__title">AI 思考</span>
            <span className="dev-ai__badge">DEV</span>
            <span className="dev-ai__count">{records.length} 条</span>
            <button
              type="button"
              className="dev-ai__btn"
              onClick={() => { clearAiExplain(); setExpandedIdx(null); }}
            >
              清空
            </button>
            <button type="button" className="dev-ai__x" onClick={() => setOpen(false)} aria-label="close">×</button>
          </div>

          <div className="dev-ai__filters">
            {['全部', ...decisionTypes].map((t) => (
              <button
                key={t}
                type="button"
                className={cn('dev-ai__chip', filter === t && 'is-active')}
                onClick={() => { setFilter(t); setExpandedIdx(null); }}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="dev-ai__list">
            {visible.length === 0 && (
              <div className="dev-ai__empty">
                暂无 AI 决策记录。需要服务端以 AI_DEBUG=1 启动，
                且当前对局中有 AI 行动。
              </div>
            )}
            {visible.map(({ r, idx }) => (
              <RecordEntry
                key={records.length - idx}
                record={r}
                index={idx}
                expanded={expandedIdx === idx}
                onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              />
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
