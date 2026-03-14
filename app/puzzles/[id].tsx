import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ChessBoard, { type MoveInfo } from '../../components/ChessBoard';
import { storage, type Puzzle } from '../../services/storage';
import { uciToSan, enrichPuzzle } from '../../services/puzzleGenerator';

type Feedback = 'correct' | 'wrong' | null;

export default function PuzzleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [enriching, setEnriching] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [revealed, setRevealed] = useState(false);
  const [solved, setSolved] = useState(false);
  const [boardKey, setBoardKey] = useState(0);
  const [correctSan, setCorrectSan] = useState('');

  const feedbackAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loadAndEnrich = async () => {
      const puzzles = await storage.getPuzzles();
      const found = puzzles.find((p) => p.id === decodeURIComponent(id));
      if (!found) return;

      // Show board immediately with whatever correctMove we have
      setPuzzle(found);

      if (found.enriched) {
        setCorrectSan(uciToSan(found.fen, found.correctMove) || found.correctMove);
        setEnriching(false);
        backgroundEnrichRest(puzzles, found.id);
        return;
      }

      // Enrich this puzzle (depth-2, ~100ms) then enable interaction
      const enriched = await enrichPuzzle(found);
      await storage.updatePuzzle(enriched.id, { correctMove: enriched.correctMove, enriched: true });
      setPuzzle(enriched);
      setCorrectSan(uciToSan(enriched.fen, enriched.correctMove) || enriched.correctMove);
      setEnriching(false);

      backgroundEnrichRest(puzzles, enriched.id);
    };

    loadAndEnrich();
  }, [id]);

  const backgroundEnrichRest = async (puzzles: Puzzle[], currentId: string) => {
    for (const p of puzzles) {
      if (p.id === currentId || p.enriched) continue;
      const enriched = await enrichPuzzle(p);
      await storage.updatePuzzle(enriched.id, { correctMove: enriched.correctMove, enriched: true });
    }
  };

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

  const handleMove = async ({ from, to }: MoveInfo) => {
    if (!puzzle || solved || revealed || enriching) return;

    const playedUci = `${from}${to}`;
    const correctUci = puzzle.correctMove.slice(0, 4);
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
        <ActivityIndicator color="#1B7A3E" size="large" />
      </View>
    );
  }

  const bgColor = feedback === 'correct'
    ? 'rgba(27,122,62,0.12)'
    : feedback === 'wrong'
    ? 'rgba(192,57,43,0.12)'
    : 'transparent';

  const boardInteractive = !enriching && !solved && !revealed;

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
          {enriching ? (
            <View style={styles.analyzingRow}>
              <ActivityIndicator color="#1B7A3E" size="small" style={{ marginRight: 8 }} />
              <Text style={styles.analyzingText}>Analyzing best move…</Text>
            </View>
          ) : (
            <Text style={styles.instructionText}>
              Find the best move for {puzzle.color === 'white' ? '⬜ White' : '⬛ Black'}
            </Text>
          )}
          {!enriching && attempts > 0 && (
            <Text style={styles.attemptsText}>
              {attempts}/3 attempts · {3 - attempts} left
            </Text>
          )}
        </View>
      )}

      {/* Feedback banner */}
      <Animated.View style={[styles.feedbackBanner, { backgroundColor: bgColor, opacity: feedbackAnim }]}>
        {feedback && (
          <Text style={[styles.feedbackText, { color: feedback === 'correct' ? '#1B7A3E' : '#C0392B' }]}>
            {feedback === 'correct' ? '✓ Correct!' : '✗ Not quite, try again'}
          </Text>
        )}
      </Animated.View>

      {/* Chessboard — always mounted so WebView doesn't re-initialize */}
      <View style={styles.boardWrapper}>
        <ChessBoard
          key={`${boardKey}-${revealed ? 'r' : ''}-${solved ? 's' : ''}`}
          fen={puzzle.fen}
          onMove={handleMove}
          gestureEnabled={boardInteractive}
          flipped={puzzle.color === 'black'}
          highlightSquares={
            (revealed || solved)
              ? { from: puzzle.correctMove.slice(0, 2), to: puzzle.correctMove.slice(2, 4) }
              : undefined
          }
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
          <TouchableOpacity
            style={[styles.hintButton, enriching && styles.disabledButton]}
            onPress={enriching ? undefined : handleReveal}
            activeOpacity={enriching ? 1 : 0.8}
          >
            <Text style={[styles.hintText, enriching && styles.disabledText]}>Show Answer</Text>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

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
  analyzingRow: { flexDirection: 'row', alignItems: 'center' },
  analyzingText: { fontSize: 15, color: '#666', fontStyle: 'italic' },
  instructionText: { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  attemptsText: { fontSize: 13, color: '#C0392B', marginTop: 4 },

  feedbackBanner: {
    height: 44,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
  disabledButton: { borderColor: '#e0e0e0' },
  hintText: { color: '#666', fontWeight: '600' },
  disabledText: { color: '#bbb' },
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
