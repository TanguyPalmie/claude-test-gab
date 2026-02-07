import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Home from './pages/Home';
import ProfileGate from './pages/ProfileGate';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import { SocketProvider } from './hooks/useSocket';
import ReconnectBanner from './components/ReconnectBanner';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SocketProvider>
        <ReconnectBanner />
        <div className="min-h-screen flex flex-col">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/join/:code" element={<ProfileGate />} />
            <Route path="/room/:code/lobby" element={<Lobby />} />
            <Route path="/room/:code/game" element={<Game />} />
          </Routes>
        </div>
      </SocketProvider>
    </BrowserRouter>
  </React.StrictMode>
);
