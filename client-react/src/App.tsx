import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Preview from './pages/Preview';
import RoomScreen from './components/game/RoomScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/preview" element={<Preview />} />
      <Route path="/room" element={<RoomScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
