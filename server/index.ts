import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

interface Participant {
  id: string;
  name: string;
  isFacilitator: boolean;
  isSpectator: boolean;
  vote?: string;
  active: boolean;
}

interface StoryItem {
  id: string;
  title: string;
  description: string;
  estimate?: string;
  votes: Record<string, string>;
  createdAt: string;
}

interface RoomState {
  roomId: string;
  facilitatorId: string;
  participants: Participant[];
  deckType: 'fibonacci' | 'tshirt' | 'custom';
  deck: string[];
  customDeck: string;
  stories: StoryItem[];
  currentStoryId?: string;
  showVotes: boolean;
  autoReveal: boolean;
  lastRevealAt?: string;
}

const decks = {
  fibonacci: ['1', '2', '3', '5', '8', '13', '21'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL'],
};

const rooms = new Map<string, RoomState>();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const createRoomState = (roomId: string, name: string): RoomState => ({
  roomId,
  facilitatorId: '',
  participants: [],
  deckType: 'fibonacci',
  deck: decks.fibonacci,
  customDeck: '',
  stories: [],
  currentStoryId: undefined,
  showVotes: false,
  autoReveal: false,
});

const broadcastRoom = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('roomUpdate', room);
};

const normalizeDeck = (room: RoomState) => {
  if (room.deckType === 'custom') {
    const values = room.customDeck
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    room.deck = values.length ? values : ['1', '2', '3', '5', '8'];
  } else {
    room.deck = decks[room.deckType];
  }
};

const updateVoteState = (room: RoomState, socketId: string, vote: string) => {
  const participant = room.participants.find((entry) => entry.id === socketId);
  if (participant) participant.vote = vote;
  const allVoted = room.participants.filter((p) => !p.isSpectator).every((p) => !!p.vote);
  if (allVoted && room.autoReveal) {
    room.showVotes = true;
    room.lastRevealAt = new Date().toISOString();
  }
};

const resetVotes = (room: RoomState) => {
  room.participants.forEach((participant) => {
    participant.vote = undefined;
  });
  room.showVotes = false;
};

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name }, callback) => {
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    const room = createRoomState(roomId, name);
    room.facilitatorId = socket.id;
    room.participants.push({
      id: socket.id,
      name,
      isFacilitator: true,
      isSpectator: false,
      active: true,
    });
    rooms.set(roomId, room);
    socket.join(roomId);
    callback({ room });
  });

  socket.on('joinRoom', ({ roomId, name }, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      callback({ error: 'Room not found.' });
      return;
    }

    if (room.participants.some((participant) => participant.name === name)) {
      callback({ error: 'Name already taken in this room.' });
      return;
    }

    room.participants.push({
      id: socket.id,
      name,
      isFacilitator: false,
      isSpectator: false,
      active: true,
    });
    socket.join(roomId);
    broadcastRoom(roomId);
    callback({ room });
  });

  socket.on('changeDeck', ({ deckType, customDeck }, callback) => {
    const roomId = Array.from(socket.rooms).find((id) => id !== socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.deckType = deckType;
    if (customDeck !== undefined) room.customDeck = customDeck;
    normalizeDeck(room);
    broadcastRoom(roomId);
    callback?.(null);
  });

  socket.on('addStory', ({ title, description }, callback) => {
    const roomId = Array.from(socket.rooms).find((id) => id !== socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const story: StoryItem = {
      id: Math.random().toString(36).slice(2, 10),
      title,
      description,
      votes: {},
      createdAt: new Date().toISOString(),
    };
    room.stories.push(story);
    if (!room.currentStoryId) room.currentStoryId = story.id;
    broadcastRoom(roomId);
    callback?.(null);
  });

  socket.on('selectStory', ({ storyId }, callback) => {
    const roomId = Array.from(socket.rooms).find((id) => id !== socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.currentStoryId = storyId;
    room.showVotes = false;
    broadcastRoom(roomId);
    callback?.(null);
  });

  socket.on('castVote', ({ storyId, vote }, callback) => {
    const roomId = Array.from(socket.rooms).find((id) => id !== socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || room.currentStoryId !== storyId || room.showVotes) return;
    updateVoteState(room, socket.id, vote);
    broadcastRoom(roomId);
    callback?.(null);
  });

  socket.on('revealVotes', () => {
    const roomId = Array.from(socket.rooms).find((id) => id !== socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room || !room.currentStoryId) return;
    room.showVotes = true;
    room.lastRevealAt = new Date().toISOString();
    const currentStory = room.stories.find(s => s.id === room.currentStoryId);
    if (currentStory) {
      currentStory.scored = true;
    }
    broadcastRoom(roomId);
  });

  socket.on('resetVotes', () => {
    const roomId = Array.from(socket.rooms).find((id) => id !== socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    resetVotes(room);
    broadcastRoom(roomId);
  });

  socket.on('setAutoReveal', ({ autoReveal }) => {
    const roomId = Array.from(socket.rooms).find((id) => id !== socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.autoReveal = autoReveal;
    broadcastRoom(roomId);
  });

  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const index = room.participants.findIndex((participant) => participant.id === socket.id);
      if (index !== -1) {
        room.participants.splice(index, 1);
        if (room.facilitatorId === socket.id) {
          const nextFacilitator = room.participants[0];
          room.facilitatorId = nextFacilitator?.id || '';
          if (nextFacilitator) nextFacilitator.isFacilitator = true;
        }
        broadcastRoom(room.roomId);
      }
    }
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
httpServer.listen(PORT, () => {
  console.log(`Sprint Poker server listening on http://localhost:${PORT}`);
});
