export type DeckType = 'fibonacci' | 'tshirt' | 'custom';

export interface Participant {
  id: string;
  name: string;
  isFacilitator: boolean;
  isSpectator: boolean;
  vote?: string;
  active: boolean;
}

export interface StoryItem {
  id: string;
  title: string;
  description: string;
  estimate?: string;
  votes: Record<string, string>;
  createdAt: string;
  scored?: boolean;
}

export interface RoomState {
  roomId: string;
  facilitatorId: string;
  participants: Participant[];
  deckType: DeckType;
  deck: string[];
  customDeck: string;
  stories: StoryItem[];
  currentStoryId?: string;
  showVotes: boolean;
  autoReveal: boolean;
  lastRevealAt?: string;
}
