import { Chess } from 'chess.js';
import type { Move } from 'chess.js';
import type { ChessComGame } from './chesscom';
import type { Puzzle } from './storage';

// Minimum eval drop (centipawns) to count as a blunder worth making a puzzle
const BLUNDER_THRESHOLD = 150;

// Standard piece values in centipawns
const PIECE_VALUES: Record<string, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 0,
};

export interface PositionEval {
  fen: string;
  bestMove: string; // UCI format e.g. "e2e4"
  score: number;    // centipawns from white's perspective
}

/**
 * Fast local evaluation using 1-ply material search.
 * Finds the move that maximizes material gain (captures + positional hints).
 * Runs synchronously in JS — no network or WASM needed.
 */
export function localEvaluate(fen: string): PositionEval {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });

  if (moves.length === 0) {
    const score = chess.isCheckmate() ? (chess.turn() === 'w' ? -30000 : 30000) : 0;
    return { fen, bestMove: '', score };
  }

  const isWhiteTurn = chess.turn() === 'w';
  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    chess.move(move);

    // 1-ply: score = our material - their material after this move
    let score = 0;
    const board = chess.board();
    for (const row of board) {
      for (const sq of row) {
        if (!sq) continue;
        const val = PIECE_VALUES[sq.type] ?? 0;
        score += sq.color === 'w' ? val : -val;
      }
    }

    // Flip sign if we're evaluating for black (we want best for current player)
    const playerScore = isWhiteTurn ? score : -score;

    if (playerScore > bestScore) {
      bestScore = playerScore;
      bestMove = move;
    }

    chess.undo();
  }

  // Final score from white's perspective
  const finalScore = isWhiteTurn ? bestScore : -bestScore;
  const uciMove = `${bestMove.from}${bestMove.to}${bestMove.promotion ?? ''}`;

  return { fen, bestMove: uciMove, score: finalScore };
}

/**
 * Given a game, find the worst blunder made by `username`.
 * Uses localEvaluate — runs entirely in JS, no engine needed.
 */
export function extractPuzzleFromGame(
  game: ChessComGame,
  username: string,
): Puzzle | null {
  try {
    const chess = new Chess();
    chess.loadPgn(game.pgn);
    const history = chess.history({ verbose: true });
    if (history.length < 10) return null;

    const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
    const replayChess = new Chess();
    let worstBlunder: Puzzle | null = null;
    let worstDrop = BLUNDER_THRESHOLD;

    for (let i = 0; i < history.length - 1; i++) {
      const move = history[i];

      // Only check the player's moves; skip first 5 moves (opening)
      const isMyMove = isWhite ? i % 2 === 0 : i % 2 === 1;
      if (!isMyMove || i < 10) {
        replayChess.move(move);
        continue;
      }

      const fenBefore = replayChess.fen();
      const evalBefore = localEvaluate(fenBefore);

      replayChess.move(move);

      const fenAfter = replayChess.fen();
      const evalAfter = localEvaluate(fenAfter);

      // Eval drop from the player's perspective
      const scoreBefore = isWhite ? evalBefore.score : -evalBefore.score;
      const scoreAfter = isWhite ? evalAfter.score : -evalAfter.score;
      const drop = scoreBefore - scoreAfter;

      if (drop > worstDrop) {
        worstDrop = drop;
        const opponent = isWhite ? game.black.username : game.white.username;
        worstBlunder = {
          id: `${game.url}-move${i}`,
          fen: fenBefore,
          correctMove: evalBefore.bestMove,
          opponentUsername: opponent,
          moveNumber: Math.floor(i / 2) + 1,
          color: isWhite ? 'white' : 'black',
          evalDrop: Math.round(drop),
        };
      }
    }

    return worstBlunder;
  } catch {
    return null;
  }
}

/**
 * Generate up to maxPuzzles from recent games.
 * Runs synchronously — no await needed.
 */
export function generatePuzzlesSync(
  games: ChessComGame[],
  username: string,
  maxPuzzles = 5
): Puzzle[] {
  const puzzles: Puzzle[] = [];

  for (const game of games.slice(0, 15)) {
    if (puzzles.length >= maxPuzzles) break;
    const puzzle = extractPuzzleFromGame(game, username);
    if (puzzle) puzzles.push(puzzle);
  }

  return puzzles.sort((a, b) => b.evalDrop - a.evalDrop).slice(0, maxPuzzles);
}

/**
 * Fetch the best move for a position from Lichess cloud eval (real Stockfish, depth ~22).
 * Returns UCI string e.g. "e2e4", or null if unavailable.
 */
async function lichessCloudEval(fen: string): Promise<string | null> {
  try {
    const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const firstMove: string | undefined = data?.pvs?.[0]?.moves?.split(' ')?.[0];
    return firstMove ?? null;
  } catch {
    return null;
  }
}

/**
 * Generate up to maxPuzzles, using Lichess cloud eval to get real best moves.
 * Falls back to local 1-ply evaluator if the API is unavailable.
 */
export async function generatePuzzles(
  games: ChessComGame[],
  username: string,
  _evaluatePosition?: (fen: string) => Promise<PositionEval>,
  maxPuzzles = 5
): Promise<Puzzle[]> {
  const puzzles = generatePuzzlesSync(games, username, maxPuzzles);

  // Enrich each puzzle's correctMove with real Stockfish analysis
  await Promise.all(
    puzzles.map(async (puzzle) => {
      const lichessMove = await lichessCloudEval(puzzle.fen);
      if (lichessMove) {
        puzzle.correctMove = lichessMove;
      }
    })
  );

  return puzzles;
}

/**
 * Convert a UCI move (e.g. "e2e4", "e7e8q") to SAN for display.
 */
export function uciToSan(fen: string, uciMove: string): string | null {
  try {
    const chess = new Chess(fen);
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove.length === 5 ? uciMove[4] : undefined;
    const result = chess.move({ from, to, promotion } as any);
    return result ? result.san : null;
  } catch {
    return null;
  }
}
