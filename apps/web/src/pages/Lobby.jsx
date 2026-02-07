import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSocket } from '@/hooks/useSocket';
import PlayerAvatar from '@/components/PlayerAvatar';

export default function Lobby() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { getSocket } = useSocket();

  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [error, setError] = useState('');
  const myPlayerId = sessionStorage.getItem('topten_player_id');
  const isHost = myPlayerId === hostId;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function onRoomState(state) {
      if (!state?.room) return;
      setPlayers(state.players || []);
      setHostId(state.room.hostId);

      if (state.room.status === 'in_game') {
        navigate(`/room/${code}/game`);
      }
    }

    function onPlayerList({ players: p, hostId: h }) {
      setPlayers(p);
      setHostId(h);
    }

    function onNewRound() {
      navigate(`/room/${code}/game`);
    }

    socket.on('room_state', onRoomState);
    socket.on('player_list_update', onPlayerList);
    socket.on('new_round', onNewRound);

    return () => {
      socket.off('room_state', onRoomState);
      socket.off('player_list_update', onPlayerList);
      socket.off('new_round', onNewRound);
    };
  }, [getSocket, code, navigate]);

  function handleStart() {
    const socket = getSocket();
    socket.emit('start_game', null, (res) => {
      if (res.error) setError(res.error);
    });
  }

  const connectedCount = players.filter((p) => p.isConnected).length;

  return (
    <div className="flex-1 flex flex-col items-center p-4 pt-8">
      <div className="w-full max-w-md space-y-6">
        {/* Room header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-primary">Lobby</h1>
          <div className="flex items-center justify-center gap-2">
            <span className="text-muted-foreground">Room Code:</span>
            <span className="font-mono text-2xl font-bold tracking-widest select-all">
              {code}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Share this code with your friends
          </p>
        </div>

        {/* Player list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Players</span>
              <Badge variant="secondary">{connectedCount} online</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50"
              >
                <PlayerAvatar
                  nickname={player.nickname}
                  avatarUrl={player.avatarUrl}
                  size="md"
                  isConnected={player.isConnected}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {player.nickname}
                    {player.id === myPlayerId && (
                      <span className="text-muted-foreground text-sm ml-1">(you)</span>
                    )}
                  </p>
                  {player.id === hostId && (
                    <Badge variant="default" className="text-xs mt-0.5">Host</Badge>
                  )}
                </div>
                {!player.isConnected && (
                  <Badge variant="warning" className="text-xs">Offline</Badge>
                )}
              </div>
            ))}

            {players.length === 0 && (
              <p className="text-muted-foreground text-center py-4">
                Waiting for players...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Start button (host only) */}
        {isHost && (
          <Button
            size="lg"
            className="w-full text-lg"
            onClick={handleStart}
            disabled={connectedCount < 2}
          >
            {connectedCount < 2
              ? 'Need at least 2 players'
              : `Start Game (${connectedCount} players)`}
          </Button>
        )}

        {!isHost && (
          <p className="text-center text-muted-foreground">
            Waiting for the host to start the game...
          </p>
        )}

        {error && (
          <p className="text-center text-destructive font-medium">{error}</p>
        )}
      </div>
    </div>
  );
}
