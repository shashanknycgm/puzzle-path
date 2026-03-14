const API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY ?? '';

export interface CoachingParams {
  fen: string;
  correctMoveSan: string;
  solved: boolean;
  evalDrop: number;
}

/**
 * Calls Claude to generate a 2-3 sentence coaching analysis for a puzzle result.
 * Uses claude-3-5-haiku for low latency.
 */
export async function getCoachAnalysis(params: CoachingParams): Promise<string> {
  const { fen, correctMoveSan, solved, evalDrop } = params;
  const evalPawns = (evalDrop / 100).toFixed(1);

  const outcome = solved
    ? `The student found the correct move: ${correctMoveSan}.`
    : `The student couldn't find the move. The correct answer was ${correctMoveSan}.`;

  const prompt =
    `You are a concise chess coach reviewing a position with a student. ` +
    `The student blundered in this position (FEN: ${fen}), losing roughly ${evalPawns} pawns of advantage. ` +
    `${outcome}\n\n` +
    `In 2-3 sentences: explain what ${correctMoveSan} achieves tactically and why it is strong. ` +
    `End with one practical tip the student can apply in future games. ` +
    `Be direct, encouraging, and conversational — no bullet points, just natural prose.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 220,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.content?.[0]?.text ?? '').trim();
}
