import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '@/hooks/useSocket';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import PlayerAvatar from '@/components/PlayerAvatar';
import CaptainOrdering from '@/components/CaptainOrdering';

export default function Game() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { getSocket } = useSocket();

  const myPlayerId = sessionStorage.getItem('topten_player_id');

  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(null);
  const [secretNumber, setSecretNumber] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [revealData, setRevealData] = useState(null);
  const [gameOver, setGameOver] = useState(null);

  const [answerText, setAnswerText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const isCaptain = round?.captainPlayerId === myPlayerId;
  const isHost = myPlayerId === hostId;

  const handleRoomState = useCallback((state) => {
    if (!state?.room) return;
    setPlayers(state.players || []);
    setHostId(state.room.hostId);
    setScore(state.room.score ?? 0);

    if (state.room.status === 'lobby') {
      navigate(`/room/${code}/lobby`);
      return;
    }

    if (state.room.status === 'finished') {
      setGameOver({
        reason: 'reconnected_finished',
        roundsPlayed: state.room.roundIndex + 1,
        finalScore: state.room.score ?? 0,
      });
      return;
    }

    if (state.currentRound) {
      setRound(state.currentRound);

      if (state.answers?.length > 0) {
        const myAnswer = state.answers.find((a) => a.playerId === myPlayerId);
        if (myAnswer?.text) setSubmitted(true);
        if (myAnswer?.secretNumber) setSecretNumber(myAnswer.secretNumber);
      }

      if (state.currentRound.state === 'ordering' && state.answers) {
        setAnswers(
          state.answers.map((a) => {
            const p = state.players.find((pl) => pl.id === a.playerId);
            return { playerId: a.playerId, nickname: p?.nickname || '?', text: a.text };
          })
        );
      }

      if (state.currentRound.state === 'reveal' && state.ordering) {
        setRevealData({
          captainOrder: state.ordering.orderedPlayerIds,
          errorCount: state.ordering.errorCount,
          answers: state.answers.map((a) => {
            const p = state.players.find((pl) => pl.id === a.playerId);
            return {
              playerId: a.playerId,
              nickname: p?.nickname || '?',
              secretNumber: a.secretNumber,
              text: a.text,
            };
          }),
          score: state.room.score ?? 0,
        });
      }
    }
  }, [code, myPlayerId, navigate]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('room_state', handleRoomState);

    socket.on('player_list_update', ({ players: p, hostId: h }) => {
      setPlayers(p);
      setHostId(h);
    });

    socket.on('new_round', (data) => {
      setRound(data);
      setSecretNumber(null);
      setAnswerText('');
      setSubmitted(false);
      setAnswers([]);
      setRevealData(null);
      setError('');
    });

    socket.on('your_secret_number', ({ secretNumber: num }) => {
      setSecretNumber(num);
    });

    socket.on('all_answers_collected', (data) => {
      setRound((prev) => (prev ? { ...prev, state: 'ordering' } : prev));
      setAnswers(data.answers);
    });

    socket.on('reveal_results', (data) => {
      setRound((prev) => (prev ? { ...prev, state: 'reveal' } : prev));
      setRevealData(data);
      if (data.score !== undefined) setScore(data.score);
    });

    socket.on('score_update', ({ score: s }) => setScore(s));

    socket.on('game_finished', (data) => setGameOver(data));

    return () => {
      socket.off('room_state', handleRoomState);
      socket.off('player_list_update');
      socket.off('new_round');
      socket.off('your_secret_number');
      socket.off('all_answers_collected');
      socket.off('reveal_results');
      socket.off('score_update');
      socket.off('game_finished');
    };
  }, [getSocket, handleRoomState]);

  function submitAnswer(e) {
    e.preventDefault();
    if (!answerText.trim()) return;
    const socket = getSocket();
    socket.emit('submit_answer', { text: answerText.trim() }, (res) => {
      if (res.error) {
        setError(res.error);
      } else {
        setSubmitted(true);
      }
    });
  }

  function handleNextRound() {
    const socket = getSocket();
    socket.emit('next_round', null, (res) => {
      if (res.error) setError(res.error);
    });
  }

  // ── GAME OVER ──────────────────────────────────
  if (gameOver) {
    const reasonText = {
      no_questions: 'All questions have been answered!',
      not_enough_players: 'Not enough players connected.',
      reconnected_finished: 'This game has ended.',
    };

    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-3xl">Game Over</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-lg text-muted-foreground">
              {reasonText[gameOver.reason] || 'Game ended'}
            </p>
            <div className="flex justify-center gap-6">
              <div>
                <p className="text-3xl font-bold text-primary">{gameOver.roundsPlayed}</p>
                <p className="text-sm text-muted-foreground">Rounds</p>
              </div>
              <div>
                <p className={`text-3xl font-bold ${(gameOver.finalScore ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {(gameOver.finalScore ?? 0) >= 0 ? '+' : ''}{gameOver.finalScore ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">Final Score</p>
              </div>
            </div>
            <Button
              size="lg"
              className="w-full mt-4"
              onClick={() => {
                sessionStorage.removeItem('topten_session');
                navigate('/');
              }}
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── LOADING / NO ROUND ─────────────────────────
  if (!round) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-muted-foreground text-lg">Loading game...</p>
      </div>
    );
  }

  const captainPlayer = players.find((p) => p.id === round.captainPlayerId);

  return (
    <div className="flex-1 flex flex-col p-4 pt-6 max-w-lg mx-auto w-full">
      {/* Status bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-sm">
            Round {(round.roundIndex ?? 0) + 1}
          </Badge>
          <Badge variant="outline" className="text-sm capitalize">
            {round.category}
          </Badge>
        </div>
        <div className={`text-lg font-bold ${score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {score >= 0 ? '+' : ''}{score} pts
        </div>
      </div>

      {/* Captain info */}
      <div className="flex items-center gap-2 mb-4 bg-muted/50 rounded-lg p-3">
        <PlayerAvatar
          nickname={captainPlayer?.nickname || '?'}
          avatarUrl={captainPlayer?.avatarUrl}
          size="sm"
        />
        <span className="text-sm">
          <strong>{captainPlayer?.nickname}</strong> is the Captain
          {isCaptain && <span className="text-primary ml-1">(you!)</span>}
        </span>
      </div>

      {/* Question */}
      <Card className="mb-4 border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-lg font-semibold text-center leading-relaxed">
            {round.questionText}
          </p>
        </CardContent>
      </Card>

      {/* ── COLLECTING PHASE ──────────────────────── */}
      {round.state === 'collecting' && (
        <>
          {isCaptain ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground text-lg">
                  You are the Captain this round.
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Wait for all players to submit their answers...
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-4 space-y-4">
                {secretNumber && (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Your secret number</p>
                    <p className="text-5xl font-extrabold text-primary">{secretNumber}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      1 = lowest, 10 = highest
                    </p>
                  </div>
                )}

                {!submitted ? (
                  <form onSubmit={submitAnswer} className="space-y-3">
                    <Input
                      placeholder="Type your answer..."
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value.slice(0, 200))}
                      maxLength={200}
                      autoFocus
                    />
                    <Button type="submit" className="w-full" disabled={!answerText.trim()}>
                      Submit Answer
                    </Button>
                  </form>
                ) : (
                  <div className="text-center py-4">
                    <Badge variant="success" className="text-sm">Answer submitted</Badge>
                    <p className="text-sm text-muted-foreground mt-2">
                      Waiting for other players...
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── ORDERING PHASE (Captain) ──────────────── */}
      {round.state === 'ordering' && (
        <>
          {isCaptain ? (
            <CaptainOrdering
              answers={answers}
              players={players}
              onSubmit={(orderedIds) => {
                const socket = getSocket();
                socket.emit('submit_ordering', { orderedPlayerIds: orderedIds }, (res) => {
                  if (res.error) setError(res.error);
                });
              }}
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground">
                  The Captain is ranking the answers...
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── REVEAL PHASE ──────────────────────────── */}
      {round.state === 'reveal' && revealData && (
        <div className="space-y-4">
          {/* Round score summary */}
          <Card className={revealData.errorCount === 0 ? 'border-green-500' : 'border-border'}>
            <CardContent className="p-4 text-center space-y-1">
              {revealData.errorCount === 0 ? (
                <p className="text-xl font-bold text-green-600">Perfect round!</p>
              ) : (
                <p className="text-xl font-bold">
                  {revealData.correctCount ?? (revealData.answers?.length - revealData.errorCount)} correct,{' '}
                  {revealData.errorCount} wrong
                </p>
              )}
              <p className={`text-lg font-semibold ${(revealData.roundPoints ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(revealData.roundPoints ?? 0) >= 0 ? '+' : ''}{revealData.roundPoints ?? 0} points this round
              </p>
            </CardContent>
          </Card>

          {/* Reveal table */}
          <Card>
            <CardContent className="p-4 space-y-2">
              {[...revealData.answers]
                .sort((a, b) => a.secretNumber - b.secretNumber)
                .map((answer, idx) => {
                  const captainPos = revealData.captainOrder?.indexOf(answer.playerId);
                  // correctOrder is the sorted-by-number order; check position match
                  const correctOrder = [...revealData.answers]
                    .sort((a2, b2) => a2.secretNumber - b2.secretNumber)
                    .map((a2) => a2.playerId);
                  const isCorrectPos = captainPos === correctOrder.indexOf(answer.playerId);

                  return (
                    <div
                      key={answer.playerId}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        isCorrectPos ? 'bg-green-50' : 'bg-red-50'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                        {answer.secretNumber}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{answer.nickname}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {answer.text}
                        </p>
                      </div>
                      {captainPos !== undefined && captainPos !== -1 && (
                        <Badge variant={isCorrectPos ? 'success' : 'destructive'} className="text-xs">
                          #{captainPos + 1}
                        </Badge>
                      )}
                    </div>
                  );
                })}
            </CardContent>
          </Card>

          {/* Next round button (host only) */}
          {isHost && (
            <Button size="lg" className="w-full" onClick={handleNextRound}>
              Next Round
            </Button>
          )}
        </div>
      )}

      {error && (
        <p className="text-center text-destructive font-medium mt-4">{error}</p>
      )}
    </div>
  );
}
