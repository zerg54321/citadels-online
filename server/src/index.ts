import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';
import history from 'connect-history-api-fallback';
import { initSocket } from './socket/server';
import { createAuthRouter } from './auth/routes';
import { createStatsRouter } from './stats/routes';
import { createRoomsRouter } from './rooms/routes';
import { dbPath } from './db/database';

const app = express();
const http = createServer(app);
const port = process.env.PORT || 8081;

app.enable('trust proxy');
app.use(express.json());

// redirect to https (skip local and API)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    next();
    return;
  }
  if (req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1' && !req.secure) {
    res.redirect(`https://${req.hostname}${req.url}`);
  } else {
    next();
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', createAuthRouter());
app.use('/api/stats', createStatsRouter());
app.use('/api/rooms', createRoomsRouter());

// offline replay JSON (generate-replay.cmd → server/replays/)
app.use('/replays', express.static(path.resolve(__dirname, '../replays')));

const io = new Server(http, {
  path: '/s/',
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.CORS_ORIGIN || 'http://localhost:8081')
      : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  },
});
initSocket(io);

app.use(express.static('../client/dist'));
app.use(history());

http.listen(port, () => {
  console.log(`Citadels game server listening on http://localhost:${port}`);
  console.log(`Database: ${dbPath}`);
});
