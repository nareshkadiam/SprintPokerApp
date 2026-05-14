# Sprint Poker App

A planning poker app for sprint meetings with real-time voting, room management, story queue, and facilitator controls.

## Features

- Create and join rooms with a shared code
- Hidden votes until reveal
- Deck selection: Fibonacci, T-shirt sizes, or custom values
- Story queue with title and description
- Participant list with voting status
- Facilitator controls for reveal and reset
- Real-time updates via Socket.io
- Dark mode toggle

## Setup

```bash
cd SprintPokerApp
npm install
npm run dev
```

Open the Vite client at `http://localhost:5173` and the Socket.io server runs at `http://localhost:4000`.

## Notes

This app uses an in-memory server store and is intended as a lightweight demo for planning poker collaboration.
