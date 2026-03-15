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
 * Quiescence search: extend the search with captures until the position is
 * "quiet" (no captures available). Eliminates the horizon effect where the
 * engine thinks a capture is great without seeing the recapture.
 */
function quiesce(
  chess: Chess,
  alpha: number,
  beta: number,
  maximizing: boolean,
): number {
  const standPat = materialScore(chess);

  if (maximizing) {
    if (standPat >= beta) return standPat;
    alpha = Math.max(alpha, standPat);
  } else {
    if (standPat <= alpha) return standPat;
    beta = Math.min(beta, standPat);
  }

  const captures = chess.moves({ verbose: true }).filter(m => m.captured);
  captures.sort((a, b) => {
    const aVal = (PIECE_VALUES[a.captured!] ?? 0) - (PIECE_VALUES[a.piece] ?? 0) / 10;
    const bVal = (PIECE_VALUES[b.captured!] ?? 0) - (PIECE_VALUES[b.piece] ?? 0) / 10;
    return bVal - aVal;
  });

  let best = standPat;
  for (const move of captures) {
    chess.move(move);
    const score = quiesce(chess, alpha, beta, !maximizing);
    chess.undo();
    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  return best;
}

/**
 * Alpha-beta minimax.
 * Returns score from white's perspective.
 * useQuiescence=true: resolves capture sequences at leaf nodes (better quality,
 * ~2-5x more nodes — use for enrichment only, not the fast blunder scan).
 */
function alphaBeta(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  useQuiescence = false,
): number {
  if (depth === 0) {
    return useQuiescence ? quiesce(chess, alpha, beta, maximizing) : materialScore(chess);
  }

  const moves = chess.moves({ verbose: true });

  if (moves.length === 0) {
    if (chess.isCheckmate()) return maximizing ? -30000 : 30000;
    return 0; // stalemate
  }

  // Move ordering: captures first (MVV-LVA improves pruning)
  moves.sort((a, b) => {
    const aVal = a.captured ? (PIECE_VALUES[a.captured] ?? 0) - (PIECE_VALUES[a.piece] ?? 0) / 10 : -1000;
    const bVal = b.captured ? (PIECE_VALUES[b.captured] ?? 0) - (PIECE_VALUES[b.piece] ?? 0) / 10 : -1000;
    return bVal - aVal;
  });

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.max(best, alphaBeta(chess, depth - 1, alpha, beta, false, useQuiescence));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      chess.move(move);
      best = Math.min(best, alphaBeta(chess, depth - 1, alpha, beta, true, useQuiescence));
      chess.undo();
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

/**
 * Find the best move from a position using alpha-beta minimax.
 * depth=1: fast scan (1-ply). depth=3: tactical quality.
 */
export function localEvaluate(fen: string, depth = 3, useQuiescence = false): PositionEval {
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
    const raw = alphaBeta(chess, depth - 1, -Infinity, Infinity, !isWhiteTurn, useQuiescence);
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
 * Enrich a single puzzle's correctMove using alpha-beta.
 * depth=2 (~100ms, default for on-open fallback).
 * depth=3 + quiescence (~300ms, used for background deep enrichment).
 * Yields the thread first so the caller can update UI before computing.
 */
export async function enrichPuzzle(puzzle: Puzzle, depth = 2): Promise<Puzzle> {
  await new Promise(resolve => setTimeout(resolve, 0));
  const useQ = depth >= 3;
  const best = localEvaluate(puzzle.fen, depth, useQ);
  return { ...puzzle, correctMove: best.bestMove || puzzle.correctMove, enriched: true };
}

/**
 * Given a game, find the worst blunder made by `username`.
 * Uses depth-1 for speed (runs for every move in every game).
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

      const isMyMove = isWhite ? i % 2 === 0 : i % 2 === 1;
      if (!isMyMove || i < 10) {
        replayChess.move(move);
        continue;
      }

      const fenBefore = replayChess.fen();
      const evalBefore = localEvaluate(fenBefore, 1);

      replayChess.move(move);

      const fenAfter = replayChess.fen();
      const evalAfter = localEvaluate(fenAfter, 1);

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
          enriched: false,
        };
      }
    }

    return worstBlunder;
  } catch {
    return null;
  }
}

/** Returns true if the given game was a loss for username. */
export function isLoss(game: ChessComGame, username: string): boolean {
  const lc = username.toLowerCase();
  const isWhite = game.white.username.toLowerCase() === lc;
  const result = isWhite ? game.white.result : game.black.result;
  return ['checkmated', 'timeout', 'resigned', 'lose', 'abandoned'].includes(result);
}

/**
 * Progressive async scanner: lost games first (falls back to all),
 * yields the thread between each game so the UI stays responsive.
 * Calls onPuzzleFound as each blunder is discovered.
 */
export async function generatePuzzlesProgressive(
  games: ChessComGame[],
  username: string,
  onPuzzleFound: (puzzle: Puzzle) => Promise<void>,
  onProgress?: (scanned: number, total: number) => void,
  maxPuzzles = 5,
): Promise<void> {
  const lostGames = games.filter((g) => isLoss(g, username));
  const scanGames = (lostGames.length >= 2 ? lostGames : games).slice(0, 10);
  const total = scanGames.length;

  let found = 0;
  for (let i = 0; i < total; i++) {
    if (found >= maxPuzzles) {
      onProgress?.(total, total); // fill bar to 100% when we have enough
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
    const puzzle = extractPuzzleFromGame(scanGames[i], username);
    if (puzzle) {
      found++;
      await onPuzzleFound(puzzle);
      // yield so animation frames can run before the next blocking scan
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    onProgress?.(i + 1, total);
  }
}

/**
 * Fast synchronous scan of up to 10 recent games.
 * Returns puzzles with depth-1 correctMove (placeholder until enriched).
 */
export function generatePuzzlesSync(
  games: ChessComGame[],
  username: string,
  maxPuzzles = 5,
): Puzzle[] {
  // Prioritise lost games — blunders are far more common there
  const lostGames = games.filter((g) => isLoss(g, username));
  const scanGames = (lostGames.length >= 2 ? lostGames : games).slice(0, 10);

  const puzzles: Puzzle[] = [];
  for (const game of scanGames) {
    if (puzzles.length >= maxPuzzles) break;
    const puzzle = extractPuzzleFromGame(game, username);
    if (puzzle) puzzles.push(puzzle);
  }

  return puzzles.sort((a, b) => b.evalDrop - a.evalDrop).slice(0, maxPuzzles);
}

/**
 * Kept for backward compatibility. Equivalent to generatePuzzlesSync.
 * Enrichment now happens lazily in the puzzle screen.
 */
export async function generatePuzzles(
  games: ChessComGame[],
  username: string,
  _evaluatePosition?: (fen: string) => Promise<PositionEval>,
  maxPuzzles = 5,
): Promise<Puzzle[]> {
  return generatePuzzlesSync(games, username, maxPuzzles);
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
