# Product Ideas (Backlog)

## Weakness-Targeted Puzzles via Lichess (Future Direction)

**Core idea:** Instead of replaying the user's actual games, classify their blunders by tactical theme (fork, pin, skewer, discovered attack, back-rank mate, etc.) and serve curated Lichess puzzles that train exactly those weaknesses.

**Why it's compelling:**
- Lichess has 4M+ human-verified, engine-tested puzzles with theme tags
- Better training signal — positions are pedagogically clean, not messy mid-game chaos
- Unlimited practice: retake the same theme drill across multiple sessions
- Proven model: Chess.com's "Lessons" and Lichess's own puzzle storm work this way

**How it would work:**
1. Analyze user's recent games to detect their most common blunder type (existing logic already finds eval drops ≥ 200cp)
2. Classify each blunder position by tactical motif using chess.js pattern matching or the engine's PV line
3. Query `lichess.org/api/puzzle/batch?themes=fork,pin&difficulty=...` for matching puzzles
4. Replace (or supplement) the 5 generated puzzles with curated Lichess puzzles targeting the detected weakness

**Recommended hybrid approach:**
- Puzzle 1: Their actual game blunder (emotional hook — "this was your game!")
- Puzzles 2–5: Lichess-curated puzzles on the detected weakness theme

**Lichess Puzzle API:**
- `GET https://lichess.org/api/puzzle/batch?themes=fork&nb=5` — returns rated puzzles by theme
- `GET https://lichess.org/api/puzzle/{id}` — single puzzle by ID
- No auth required for reads; rate limit is generous

**Engine improvement angle (related):**
- `GET https://lichess.org/api/cloud-eval?fen={fen}&multiPv=1` — free Stockfish depth-20+ cloud eval
- Could replace the local material evaluator for blunder detection with near-perfect accuracy
- No API key needed, ~50 req/s rate limit
