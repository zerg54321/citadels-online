import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App';
import HomeScreen from './components/HomeScreen';
import RoomScreen from './components/game/RoomScreen';
import CardsPreview from './components/CardsPreview';
import StatsScreen from './components/StatsScreen';
import AdminScreen from './components/AdminScreen';
import ObReplayScreen from './components/game/ObReplayScreen';
import AdminObScreen from './components/game/AdminObScreen';
import ReplayListScreen from './components/ReplayListScreen';
import PlayerReplayScreen from './components/PlayerReplayScreen';
import './i18n';
import { useAppStore } from './store';
import { isMobile } from './utils/isMobile';
import './scss/main.scss';

// Restore auth token from localStorage before mounting, then bring the
// singleton socket up right away (fire-and-forget). The socket used to
// connect lazily at the first joinRoom, which left the header SERVER STATUS
// stuck on OFFLINE on every non-room page (home/admin/stats). Connecting at
// startup makes the badge reflect real server reachability; connect errors
// are handled by the socket layer (isConnected stays false).
useAppStore.getState().initAuth().finally(() => {
  useAppStore.getState().connect().catch(() => { /* offline — badge shows it */ });
});
// Restore audio/UX settings (sfx volume / mute) before mounting.
useAppStore.getState().initSettings();

// Tag <body> once so portal-to-body elements (Bootstrap modals, endgame
// overlay) — which render OUTSIDE .game-stage--mobile — can still be styled
// for mobile via a .is-mobile root scope.
if (isMobile) {
  document.body.classList.add('is-mobile');
}

// Data router (createBrowserRouter) is required because RoomScreen uses
// useBlocker for the leave-room confirmation guard; BrowserRouter does not
// support navigation blocking. App is the layout route element (header +
// <Outlet />); child routes render inside the body region.
const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'room/:roomId', element: <RoomScreen /> },
      { path: 'cards', element: <CardsPreview /> },
      { path: 'stats', element: <StatsScreen /> },
      { path: 'admin', element: <AdminScreen /> },
      { path: 'admin/replay/:matchId', element: <ObReplayScreen /> },
      { path: 'admin/ob/:roomId', element: <AdminObScreen /> },
      // Public replay library (first-person replay; god view stays admin-only
      // under /admin/replay/:matchId).
      { path: 'replays', element: <ReplayListScreen /> },
      { path: 'replay/:matchId', element: <PlayerReplayScreen /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
