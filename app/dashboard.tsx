import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getRecentGames, computeStats, type GameStats } from '../services/chesscom';
import { generatePuzzlesProgressive } from '../services/puzzleGenerator';
import { storage } from '../services/storage';
import { startSpan, track } from '../services/telemetry';

type GenerationState = 'idle' | 'fetching' | 'analyzing' | 'done' | 'error';

export default function DashboardScreen() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [stats, setStats] = useState<GameStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [cachedGames, setCachedGames] = useState<any[]>([]);
  const [genState, setGenState] = useState<GenerationState>('idle');
  const [genProgress, setGenProgress] = useState('');
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);
  const [puzzleCount, setPuzzleCount] = useState(0);
  const [blundersFound, setBlundersFound] = useState(0);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, total: 1 });
  const progressAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    const user = await storage.getUsername();
    if (!user) return;
    setUsername(user);

    setLoadingStats(true);
    try {
      const games = await getRecentGames(user, 14);
      setStats(computeStats(games, user));
      setCachedGames(games); // reuse for Generate so we don't fetch twice
    } catch {
      setStats({ wins: 0, losses: 0, draws: 0, totalGames: 0 });
    } finally {
      setLoadingStats(false);
    }

    const ts = await storage.getLastGenerated();
    if (ts) setLastGenerated(new Date(ts));

    const puzzles = await storage.getPuzzles();
    setPuzzleCount(puzzles.length);
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const handleGeneratePuzzles = async () => {
    if (isGenerating) return;

    const genSpan = startSpan('puzzle.generation', { username });
    setGenState('fetching');
    setGenProgress('Fetching your recent games…');
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      let games = cachedGames;
      if (games.length === 0) {
        games = await getRecentGames(username, 14);
        setCachedGames(games);
      }

      if (games.length === 0) {
        setGenState('idle');
        genSpan.finish({ games_found: 0, puzzles_found: 0, aborted: true, reason: 'no_games' });
        Alert.alert('No Games Found', 'No games found in the last 14 days. Play some games on chess.com first!');
        return;
      }

      setBlundersFound(0);
      setScanProgress({ scanned: 0, total: 1 });
      progressAnim.setValue(0);
      setGenState('analyzing');
      await new Promise(resolve => setTimeout(resolve, 50));

      const collected: any[] = [];
      await generatePuzzlesProgressive(
        games,
        username,
        async (puzzle) => {
          collected.push(puzzle);
          setBlundersFound(collected.length);
          Animated.timing(progressAnim, {
            toValue: collected.length / 1.7,
            duration: 250,
            useNativeDriver: false,
          }).start();
        },
        (scanned, total) => setScanProgress({ scanned, total }),
      );

      if (collected.length === 0) {
        setGenState('idle');
        genSpan.finish({ games_found: games.length, puzzles_found: 0, aborted: true, reason: 'no_blunders' });
        Alert.alert('No Puzzles Found', "No significant blunders found in your recent games. You're playing well!");
        return;
      }

      await storage.setPuzzles(collected);
      await storage.setPuzzleProgress({});
      const now = Date.now();
      await storage.setLastGenerated(now);
      setLastGenerated(new Date(now));
      setPuzzleCount(collected.length);
      setGenState('done');
      genSpan.finish({ games_found: games.length, puzzles_found: collected.length, aborted: false });

      router.push('/puzzles');
    } catch (err) {
      setGenState('error');
      genSpan.error(err, { games_found: cachedGames.length });
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  const handleViewPuzzles = () => {
    router.push('/puzzles');
  };

  const handleChangeUser = async () => {
    await storage.setUsername('');
    await storage.setPuzzles([]);
    await storage.setPuzzleProgress({});
    router.replace('/');
  };

  const isGenerating = genState === 'fetching' || genState === 'analyzing';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello,</Text>
          <Text style={styles.username}>{username}</Text>
          <TouchableOpacity onPress={handleChangeUser} style={styles.changeUser}>
            <Text style={styles.changeUserText}>Change user</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Last 14 Days</Text>
          {loadingStats ? (
            <ActivityIndicator color="#1B7A3E" style={{ marginVertical: 16 }} />
          ) : stats ? (
            <View style={styles.statsRow}>
              <StatBox label="Wins" value={stats.wins} color="#1B7A3E" />
              <StatBox label="Losses" value={stats.losses} color="#C0392B" />
              <StatBox label="Draws" value={stats.draws} color="#7F8C8D" />
            </View>
          ) : null}
          {stats && !loadingStats && (
            <Text style={styles.totalGames}>{stats.totalGames} games played</Text>
          )}
        </View>

        {/* Puzzles Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Puzzles</Text>

          {lastGenerated && (
            <Text style={styles.lastGen}>
              Last generated: {lastGenerated.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
          )}

          {isGenerating ? (
            <View style={styles.generatingContainer}>
              {genState === 'fetching' ? (
                <>
                  <ActivityIndicator color="#1B7A3E" size="large" />
                  <Text style={styles.generatingText}>Fetching your recent games…</Text>
                </>
              ) : (
                <>
                  <Text style={styles.generatingText}>
                    Analyzing game {scanProgress.scanned} of {scanProgress.total}
                    {blundersFound > 0 ? `  ·  ${blundersFound} blunder${blundersFound !== 1 ? 's' : ''} found` : ''}
                  </Text>
                  <View style={styles.progressTrack}>
                    <Animated.View
                      style={[
                        styles.progressFill,
                        {
                          width: progressAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.generatingSubtext}>Looking for your biggest blunders…</Text>
                </>
              )}
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.generateButton}
                onPress={handleGeneratePuzzles}
                activeOpacity={0.8}
              >
                <Text style={styles.generateButtonText}>
                  {puzzleCount > 0 ? '↻ Regenerate Puzzles' : '✦ Generate My Puzzles'}
                </Text>
              </TouchableOpacity>

              {puzzleCount > 0 && (
                <TouchableOpacity
                  style={styles.viewButton}
                  onPress={handleViewPuzzles}
                  activeOpacity={0.8}
                >
                  <Text style={styles.viewButtonText}>
                    View {puzzleCount} Puzzle{puzzleCount !== 1 ? 's' : ''} →
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* How it works */}
        <View style={[styles.card, styles.howCard]}>
          <Text style={styles.cardTitle}>How It Works</Text>
          <Step n="1" text="Fetches your last 10 games from chess.com" />
          <Step n="2" text="Analyzes your moves to find your biggest blunders" />
          <Step n="3" text="You get 5 puzzles to practice those exact positions" />
        </View>
      </ScrollView>
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={statStyles.box}>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <View style={stepStyles.row}>
      <View style={stepStyles.circle}>
        <Text style={stepStyles.num}>{n}</Text>
      </View>
      <Text style={stepStyles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F0' },
  scroll: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 20 },
  greeting: { fontSize: 16, color: '#666' },
  username: { fontSize: 26, fontWeight: '800', color: '#1a1a1a', marginTop: 2 },
  changeUser: { marginTop: 4 },
  changeUserText: { color: '#1B7A3E', fontSize: 13 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  howCard: { backgroundColor: '#F0FAF4' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#666', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  totalGames: { textAlign: 'center', color: '#999', fontSize: 13, marginTop: 10 },
  lastGen: { color: '#999', fontSize: 13, marginBottom: 14 },
  generatingContainer: { alignItems: 'center', paddingVertical: 20 },
  generatingText: { marginTop: 4, fontSize: 15, fontWeight: '600', color: '#333', textAlign: 'center' },
  generatingSubtext: { marginTop: 8, fontSize: 13, color: '#999' },
  progressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#E8F5EE',
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 14,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1B7A3E',
    borderRadius: 4,
  },
  generateButton: {
    backgroundColor: '#1B7A3E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  generateButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  viewButton: {
    borderWidth: 1.5,
    borderColor: '#1B7A3E',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  viewButtonText: { color: '#1B7A3E', fontWeight: '600', fontSize: 15 },
});

const statStyles = StyleSheet.create({
  box: { alignItems: 'center', flex: 1 },
  value: { fontSize: 36, fontWeight: '800' },
  label: { fontSize: 13, color: '#999', marginTop: 4 },
});

const stepStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  circle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1B7A3E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  num: { color: '#fff', fontWeight: '700', fontSize: 13 },
  text: { flex: 1, fontSize: 14, color: '#444', lineHeight: 20 },
});
