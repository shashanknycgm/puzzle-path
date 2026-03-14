# Puzzle Path

A chess coaching iOS app that turns your chess.com blunders into interactive puzzles.

## What It Does

1. **Connect** — Enter your chess.com username
2. **Analyze** — The app fetches your last 14 days of games and finds your biggest mistakes
3. **Practice** — Get 5 interactive puzzles based on your actual blunders
4. **Learn** — Solve each puzzle, see the correct move highlighted on the board

## Features

- Fetches games from the chess.com public API (no login required)
- Identifies blunders using a local material evaluator (no server costs)
- Interactive chess board with legal move hints
- Board flips to your perspective (white or black)
- 3 attempts per puzzle before the solution is revealed
- Tracks solved / failed / skipped progress per session
- All data stored on-device (AsyncStorage)

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | React Native + Expo (SDK 55) |
| Navigation | expo-router |
| Chess logic | chess.js |
| Chess board | WebView + Lichess cburnett pieces |
| Storage | AsyncStorage |
| Build | EAS Build |

## Running Locally

```bash
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on your iPhone.

## Building for TestFlight

```bash
eas build --platform ios --profile preview
```

Upload the resulting `.ipa` to App Store Connect and add yourself as an internal tester.

## Project Structure

```
app/
  index.tsx          # Onboarding (username entry)
  dashboard.tsx      # Stats + generate puzzles
  puzzles/
    index.tsx        # Puzzle list
    [id].tsx         # Interactive puzzle solver
components/
  ChessBoard.tsx     # WebView-based chess board
services/
  chesscom.ts        # chess.com API client
  puzzleGenerator.ts # Blunder detection + puzzle extraction
  storage.ts         # AsyncStorage helpers
```
