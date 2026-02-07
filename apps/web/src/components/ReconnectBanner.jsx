import React from 'react';
import { useSocket } from '../hooks/useSocket';

export default function ReconnectBanner() {
  const { connected, reconnecting } = useSocket();

  if (connected && !reconnecting) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-yellow-950 text-center py-2 px-4 text-sm font-medium animate-pulse">
      {reconnecting ? 'Reconnecting...' : 'Connection lost. Trying to reconnect...'}
    </div>
  );
}
