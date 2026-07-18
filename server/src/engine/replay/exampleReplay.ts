import * as fs from 'fs';
import * as path from 'path';
import { ReplayRecorder } from './replayRecorder';

const names = process.argv.slice(2);
const playerNames = names.length === 6
  ? names
  : ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'];

const maxSteps = Number(process.env.REPLAY_MAX_STEPS || 5000);
const recorder = new ReplayRecorder(playerNames);
const replay = recorder.runToEnd(maxSteps);

const serverOut = path.resolve(__dirname, '../../../replays/example-replay.json');
const clientPublicOut = path.resolve(__dirname, '../../../../client/public/replays/example-replay.json');
const clientRootOut = path.resolve(__dirname, '../../../../client/replays/example-replay.json');

const outputPath = recorder.writeToFile(serverOut);
for (const dest of [clientPublicOut, clientRootOut]) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(outputPath, dest);
}

console.log('replay saved to', outputPath);
console.log('frontend copy saved to', clientPublicOut);
console.log('major rounds', replay.rounds.length);
console.log('steps', replay.steps?.length ?? 0);
console.log('summary', replay.summary);
console.log('finished', replay.finished, 'maxCity', replay.maxCity);
console.log('open: http://127.0.0.1:3000/replay-viewer.html');
