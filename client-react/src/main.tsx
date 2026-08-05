import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App';
import HomeScreen from './components/HomeScreen';
import RoomScreen from './components/game/RoomScreen';
import CardsPreview from './components/CardsPreview';
import StatsScreen from './components/StatsScreen';
import AdminScreen from './components/AdminScreen';
import './i18n';
import { useAppStore } from './store';
import { isMobile } from './utils/isMobile';
import './scss/main.scss';

// Restore auth token from localStorage before mounting.
useAppStore.getState().initAuth();

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
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
