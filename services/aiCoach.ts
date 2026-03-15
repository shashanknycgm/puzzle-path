import { Chess } from 'chess.js';
import { startSpan } from './telemetry';

const API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY ?? '';
console.log('[aiCoach] key loaded, length:', API_KEY.length);

export interface CoachingParams {
  fen: string;
  correctMoveSan: string;
  solved: boolean;
  evalDrop: number;
}

const PIECE_NAMES: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};
const FILE_LABELS = 'abcdefgh';

/**
 * Converts a FEN + best move into a plain-English position description so
 * Claude doesn't have to parse FEN notation (it hallucinates piece locations
 * when given raw FEN strings).
 */
function describeMoveContext(fen: string, moveSan: string): string {
  try {
    const chess = new Chess(fen);
    const turn = chess.turn() === 'w' ? 'White' : 'Black';

    // List every non-pawn piece with its square so Claude knows exactly
    // where pieces are and cannot invent locations.
    const board = chess.board();
    const pieces: string[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = board[r][f];
        if (!sq || sq.type === 'p') continue;
        const color = sq.color === 'w' ? 'White' : 'Black';
        const square = FILE_LABELS[f] + String(8 - r);
        pieces.push(`${color} ${PIECE_NAMES[sq.type]} on ${square}`);
      }
    }

    // Play the move to detect what it does (capture, check, etc.)
    const moveResult = chess.move(moveSan);
    const effects: string[] = [];
    if (moveResult?.captured) {
      effects.push(`captures the ${PIECE_NAMES[moveResult.captured] ?? moveResult.captured} on ${moveResult.to}`);
    }
    if (chess.isCheckmate()) effects.push('delivers checkmate');
    else if (chess.isCheck()) effects.push('gives check');

    let context = `It is ${turn}'s turn. Pieces on the board: ${pieces.join(', ')}.`;
    if (effects.length) context += ` The move ${moveSan} ${effects.join(' and ')}.`;
    return context;
  } catch {
    return `FEN: ${fen}`;
  }
}

/**
 * Calls Claude to generate a 2-3 sentence coaching analysis for a puzzle result.
 * Uses claude-haiku for low latency.
 */
export async function getCoachAnalysis(params: CoachingParams): Promise<string> {
  const { fen, correctMoveSan, solved, evalDrop } = params;
  const evalPawns = (evalDrop / 100).toFixed(1);
  const span = startSpan('ai_coach.request', { solved, eval_drop: evalDrop, move: correctMoveSan });

  const positionContext = describeMoveContext(fen, correctMoveSan);

  const outcome = solved
    ? `The student found the correct move: ${correctMoveSan}.`
    : `The student couldn't find the move. The correct answer was ${correctMoveSan}.`;

  const prompt =
    `You are a concise chess coach. ` +
    `The student blundered in this position, losing roughly ${evalPawns} pawns. ` +
    `${positionContext}\n` +
    `${outcome}\n\n` +
    `In exactly 1-2 sentences, explain why ${correctMoveSan} is the best move. ` +
    `Only mention pieces and squares that appear in the piece list above. ` +
    `Be direct and specific about the tactic or idea. No bullet points, just natural prose.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 140,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('[aiCoach] error body:', body);
    const err = new Error(`Claude API error: ${response.status}`);
    span.error(err, { status_code: response.status });
    throw err;
  }

  const data = await response.json();
  const text = (data.content?.[0]?.text ?? '').trim();
  span.finish({ response_length: text.length });
  return text;
}
