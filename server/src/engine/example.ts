import { EngineActionType } from './types';
import { TrainingEngine } from './trainingEngine';

const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'];
const engine = new TrainingEngine(names);

const obs = engine.getObservation('p1');
console.log('initial phase', obs.phase);
console.log('initial currentPlayer', obs.currentPlayerId);
console.log('initial legalActions', obs.legalActions.map((action) => action.type));

const result = engine.applyAction({ type: EngineActionType.CHOOSE_CHARACTER, playerId: 'p1', data: 0 });
console.log('first action ok', result.ok, result.message);
if (result.observation) {
  console.log('after first action phase', result.observation.phase);
  console.log('after first action legalActions', result.observation.legalActions.map((action) => action.type));
}
