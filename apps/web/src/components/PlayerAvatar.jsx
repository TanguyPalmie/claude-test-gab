import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Resolve an avatar URL to its full src.
 * Handles: blob: URLs, absolute http(s) URLs, and relative /uploads/... paths.
 */
function resolveAvatarSrc(avatarUrl) {
  if (!avatarUrl) return null;
  // blob: URLs (from URL.createObjectURL) and absolute URLs — use as-is
  if (avatarUrl.startsWith('blob:') || avatarUrl.startsWith('http')) {
    return avatarUrl;
  }
  // Relative path (e.g. /uploads/abc.jpg) — prepend API origin
  return `${API_URL}${avatarUrl}`;
}

export default function PlayerAvatar({ nickname, avatarUrl, size = 'md', isConnected = true }) {
  const [imgError, setImgError] = useState(false);

  // Reset error state when avatarUrl changes (e.g. user picks a new file)
  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

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

  const src = resolveAvatarSrc(avatarUrl);
  const showImage = src && !imgError;

  return (
    <div className={cn('relative rounded-full overflow-hidden flex-shrink-0', sizes[size])}>
      {showImage ? (
        <img
          src={src}
          alt={nickname}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
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
