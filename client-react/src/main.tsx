import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import App from './App';
import HomeScreen from './components/HomeScreen';
import RoomScreen from './components/game/RoomScreen';
import CardsPreview from './components/CardsPreview';
import StatsScreen from './components/StatsScreen';
import './i18n';
import { useAppStore } from './store';
import './scss/main.scss';

// Restore auth token from localStorage before mounting.
useAppStore.getState().initAuth();

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
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
