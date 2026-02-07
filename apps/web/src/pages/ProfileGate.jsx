import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { uploadAvatar } from '@/lib/api';
import { getClientId } from '@/lib/clientId';
import { useSocket } from '@/hooks/useSocket';
import PlayerAvatar from '@/components/PlayerAvatar';

export default function ProfileGate() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { getSocket } = useSocket();

  const [nickname, setNickname] = useState(
    sessionStorage.getItem('topten_nickname') || ''
  );
  const [avatarUrl, setAvatarUrl] = useState(
    sessionStorage.getItem('topten_avatar') || ''
  );
  const [avatarFile, setAvatarFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2MB');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Only JPG, PNG, or WebP images');
      return;
    }

    setError('');
    setAvatarFile(file);
    setAvatarUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      setError('Nickname must be 2-20 characters');
      return;
    }

    setLoading(true);
    try {
      let finalAvatarUrl = avatarUrl;

      // Upload avatar if a new file was selected
      if (avatarFile) {
        finalAvatarUrl = await uploadAvatar(avatarFile);
      }

      // Save to session storage for reconnection
      sessionStorage.setItem('topten_nickname', trimmed);
      sessionStorage.setItem('topten_avatar', finalAvatarUrl || '');
      sessionStorage.setItem(
        'topten_session',
        JSON.stringify({
          roomCode: code.toUpperCase(),
          nickname: trimmed,
          avatarUrl: finalAvatarUrl || '',
        })
      );

      // Join via socket
      const socket = getSocket();
      socket.emit(
        'join_room',
        {
          code: code.toUpperCase(),
          clientId: getClientId(),
          nickname: trimmed,
          avatarUrl: finalAvatarUrl || '',
        },
        (response) => {
          if (response.error) {
            setError(response.error);
            setLoading(false);
            return;
          }
          sessionStorage.setItem('topten_player_id', response.playerId);
          navigate(`/room/${code.toUpperCase()}/lobby`);
        }
      );
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Join Room</CardTitle>
          <CardDescription className="font-mono text-lg tracking-widest">
            {code?.toUpperCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar */}
            <div className="flex flex-col items-center space-y-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative group"
              >
                <PlayerAvatar
                  nickname={nickname || '?'}
                  avatarUrl={avatarUrl}
                  size="lg"
                />
                <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-white text-xs font-medium">Change</span>
                </div>
              </button>
              <p className="text-xs text-muted-foreground">
                Tap to upload avatar (optional)
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Nickname */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Nickname</label>
              <Input
                placeholder="Your display name"
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 20))}
                maxLength={20}
                autoFocus
              />
            </div>

            {error && (
              <p className="text-destructive text-sm text-center">{error}</p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading || nickname.trim().length < 2}
            >
              {loading ? 'Joining...' : 'Enter Room'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
