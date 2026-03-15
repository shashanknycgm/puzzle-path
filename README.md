# Puzzle Path

A chess coaching iOS app that turns your chess.com blunders into interactive puzzles — complete with AI-generated move insights powered by Claude.

## What It Does

1. **Connect** — Enter your chess.com username
2. **Analyze** — The app fetches your last 14 days of games and finds your biggest mistakes using a two-phase chess engine
3. **Practice** — Get 5 interactive puzzles based on your actual blunders
4. **Learn** — Solve each puzzle and get an AI coaching tip that explains exactly what the best move accomplishes

## Features

- Fetches games from the chess.com public API (no login required)
- **Two-phase engine**: Phase 1 unlocks the board instantly with a fast local evaluator; Phase 2 silently upgrades the analysis using a WebView-hosted Stockfish engine in the background
- **AI coaching insights** — after each puzzle attempt, Claude analyzes the position and explains the correct move in plain English (e.g. "The knight fork on e5 wins a rook and opens the king")
- Hallucination-safe: the board position is parsed into a plain-English piece list before Claude is called, grounding the model to only reference pieces that actually exist on the board
- Interactive chess board — drag and drop moves with legal move highlighting
- Board flips to your perspective (white or black)
- Board coordinates (a–h, 1–8) displayed on the edges
- 3 attempts per puzzle before the solution is revealed
- Tracks solved / failed / skipped progress per session
- All data stored on-device (AsyncStorage)
- Honeycomb telemetry across all key flows (puzzle generation, engine enrichment, AI coach, user attempts)

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | React Native + Expo (SDK 55) |
| Navigation | expo-router |
| Chess logic | chess.js |
| Chess board | WebView + Lichess cburnett pieces |
| Background engine | Stockfish via hidden WebView |
| AI coaching | Claude (Anthropic API) |
| Telemetry | Honeycomb Events API |
| Storage | AsyncStorage |
| Build | EAS Build |

## Running Locally

```bash
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on your iPhone.

Create a `.env` file in the project root with your API keys:

```
EXPO_PUBLIC_CLAUDE_API_KEY=your_claude_api_key
EXPO_PUBLIC_HONEYCOMB_API_KEY=your_honeycomb_key   # optional, telemetry only
```

## Building for TestFlight

```bash
eas build --platform ios --profile preview
```

Upload the resulting `.ipa` to App Store Connect and add yourself as an internal tester.

## Project Structure

```
app/
  index.tsx              # Onboarding (username entry)
  dashboard.tsx          # Stats + generate puzzles
  puzzles/
    index.tsx            # Puzzle list
    [id].tsx             # Interactive puzzle solver + AI insights
components/
  ChessBoard.tsx         # WebView-based chess board with coordinates
  ChessEngineWebView.tsx # Hidden WebView running Stockfish
  StockfishEngine.tsx    # Engine wrapper
services/
  chesscom.ts            # chess.com API client
  puzzleGenerator.ts     # Blunder detection + puzzle extraction
  chessEngineService.ts  # Two-phase engine orchestration
  aiCoach.ts             # Claude API integration for move explanations
  telemetry.ts           # Honeycomb fire-and-forget telemetry helpers
  generationState.ts     # Global puzzle generation state
  storage.ts             # AsyncStorage helpers
```

## How the Two-Phase Engine Works

When a puzzle is opened:

1. **Phase 1 (instant)** — A local material evaluator runs at depth 2 (~100 ms). This unlocks the board immediately so the user can start playing without waiting.
2. **Phase 2 (background)** — A hidden Stockfish WebView runs at depth 5 asynchronously. Once it finishes, the best move and evaluation are silently upgraded. If the user hasn't made an attempt yet, the updated answer is applied to the board; if they're already mid-solve, the upgrade is saved for the next puzzle.

## How AI Insights Work

After each puzzle attempt, the app calls Claude:

1. The current FEN is parsed with chess.js into a plain-English piece list ("White Knight on e5, Black Rook on a8…")
2. Any captures or checks resulting from the move are detected and described
3. Claude receives the piece list, the played move, and the correct move — grounded with the instruction to only reference pieces that appear in the list
4. The response is a 1–2 sentence coaching tip explaining what the correct move accomplishes tactically

This grounding step prevents hallucinations like "attacks your queen on f3" when no queen is on f3.
