import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import history from 'connect-history-api-fallback';
import { initSocket } from './socket/server';
import { createAuthRouter } from './auth/routes';
import { createAvatarRouter } from './auth/avatarRoutes';
import { createStatsRouter } from './stats/routes';
import { createRoomsRouter } from './rooms/routes';
import { dbPath } from './db/database';

const app = express();
const http = createServer(app);
const port = process.env.PORT || 8081;

app.enable('trust proxy');
app.use(express.json());

// Redirect to https. Only active when ENFORCE_HTTPS=1; behind a reverse proxy
// (Nginx/Caddy) TLS termination and the 80->443 redirect should be handled by
// the proxy, so this stays off by default to allow IP-only HTTP deploys.
const enforceHttps = process.env.ENFORCE_HTTPS === '1';
app.use((req, res, next) => {
  if (!enforceHttps || req.path.startsWith('/api')) {
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
app.use('/api/avatar', createAvatarRouter());
app.use('/api/stats', createStatsRouter());
app.use('/api/rooms', createRoomsRouter());

const io = new Server(http, {
  path: '/s/',
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.CORS_ORIGIN || 'http://localhost:8081')
      : ['http://localhost:3010', 'http://127.0.0.1:3010'],
    credentials: true,
  },
});
initSocket(io);

app.use(express.static('../client-react/dist'));
app.use(history());

http.listen(port, () => {
  console.log(`Citadels game server listening on http://localhost:${port}`);
  console.log(`Database: ${dbPath}`);
});
