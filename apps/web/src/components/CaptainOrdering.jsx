import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import SortableAnswer from './SortableAnswer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CaptainOrdering({ answers, players, onSubmit }) {
  const [items, setItems] = useState(() =>
    answers.map((a) => ({
      id: a.playerId,
      nickname: a.nickname,
      text: a.text,
      avatarUrl: players.find((p) => p.id === a.playerId)?.avatarUrl,
    }))
  );
  const [confirmed, setConfirmed] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function handleSubmit() {
    if (confirmed) return;
    setConfirmed(true);
    onSubmit(items.map((i) => i.id));
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-center">
          Rank answers from lowest (1) to highest
        </CardTitle>
        <p className="text-sm text-muted-foreground text-center">
          Drag to reorder
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {items.map((item, index) => (
              <SortableAnswer key={item.id} item={item} position={index + 1} />
            ))}
          </SortableContext>
        </DndContext>

        <Button
          size="lg"
          className="w-full mt-4"
          onClick={handleSubmit}
          disabled={confirmed}
        >
          {confirmed ? 'Submitted!' : 'Confirm Order'}
        </Button>
      </CardContent>
    </Card>
  );
}
