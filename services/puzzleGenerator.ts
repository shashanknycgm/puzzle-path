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

/** Material sum from white's perspective */
function materialScore(chess: Chess): number {
  let score = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      const val = PIECE_VALUES[sq.type] ?? 0;
      score += sq.color === 'w' ? val : -val;
    }
  }
  return score;
}

/**
 * Alpha-beta minimax.
 * Returns score from white's perspective.
 */
function alphaBeta(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
): number {
  if (depth === 0) return materialScore(chess);

  const moves = chess.moves({ verbose: true });

  if (moves.length === 0) {
    if (chess.isCheckmate()) return maximizing ? -30000 : 30000;
    return 0; // stalemate
  }

  // Move ordering: captures first (MVV-LVA improves pruning depth)
  moves.sort((a, b) => {
    const aVal = a.captured ? (PIECE_VALUES[a.captured] ?? 0) - (PIECE_VALUES[a.piece] ?? 0) / 10 : -1000;
    const bVal = b.captured ? (PIECE_VALUES[b.captured] ?? 0) - (PIECE_VALUES[b.piece] ?? 0) / 10 : -1000;
    return bVal - aVal;
  });

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.max(best, alphaBeta(chess, depth - 1, alpha, beta, false));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.min(best, alphaBeta(chess, depth - 1, alpha, beta, true));
      chess.undo();
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/**
 * Find the best move from a position using alpha-beta minimax (depth 3).
 * Finds forks, pins, and basic combinations — far stronger than 1-ply.
 * Runs synchronously in JS — no network or WASM needed.
 */
export function localEvaluate(fen: string, depth = 3): PositionEval {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });

  if (moves.length === 0) {
    const score = chess.isCheckmate() ? (chess.turn() === 'w' ? -30000 : 30000) : 0;
    return { fen, bestMove: '', score };
  }

  const isWhiteTurn = chess.turn() === 'w';
  let bestMove = moves[0];
  let bestScore = -Infinity;

  // Captures first at root for better pruning
  moves.sort((a, b) => {
    const aVal = a.captured ? (PIECE_VALUES[a.captured] ?? 0) : -1000;
    const bVal = b.captured ? (PIECE_VALUES[b.captured] ?? 0) : -1000;
    return bVal - aVal;
  });

  for (const move of moves) {
    chess.move(move);
    const raw = alphaBeta(chess, depth - 1, -Infinity, Infinity, !isWhiteTurn);
    chess.undo();
    const playerScore = isWhiteTurn ? raw : -raw;
    if (playerScore > bestScore) {
      bestScore = playerScore;
      bestMove = move;
    }
  }

  const finalScore = isWhiteTurn ? bestScore : -bestScore;
  const uciMove = `${bestMove.from}${bestMove.to}${bestMove.promotion ?? ''}`;
  return { fen, bestMove: uciMove, score: finalScore };
}

/**
 * Given a game, find the worst blunder made by `username`.
 * Uses localEvaluate (depth 1 for speed during scan, depth 3 for correctMove).
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
      // Use depth 1 for the blunder scan (fast — runs for every move in every game)
      const evalBefore = localEvaluate(fenBefore, 1);

      replayChess.move(move);

      const fenAfter = replayChess.fen();
      const evalAfter = localEvaluate(fenAfter, 1);

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
          correctMove: evalBefore.bestMove, // placeholder; enriched below
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

/** Yield the JS thread so the UI can update between heavy computations. */
function yieldThread(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Generate up to maxPuzzles, enriching correctMove with local alpha-beta depth-3.
 * Yields between each puzzle to keep the UI responsive.
 */
export async function generatePuzzles(
  games: ChessComGame[],
  username: string,
  _evaluatePosition?: (fen: string) => Promise<PositionEval>,
  maxPuzzles = 5
): Promise<Puzzle[]> {
  const puzzles = generatePuzzlesSync(games, username, maxPuzzles);

  for (const puzzle of puzzles) {
    await yieldThread(); // let spinner animate between each puzzle analysis
    const best = localEvaluate(puzzle.fen, 3);
    if (best.bestMove) puzzle.correctMove = best.bestMove;
  }

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
