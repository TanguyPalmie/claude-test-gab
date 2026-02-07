import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createRoom, joinRoom, fetchCategories } from '@/lib/api';
import { getClientId } from '@/lib/clientId';

export default function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [availableCategories, setAvailableCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);

  useEffect(() => {
    fetchCategories()
      .then((data) => setAvailableCategories(data.categories || []))
      .catch(() => {});
  }, []);

  function toggleCategory(cat) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function handleCreate() {
    setError('');
    setLoading(true);
    try {
      const room = await createRoom(selectedCategories);
      navigate(`/join/${room.code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    setError('');
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed.length !== 6) {
      setError('Enter a valid 6-character room code');
      return;
    }
    setLoading(true);
    try {
      await joinRoom(trimmed, getClientId());
      navigate(`/join/${trimmed}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Title */}
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-extrabold tracking-tight text-primary">
            TOP TEN
          </h1>
          <p className="text-muted-foreground text-lg">
            A cooperative ranking party game
          </p>
        </div>

        {/* Create Room */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Create a Room</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Category selection */}
            {availableCategories.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Choose themes {selectedCategories.length === 0 && '(all by default)'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableCategories.map((cat) => {
                    const isSelected = selectedCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-colors capitalize ${
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-foreground hover:border-primary/50'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              size="lg"
              className="w-full text-lg"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? 'Creating...' : 'New Game'}
            </Button>
          </CardContent>
        </Card>

        {/* Join Room */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Join a Room</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="space-y-3">
              <Input
                placeholder="Enter room code (e.g. K7P4Q2)"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                maxLength={6}
                className="text-center text-xl font-mono tracking-[0.3em] uppercase"
                autoComplete="off"
              />
              <Button
                type="submit"
                size="lg"
                variant="outline"
                className="w-full text-lg"
                disabled={loading}
              >
                Join Game
              </Button>
            </form>
          </CardContent>
        </Card>

        {error && (
          <p className="text-center text-destructive font-medium">{error}</p>
        )}
      </div>
    </div>
  );
}
