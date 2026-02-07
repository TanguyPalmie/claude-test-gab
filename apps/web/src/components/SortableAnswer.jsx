import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PlayerAvatar from './PlayerAvatar';

export default function SortableAnswer({ item, position }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-3 p-3 rounded-lg border-2 bg-white touch-none select-none ${
        isDragging
          ? 'border-primary shadow-lg scale-[1.02]'
          : 'border-border hover:border-primary/50'
      }`}
    >
      {/* Position number */}
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm flex-shrink-0">
        {position}
      </div>

      <PlayerAvatar
        nickname={item.nickname}
        avatarUrl={item.avatarUrl}
        size="sm"
      />

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{item.nickname}</p>
        <p className="text-sm text-muted-foreground truncate">{item.text}</p>
      </div>

      {/* Drag handle indicator */}
      <div className="flex flex-col gap-0.5 flex-shrink-0 text-muted-foreground">
        <div className="w-4 h-0.5 bg-current rounded" />
        <div className="w-4 h-0.5 bg-current rounded" />
        <div className="w-4 h-0.5 bg-current rounded" />
      </div>
    </div>
  );
}
