import type { ChessEngineRef } from '../components/ChessEngineWebView';
import { localEvaluate } from './puzzleGenerator';
import type { Puzzle } from './storage';

/**
 * Global ref to the ChessEngineWebView mounted in _layout.tsx.
 * Plain mutable object — React's forwardRef will set .current on mount.
 */
export const chessEngineRef: { current: ChessEngineRef | null } = { current: null };

/**
 * Enrich a puzzle using the WebView chess engine (depth-8, off the RN JS thread).
 * Falls back to local depth-2 alpha-beta if the engine isn't ready or times out.
 */
export async function engineEnrichPuzzle(
  puzzle: Puzzle,
  depth = 8,
  timeoutMs = 20000,
): Promise<Puzzle> {
  const engine = chessEngineRef.current;
  if (engine) {
    try {
      const result = await Promise.race([
        engine.evaluate(puzzle.fen, depth),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('engine timeout')), timeoutMs)
        ),
      ]);
      if (result.bestMove) {
        return { ...puzzle, correctMove: result.bestMove, enriched: true };
      }
    } catch (e) {
      console.warn('[chessEngine] WebView engine failed, falling back to local:', e);
    }
  }

  // Fallback: synchronous local depth-2 (won't freeze UI noticeably)
  const best = localEvaluate(puzzle.fen, 2, false);
  return { ...puzzle, correctMove: best.bestMove || puzzle.correctMove, enriched: true };
}
