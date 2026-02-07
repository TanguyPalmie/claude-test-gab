import React from 'react';
import { cn } from '@/lib/utils';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function PlayerAvatar({ nickname, avatarUrl, size = 'md', isConnected = true }) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-lg',
  };

  const initials = (nickname || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const src = avatarUrl
    ? avatarUrl.startsWith('http')
      ? avatarUrl
      : `${API_URL}${avatarUrl}`
    : null;

  return (
    <div className={cn('relative rounded-full overflow-hidden flex-shrink-0', sizes[size])}>
      {src ? (
        <img
          src={src}
          alt={nickname}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-primary/20 text-primary flex items-center justify-center font-bold">
          {initials}
        </div>
      )}
      {!isConnected && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="w-2 h-2 bg-yellow-400 rounded-full" />
        </div>
      )}
    </div>
  );
}
