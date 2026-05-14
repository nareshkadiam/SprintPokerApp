import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import type { DeckType, Participant, RoomState, StoryItem } from './types';

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin);

const decks: Record<DeckType, string[]> = {
  fibonacci: ['1', '2', '3', '5', '8', '13', '21'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL'],
  custom: [],
};

function clampScore(votes: string[]) {
  const numeric = votes.map((value) => Number(value)).filter((n) => !Number.isNaN(n));
  if (!numeric.length) return null;
  const sum = numeric.reduce((acc, value) => acc + value, 0);
  const average = sum / numeric.length;
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  return { average, min, max, spread: max - min };
}

function formatRoomCode(roomId: string) {
  return roomId.toUpperCase().slice(0, 6);
}

const initialRoomState: RoomState = {
  roomId: '',
  facilitatorId: '',
  participants: [],
  deckType: 'fibonacci',
  deck: decks.fibonacci,
  customDeck: '',
  stories: [],
  currentStoryId: undefined,
  showVotes: false,
  autoReveal: false,
};

export default function App() {
  const [socket, setSocket] = useState<ReturnType<typeof io> | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [authMode, setAuthMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [storyTitle, setStoryTitle] = useState('');
  const [storyDesc, setStoryDesc] = useState('');
  const [customDeck, setCustomDeck] = useState('1,2,3,5,8,13');
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const currentStory = useMemo(() => {
    if (!room || !room.currentStoryId) return null;
    return room.stories.find((story) => story.id === room.currentStoryId) || null;
  }, [room]);

  const isFacilitator = useMemo(() => {
    if (!room || !socket) return false;
    return room.facilitatorId === socket.id;
  }, [room, socket]);

  const participant = useMemo(() => {
    if (!room || !socket) return undefined;
    return room.participants.find((p) => p.id === socket.id);
  }, [room, socket]);

  const voteResults = useMemo(() => {
    if (!currentStory || !room) return null;
    const allVotes = room.participants.filter((p) => !!p.vote && !p.isSpectator).map((p) => p.vote!);
    return clampScore(allVotes);
  }, [currentStory, room]);

  useEffect(() => {
    const socketClient = io(SERVER_URL, { transports: ['websocket'], autoConnect: true });
    setSocket(socketClient);

    socketClient.on('roomUpdate', (payload: RoomState) => {
      setRoom(payload);
      const currentParticipant = payload.participants.find((p) => p.id === socketClient.id);
      if (currentParticipant && !currentParticipant.vote) {
        setSelectedVote(null);
      }
    });

    socketClient.on('errorMessage', (message: string) => {
      alert(message);
    });

    return () => {
      socketClient.disconnect();
    };
  }, []);

  const send = (event: string, data: unknown, callback?: (response: any) => void) => {
    if (!socket) return;
    socket.emit(event, data, callback);
  };

  const handleCreateRoom = () => {
    if (!name.trim() || !socket) return;
    send('createRoom', { name }, (response: { room: RoomState }) => {
      setRoom(response.room);
      setRoomCode(response.room.roomId);
    });
  };

  const handleJoinRoom = () => {
    if (!name.trim() || !roomCode.trim() || !socket) return;
    send('joinRoom', { roomId: roomCode.trim(), name }, (response: { room: RoomState }) => {
      setRoom(response.room);
    });
  };

  const handleSelectDeckType = (deckType: DeckType) => {
    setSelectedVote(null);
    send('changeDeck', { deckType, customDeck: deckType === 'custom' ? customDeck : undefined });
  };

  const handleAddStory = () => {
    if (!storyTitle.trim() || !socket) return;
    send('addStory', { title: storyTitle.trim(), description: storyDesc.trim() }, () => {
      setStoryTitle('');
      setStoryDesc('');
    });
  };

  const handleChooseStory = (storyId: string) => {
    send('selectStory', { storyId });
  };

  const handleVote = (value: string) => {
    if (!socket || !currentStory || room?.showVotes) return;
    setSelectedVote(value);
    send('castVote', { storyId: currentStory.id, vote: value });
  };

  const handleReveal = () => {
    send('revealVotes', {});
  };

  const handleReset = () => {
    setSelectedVote(null);
    send('resetVotes', {});
  };

  const handleToggleAutoReveal = () => {
    if (!room) return;
    send('setAutoReveal', { autoReveal: !room.autoReveal });
  };

  const handleSelectDeck = () => {
    send('changeDeck', { deckType: 'custom', customDeck });
  };

  const formatStatus = (participant: Participant) => {
    if (participant.isSpectator) return 'Spectator';
    if (participant.vote) return 'Voted';
    return 'Waiting';
  };

  if (!room) {
    return (
      <div className={`app-shell ${isDarkMode ? 'dark' : ''}`}>
        <header>
          <div>
            <h1>Sprint Poker</h1>
            <p>Real-time planning poker for sprint meetings.</p>
          </div>
          <button className="ghost" onClick={() => setIsDarkMode((current) => !current)}>
            {isDarkMode ? 'Light mode' : 'Dark mode'}
          </button>
        </header>
        <section className="panel auth-panel">
          <div className="auth-mode">
            <label>
              <input
                type="radio"
                name="authMode"
                value="create"
                checked={authMode === 'create'}
                onChange={() => setAuthMode('create')}
              />
              Create room
            </label>
            <label>
              <input
                type="radio"
                name="authMode"
                value="join"
                checked={authMode === 'join'}
                onChange={() => setAuthMode('join')}
              />
              Join room
            </label>
          </div>
          <div className="auth-inputs">
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name" />
            </label>
            {authMode === 'join' && (
              <label>
                Room code
                <input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="ABC123" />
              </label>
            )}
          </div>
          <div className="button-row">
            {authMode === 'create' && (
              <button onClick={handleCreateRoom} disabled={!name.trim()}>
                Create room
              </button>
            )}
            {authMode === 'join' && (
              <button onClick={handleJoinRoom} disabled={!name.trim() || !roomCode.trim()}>
                Join room
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`app-shell ${isDarkMode ? 'dark' : ''}`}>
      <header>
        <div>
          <h1>Sprint Poker</h1>
          <p>Room {formatRoomCode(room.roomId)}</p>
        </div>
        <button className="ghost" onClick={() => setIsDarkMode((current) => !current)}>
          {isDarkMode ? 'Light mode' : 'Dark mode'}
        </button>
      </header>

      <main>
        <section className="panel room-panel">
          <div className="room-meta">
            <div>
              <strong>Facilitator:</strong> {room.participants.find((p) => p.id === room.facilitatorId)?.name || 'Unknown'}
            </div>
            <div>
              <strong>Auto reveal:</strong> {room.autoReveal ? 'On' : 'Off'}
            </div>
          </div>
          <div className="split-grid">
            <div>
              <h2>Deck selection</h2>
              <div className="deck-options">
                {(['fibonacci', 'tshirt', 'custom'] as DeckType[]).map((type) => (
                  <button
                    key={type}
                    className={room.deckType === type ? 'active' : ''}
                    onClick={() => handleSelectDeckType(type)}
                  >
                    {type === 'fibonacci' ? 'Fibonacci' : type === 'tshirt' ? 'T-shirt' : 'Custom'}
                  </button>
                ))}
              </div>
              {room.deckType === 'custom' ? (
                <div className="custom-deck">
                  <input
                    value={customDeck}
                    onChange={(e) => setCustomDeck(e.target.value)}
                    placeholder="1,2,3,5,8"
                  />
                  <button onClick={handleSelectDeck}>Save custom deck</button>
                </div>
              ) : null}
              <div className="deck-preview">
                {room.deck.length > 0 ? room.deck.map((value) => (
                  <span key={value} className="chip">{value}</span>
                )) : <em>Choose a deck to begin.</em>}
              </div>
            </div>

            {isFacilitator && (
              <div>
                <h2>Add story</h2>
                <label>
                  Title
                  <input value={storyTitle} onChange={(e) => setStoryTitle(e.target.value)} placeholder="User story title" />
                </label>
                <label>
                  Description
                  <textarea value={storyDesc} onChange={(e) => setStoryDesc(e.target.value)} placeholder="Short description" rows={3} />
                </label>
                <button onClick={handleAddStory} disabled={!storyTitle.trim()}>Add story</button>
              </div>
            )}
          </div>
        </section>

        <section className="panel status-panel">
          <div className="panel-header">
            <h2>Participants</h2>
            <span>{room.participants.length} present</span>
          </div>
          <ul className="participant-list">
            {room.participants.map((participant) => (
              <li key={participant.id} className={participant.isFacilitator ? 'facilitator' : ''}>
                <span>{participant.name}</span>
                <strong>{participant.isFacilitator ? 'Facilitator' : participant.isSpectator ? 'Spectator' : formatStatus(participant)}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel queue-panel">
          <div className="panel-header">
            <h2>Story queue</h2>
            <span>{room.stories.length} stories</span>
          </div>
          {room.stories.length === 0 ? (
            <p className="empty-state">No stories yet. Add a user story to start estimating.</p>
          ) : (
            <ul className="story-queue">
              {room.stories.map((story) => (
                <li
                  key={story.id}
                  className={story.id === room.currentStoryId ? 'active' : ''}
                  onClick={() => handleChooseStory(story.id)}
                >
                  <div>
                    <strong>{story.title}</strong>
                    <span>{story.description}</span>
                  </div>
                  <div className="story-meta">
                    <span>{story.estimate ? `Final: ${story.estimate}` : story.scored ? 'Scored' : 'Pending'}</span>
                    <small>{new Date(story.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel vote-panel">
          <div className="panel-header">
            <h2>{currentStory ? currentStory.title : 'Select a story to estimate'}</h2>
            <div className="control-row">
              {isFacilitator && (
                <>
                  <button onClick={handleReveal} disabled={!currentStory || room.showVotes}>Reveal votes</button>
                  <button onClick={handleReset} disabled={!currentStory}>Reset votes</button>
                </>
              )}
              <button onClick={handleToggleAutoReveal} className="ghost">
                Auto reveal: {room.autoReveal ? 'On' : 'Off'}
              </button>
            </div>
          </div>
          {currentStory ? (
            <>
              <p className="story-desc">{currentStory.description}</p>
              <div className="voting-grid">
                {room.deck.map((value) => (
                  <button
                    key={value}
                    className={selectedVote === value ? 'selected' : ''}
                    disabled={room.showVotes}
                    onClick={() => handleVote(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="reveal-banner">
                {room.showVotes ? 'Votes revealed - voting is now locked' : 'Votes are hidden until reveal.'}
              </div>
            </>
          ) : (
            <p className="empty-state">Pick a story from the queue to start voting.</p>
          )}
        </section>

        {currentStory && (
          <section className="panel results-panel">
            <div className="panel-header">
              <h2>Results</h2>
              <span>{room.showVotes ? 'Revealed' : 'Pending'}</span>
            </div>
            <div className="results-grid">
              <div>
                <strong>Votes</strong>
                <ul className="vote-list">
                  {room.participants.map((participant) => (
                    <li key={participant.id} className={participant.vote ? 'has-vote' : ''}>
                      <span>{participant.name}</span>
                      <strong>{room.showVotes || participant.id === socket?.id ? participant.vote ?? '—' : 'Hidden'}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Summary</strong>
                {room.showVotes ? (
                  <>
                    <div className="summary-row">
                      <span>Average</span>
                      <strong>{voteResults?.average ? voteResults.average.toFixed(1) : '—'}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Range</span>
                      <strong>{voteResults ? `${voteResults.min} - ${voteResults.max}` : '—'}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Disagreement</span>
                      <strong>{voteResults ? (voteResults.spread > 3 ? 'High' : 'Low') : '—'}</strong>
                    </div>
                  </>
                ) : (
                  <p className="empty-state">Summary will appear after reveal.</p>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer>
        <p>Created for sprint planning with live voting, story queue, and facilitator controls.</p>
      </footer>
    </div>
  );
}
