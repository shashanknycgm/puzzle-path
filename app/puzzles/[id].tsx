import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Chessboard from 'react-native-chessboard';
import { Chess } from 'chess.js';
import { storage, type Puzzle } from '../../services/storage';
import { uciToSan } from '../../services/puzzleGenerator';

type Feedback = 'correct' | 'wrong' | null;

export default function PuzzleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [revealed, setRevealed] = useState(false);
  const [solved, setSolved] = useState(false);
  const [boardKey, setBoardKey] = useState(0); // force remount to reset board
  const [correctSan, setCorrectSan] = useState('');

  const feedbackAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loadPuzzle = async () => {
      const puzzles = await storage.getPuzzles();
      const found = puzzles.find((p) => p.id === decodeURIComponent(id));
      if (found) {
        setPuzzle(found);
        const san = uciToSan(found.fen, found.correctMove);
        setCorrectSan(san || found.correctMove);
      }
    };
    loadPuzzle();
  }, [id]);

  const flashFeedback = (type: Feedback) => {
    setFeedback(type);
    feedbackAnim.setValue(1);
    Animated.timing(feedbackAnim, {
      toValue: 0,
      duration: 800,
      useNativeDriver: true,
    }).start(() => {
      if (type === 'correct') setFeedback(null);
    });
  };

  const handleMove = async ({ state }: { state: { in_checkmate: boolean; in_draw: boolean; [key: string]: any } }) => {
    if (!puzzle || solved || revealed) return;

    // Get last move from chess.js to compare against correct move
    const chess = new Chess(puzzle.fen);
    const history = chess.history({ verbose: true });

    // The board state passed to onMove contains the current FEN
    // We need to figure out what move was just played
    // react-native-chessboard passes `state` which has the board state
    // We compare by rebuilding the move from fen diff

    // Actually, react-native-chessboard v0.1.x passes the move via `move` key
    // Let's handle both patterns
    const moveState = state as any;
    const lastMoveFrom = moveState?.move?.from || moveState?.from;
    const lastMoveTo = moveState?.move?.to || moveState?.to;

    if (!lastMoveFrom || !lastMoveTo) {
      // Can't determine move, skip validation
      return;
    }

    const playedUci = `${lastMoveFrom}${lastMoveTo}`;
    const correctUci = puzzle.correctMove.slice(0, 4); // first 4 chars (ignore promotion for now)

    const isCorrect = playedUci === correctUci;

    if (isCorrect) {
      flashFeedback('correct');
      setSolved(true);
      await storage.updatePuzzleResult(puzzle.id, 'solved');
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      flashFeedback('wrong');

      if (newAttempts >= 3) {
        setRevealed(true);
        await storage.updatePuzzleResult(puzzle.id, 'failed');
      } else {
        // Reset board after a short delay
        setTimeout(() => {
          setBoardKey((k) => k + 1);
          setFeedback(null);
        }, 900);
      }
    }
  };

  const handleSkip = async () => {
    if (!puzzle) return;
    await storage.updatePuzzleResult(puzzle.id, 'skipped');
    router.back();
  };

  const handleReveal = () => {
    setRevealed(true);
    if (puzzle) storage.updatePuzzleResult(puzzle.id, 'failed');
  };

  if (!puzzle) {
    return (
      <View style={styles.center}>
        <Text style={styles.missingText}>Puzzle not found.</Text>
      </View>
    );
  }

  const bgColor = feedback === 'correct'
    ? 'rgba(27,122,62,0.12)'
    : feedback === 'wrong'
    ? 'rgba(192,57,43,0.12)'
    : 'transparent';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      {/* Context */}
      <View style={styles.context}>
        <Text style={styles.contextText}>
          vs <Text style={styles.opponent}>{puzzle.opponentUsername}</Text>
          {'  ·  '}Move {puzzle.moveNumber}{'  ·  '}
          Playing as <Text style={styles.opponent}>{puzzle.color}</Text>
        </Text>
        <Text style={styles.evalLabel}>You lost {puzzle.evalDrop} centipawns here</Text>
      </View>

      {/* Instruction */}
      {!solved && !revealed && (
        <View style={styles.instruction}>
          <Text style={styles.instructionText}>
            Find the best move for {puzzle.color === 'white' ? '⬜ White' : '⬛ Black'}
          </Text>
          {attempts > 0 && (
            <Text style={styles.attemptsText}>
              {attempts}/3 attempts · {3 - attempts} left
            </Text>
          )}
        </View>
      )}

      {/* Feedback overlay */}
      {feedback && (
        <Animated.View style={[styles.feedbackBanner, { backgroundColor: bgColor, opacity: feedbackAnim }]}>
          <Text style={[styles.feedbackText, { color: feedback === 'correct' ? '#1B7A3E' : '#C0392B' }]}>
            {feedback === 'correct' ? '✓ Correct!' : '✗ Not quite, try again'}
          </Text>
        </Animated.View>
      )}

      {/* Chessboard */}
      <View style={styles.boardWrapper}>
        <Chessboard
          key={boardKey}
          fen={puzzle.fen}
          boardOrientation={puzzle.color}
          onMove={handleMove}
          gestureEnabled={!solved && !revealed}
          colors={{
            black: '#769656',
            white: '#EEEED2',
          }}
        />
      </View>

      {/* Solved state */}
      {solved && (
        <View style={styles.resultCard}>
          <Text style={styles.resultIcon}>🎉</Text>
          <Text style={styles.resultTitle}>Puzzle Solved!</Text>
          <Text style={styles.resultSubtext}>The correct move was <Text style={styles.bold}>{correctSan}</Text></Text>
          <TouchableOpacity style={styles.nextButton} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.nextButtonText}>← Back to Puzzles</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Revealed (failed) state */}
      {revealed && !solved && (
        <View style={[styles.resultCard, styles.failCard]}>
          <Text style={styles.resultIcon}>📖</Text>
          <Text style={styles.resultTitle}>Solution</Text>
          <Text style={styles.resultSubtext}>The best move was <Text style={styles.bold}>{correctSan}</Text></Text>
          <TouchableOpacity style={styles.nextButton} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.nextButtonText}>← Back to Puzzles</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Actions */}
      {!solved && !revealed && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.hintButton} onPress={handleReveal} activeOpacity={0.8}>
            <Text style={styles.hintText}>Show Answer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip} activeOpacity={0.8}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F0' },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  missingText: { color: '#666' },

  context: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  contextText: { fontSize: 14, color: '#666' },
  opponent: { fontWeight: '700', color: '#333' },
  evalLabel: { fontSize: 12, color: '#C0392B', marginTop: 4, fontWeight: '600' },

  instruction: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  instructionText: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  attemptsText: { fontSize: 13, color: '#C0392B', marginTop: 4 },

  feedbackBanner: {
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  feedbackText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },

  boardWrapper: {
    marginHorizontal: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },

  resultCard: {
    margin: 16,
    backgroundColor: '#E8F5EE',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  failCard: { backgroundColor: '#FDECEA' },
  resultIcon: { fontSize: 40, marginBottom: 10 },
  resultTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  resultSubtext: { fontSize: 15, color: '#444', marginBottom: 20 },
  bold: { fontWeight: '700' },
  nextButton: {
    backgroundColor: '#1B7A3E',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  nextButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  actions: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    gap: 12,
  },
  hintButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  hintText: { color: '#666', fontWeight: '600' },
  skipButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipText: { color: '#666', fontWeight: '600' },
});
