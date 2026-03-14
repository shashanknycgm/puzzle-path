import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { storage, type Puzzle, type PuzzleProgress } from '../../services/storage';
import { uciToSan } from '../../services/puzzleGenerator';
import { generationState } from '../../services/generationState';

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

  const loadData = useCallback(async () => {
    const [p, prog] = await Promise.all([storage.getPuzzles(), storage.getPuzzleProgress()]);
    setPuzzles(p);
    setProgress(prog);
    setLoading(false);
    setGenerating(generationState.isGenerating);
  }, []);

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
            <ActivityIndicator color="#1B7A3E" size="large" />
            <Text style={[styles.emptyText, { marginTop: 16 }]}>Finding your blunders…</Text>
            <Text style={styles.emptySubtext}>Analyzing your recent games</Text>
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
      {generating && (
        <View style={styles.generatingBanner}>
          <ActivityIndicator color="#1B7A3E" size="small" style={{ marginRight: 8 }} />
          <Text style={styles.generatingBannerText}>Finding more blunders…</Text>
        </View>
      )}
      <View style={styles.headerBar}>
        <Text style={styles.headerText}>
          {solved}/{puzzles.length} solved
        </Text>
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
                <Text style={styles.evalDrop}>
                  Blunder: –{item.evalDrop} cp
                </Text>
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
  generatingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5EE',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#c8e6d4',
  },
  generatingBannerText: { fontSize: 13, color: '#1B7A3E', fontWeight: '600' },
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
