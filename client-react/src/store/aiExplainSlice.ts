import { StateCreator } from 'zustand';
import type { AuthSlice } from './authSlice';
import type { GameSlice } from './gameSlice';

const AI_EXPLAIN_MAX_LENGTH = 500;

// 与服务端 server/src/game/AiExplainer.ts 的类型对应（dev-only 功能，
// 不进 citadels-common，避免公共包被调试类型污染）。
export interface AiExplainFactor {
  label: string;
  value: number;
}

export interface AiExplainCandidate {
  label: string;
  score?: number;
  factors?: AiExplainFactor[];
}

export interface AiExplainRecord {
  round: number;
  version: string;
  actor: string;
  decision: string;
  candidates: AiExplainCandidate[];
  chosen: string;
  note?: string;
}

export interface AiExplainSlice {
  /** AI 思考记录（仅 AI_DEBUG 服务器 + dev 构建下会有数据流入） */
  aiExplainRecords: AiExplainRecord[];
  addAiExplain: (record: AiExplainRecord) => void;
  clearAiExplain: () => void;
}

// AI 思考流 lives in its own slice: records are independent of game state,
// pushed by the socket seam (socket/index.ts) when the dev-only 'ai-explain'
// event arrives. Panel = components/dev/DevAiPanel.tsx.
export const createAiExplainSlice: StateCreator<AiExplainSlice & AuthSlice & GameSlice, [], [], AiExplainSlice> = (set) => ({
  aiExplainRecords: [],

  addAiExplain(record) {
    set((state) => {
      const next = [...state.aiExplainRecords, record];
      if (next.length > AI_EXPLAIN_MAX_LENGTH) {
        return { aiExplainRecords: next.slice(next.length - AI_EXPLAIN_MAX_LENGTH) };
      }
      return { aiExplainRecords: next };
    });
  },

  clearAiExplain() {
    set({ aiExplainRecords: [] });
  },
});
