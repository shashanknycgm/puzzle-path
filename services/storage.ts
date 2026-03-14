import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  USERNAME: 'username',
  PUZZLES: 'puzzles',
  PUZZLE_PROGRESS: 'puzzle_progress',
  LAST_GENERATED: 'last_generated',
};

export interface Puzzle {
  id: string;
  fen: string;           // board position before blunder
  correctMove: string;   // best engine move (UCI format, e.g. "e2e4")
  opponentUsername: string;
  moveNumber: number;
  color: 'white' | 'black'; // which color was playing
  evalDrop: number;      // centipawns lost
}

export interface PuzzleProgress {
  [puzzleId: string]: 'solved' | 'failed' | 'skipped' | 'unsolved';
}

export const storage = {
  async getUsername(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.USERNAME);
  },

  async setUsername(username: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.USERNAME, username);
  },

  async getPuzzles(): Promise<Puzzle[]> {
    const raw = await AsyncStorage.getItem(KEYS.PUZZLES);
    return raw ? JSON.parse(raw) : [];
  },

  async setPuzzles(puzzles: Puzzle[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.PUZZLES, JSON.stringify(puzzles));
  },

  async getPuzzleProgress(): Promise<PuzzleProgress> {
    const raw = await AsyncStorage.getItem(KEYS.PUZZLE_PROGRESS);
    return raw ? JSON.parse(raw) : {};
  },

  async setPuzzleProgress(progress: PuzzleProgress): Promise<void> {
    await AsyncStorage.setItem(KEYS.PUZZLE_PROGRESS, JSON.stringify(progress));
  },

  async updatePuzzleResult(puzzleId: string, result: 'solved' | 'failed' | 'skipped'): Promise<void> {
    const progress = await storage.getPuzzleProgress();
    progress[puzzleId] = result;
    await storage.setPuzzleProgress(progress);
  },

  async getLastGenerated(): Promise<number | null> {
    const raw = await AsyncStorage.getItem(KEYS.LAST_GENERATED);
    return raw ? parseInt(raw, 10) : null;
  },

  async setLastGenerated(timestamp: number): Promise<void> {
    await AsyncStorage.setItem(KEYS.LAST_GENERATED, timestamp.toString());
  },
};
