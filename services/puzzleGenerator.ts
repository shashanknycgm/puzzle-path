import { Chess } from 'chess.js';
import type { ChessComGame } from './chesscom';
import type { Puzzle } from './storage';

// Minimum eval drop (centipawns) to count as a blunder worth making a puzzle
const BLUNDER_THRESHOLD = 150;

export interface PositionEval {
  fen: string;
  bestMove: string; // UCI format e.g. "e2e4"
  score: number;    // centipawns from white's perspective
}

/**
 * Given a game and a callback to evaluate positions with Stockfish,
 * find the worst blunder made by `username` and return a Puzzle.
 */
export async function extractPuzzleFromGame(
  game: ChessComGame,
  username: string,
  evaluatePosition: (fen: string) => Promise<PositionEval>
): Promise<Puzzle | null> {
  try {
    const chess = new Chess();

    // Strip headers from PGN for cleaner loading
    const pgnBody = game.pgn;
    chess.loadPgn(pgnBody);

    const history = chess.history({ verbose: true });
    if (history.length < 6) return null; // too short

    const isWhite = game.white.username.toLowerCase() === username.toLowerCase();

    // Replay moves and find our worst blunder
    const replayChess = new Chess();
    let worstBlunder: Puzzle | null = null;
    let worstDrop = BLUNDER_THRESHOLD;

    for (let i = 0; i < history.length - 1; i++) {
      const move = history[i];

      // Only check the player's moves
      const isMyMove = isWhite ? i % 2 === 0 : i % 2 === 1;
      if (!isMyMove) {
        replayChess.move(move);
        continue;
      }

      // Evaluate position BEFORE the player's move
      const fenBefore = replayChess.fen();
      const evalBefore = await evaluatePosition(fenBefore);

      // Make the move
      replayChess.move(move);

      // Evaluate position AFTER the player's move
      const fenAfter = replayChess.fen();
      const evalAfter = await evaluatePosition(fenAfter);

      // Calculate eval drop from player's perspective
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
 * From a list of games, extract up to `maxPuzzles` puzzles (one per game max).
 * Games are analyzed in order; we pick the worst blunder from each game.
 */
export async function generatePuzzles(
  games: ChessComGame[],
  username: string,
  evaluatePosition: (fen: string) => Promise<PositionEval>,
  maxPuzzles = 5
): Promise<Puzzle[]> {
  const puzzles: Puzzle[] = [];
  const gamesToAnalyze = games.slice(0, 10); // cap at 10 games for performance

  for (const game of gamesToAnalyze) {
    if (puzzles.length >= maxPuzzles) break;
    const puzzle = await extractPuzzleFromGame(game, username, evaluatePosition);
    if (puzzle) puzzles.push(puzzle);
  }

  // Sort by worst blunder first
  return puzzles.sort((a, b) => b.evalDrop - a.evalDrop).slice(0, maxPuzzles);
}

/**
 * Convert a UCI move (e.g. "e2e4", "e7e8q") to SAN for display.
 * Returns null if the move is invalid for the given FEN.
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
