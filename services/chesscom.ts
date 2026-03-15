import { startSpan } from './telemetry';

const BASE = 'https://api.chess.com/pub';

export interface ChessComGame {
  url: string;
  pgn: string;
  time_control: string;
  end_time: number;      // Unix timestamp
  rated: boolean;
  time_class: string;
  rules: string;
  white: { username: string; result: string; rating: number };
  black: { username: string; result: string; rating: number };
}

export interface GameStats {
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
}

export async function validateUsername(username: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/player/${username}`, {
      headers: { 'User-Agent': 'PuzzlePath/1.0' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getRecentGames(username: string, days = 14): Promise<ChessComGame[]> {
  const span = startSpan('chesscom.fetch', { username, days });
  const cutoff = Date.now() / 1000 - days * 24 * 60 * 60;

  const now = new Date();
  const months: Array<{ year: number; month: number }> = [
    { year: now.getFullYear(), month: now.getMonth() + 1 },
  ];

  // If we're in the first 14 days of the month, also fetch previous month
  if (now.getDate() <= days) {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    months.push({ year: prev.getFullYear(), month: prev.getMonth() + 1 });
  }

  const allGames: ChessComGame[] = [];

  for (const { year, month } of months) {
    try {
      const mm = String(month).padStart(2, '0');
      const res = await fetch(
        `${BASE}/player/${username}/games/${year}/${mm}`,
        { headers: { 'User-Agent': 'PuzzlePath/1.0' } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const games: ChessComGame[] = data.games || [];
      const filtered = games.filter(
        (g) => g.rules === 'chess' && g.end_time >= cutoff && g.pgn
      );
      allGames.push(...filtered);
    } catch {
      // skip this month on network error
    }
  }

  // Sort newest first
  const result = allGames.sort((a, b) => b.end_time - a.end_time);
  span.finish({ game_count: result.length });
  return result;
}

export function computeStats(games: ChessComGame[], username: string): GameStats {
  const lc = username.toLowerCase();
  let wins = 0, losses = 0, draws = 0;

  for (const g of games) {
    const isWhite = g.white.username.toLowerCase() === lc;
    const myResult = isWhite ? g.white.result : g.black.result;

    if (myResult === 'win') wins++;
    else if (['checkmated', 'timeout', 'resigned', 'lose', 'abandoned'].includes(myResult)) losses++;
    else draws++;
  }

  return { wins, losses, draws, totalGames: games.length };
}
