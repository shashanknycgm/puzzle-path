import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { storage, type Puzzle, type PuzzleProgress } from '../../services/storage';
import { generationState } from '../../services/generationState';

const MAX_PUZZLES = 5;

type PuzzleStatus = 'unsolved' | 'solved' | 'failed' | 'skipped';

function statusIcon(s: PuzzleStatus): string {
  if (s === 'solved') return '✓';
  if (s === 'failed') return '✗';
  if (s === 'skipped') return '–';
  return '○';
}

function statusColor(s: PuzzleStatus): string {
  if (s === 'solved') return '#1B7A3E';
  if (s === 'failed') return '#C0392B';
  if (s === 'skipped') return '#999';
  return '#ccc';
}

export default function PuzzleListScreen() {
  const router = useRouter();
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [progress, setProgress] = useState<PuzzleProgress>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const genProgressAnim = useRef(new Animated.Value(0)).current;

  const loadData = useCallback(async () => {
    const [p, prog] = await Promise.all([storage.getPuzzles(), storage.getPuzzleProgress()]);
    setPuzzles(p);
    setProgress(prog);
    setLoading(false);
    const isGen = generationState.isGenerating;
    setGenerating(isGen);

    // Animate the generation progress bar to reflect puzzles found so far
    const target = isGen
      ? p.length / MAX_PUZZLES
      : p.length > 0 ? 1 : 0;
    Animated.timing(genProgressAnim, {
      toValue: target,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [genProgressAnim]);

  useFocusEffect(useCallback(() => {
    loadData();

    if (!generationState.isGenerating) return;

    const interval = setInterval(() => {
      loadData();
      if (!generationState.isGenerating) clearInterval(interval);
    }, 600);

    return () => clearInterval(interval);
  }, [loadData]));

  const solved = puzzles.filter((p) => progress[p.id] === 'solved').length;

  const genBarWidth = genProgressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1B7A3E" size="large" />
      </View>
    );
  }

  if (puzzles.length === 0) {
    return (
      <View style={styles.center}>
        {generating ? (
          <>
            <Text style={styles.genTitle}>Finding your blunders…</Text>
            <Text style={styles.genSubtext}>0 of {MAX_PUZZLES} found</Text>
            <View style={styles.genBarBg}>
              <Animated.View style={[styles.genBarFill, { width: genBarWidth }]} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.emptyText}>No puzzles yet.</Text>
            <Text style={styles.emptySubtext}>Go back and tap "Generate My Puzzles".</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Generation progress banner — shown while scanning is in progress */}
      {generating && (
        <View style={styles.genBanner}>
          <View style={styles.genBannerRow}>
            <ActivityIndicator color="#1B7A3E" size="small" style={{ marginRight: 8 }} />
            <Text style={styles.genBannerText}>
              Finding blunders… {puzzles.length}/{MAX_PUZZLES} found
            </Text>
          </View>
          <View style={styles.genBarBg}>
            <Animated.View style={[styles.genBarFill, { width: genBarWidth }]} />
          </View>
        </View>
      )}

      <View style={styles.headerBar}>
        <Text style={styles.headerText}>{solved}/{puzzles.length} solved</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(solved / puzzles.length) * 100}%` as any }]} />
        </View>
      </View>

      <FlatList
        data={puzzles}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => {
          const status: PuzzleStatus = (progress[item.id] as PuzzleStatus) || 'unsolved';
          return (
            <TouchableOpacity
              style={styles.puzzleCard}
              onPress={() => router.push(`/puzzles/${encodeURIComponent(item.id)}`)}
              activeOpacity={0.8}
            >
              <View style={[styles.statusDot, { backgroundColor: statusColor(status) }]}>
                <Text style={styles.statusIcon}>{statusIcon(status)}</Text>
              </View>
              <View style={styles.puzzleInfo}>
                <Text style={styles.puzzleTitle}>Puzzle {index + 1}</Text>
                <Text style={styles.puzzleDetail}>
                  vs {item.opponentUsername} · Move {item.moveNumber} · Playing {item.color}
                </Text>
                <Text style={styles.evalDrop}>Blunder: –{item.evalDrop} cp</Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F0' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  emptySubtext: { fontSize: 14, color: '#999', textAlign: 'center' },

  // Generation progress (banner + centered empty state)
  genBanner: {
    backgroundColor: '#E8F5EE',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6d4',
  },
  genBannerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  genBannerText: { fontSize: 13, color: '#1B7A3E', fontWeight: '600' },
  genTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  genSubtext: { fontSize: 13, color: '#666', marginBottom: 14 },
  genBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#c8e6d4',
    borderRadius: 4,
    overflow: 'hidden',
  },
  genBarFill: {
    height: '100%',
    backgroundColor: '#1B7A3E',
    borderRadius: 4,
  },

  // Solved progress bar (header)
  headerBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerText: { fontSize: 14, color: '#666', marginBottom: 8 },
  progressBar: {
    height: 6,
    backgroundColor: '#E8F5EE',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1B7A3E',
    borderRadius: 3,
  },

  list: { padding: 16 },
  puzzleCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  statusDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  statusIcon: { color: '#fff', fontWeight: '700', fontSize: 16 },
  puzzleInfo: { flex: 1 },
  puzzleTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 3 },
  puzzleDetail: { fontSize: 13, color: '#666', marginBottom: 2 },
  evalDrop: { fontSize: 12, color: '#C0392B', fontWeight: '600' },
  arrow: { fontSize: 22, color: '#ccc', marginLeft: 8 },
});
