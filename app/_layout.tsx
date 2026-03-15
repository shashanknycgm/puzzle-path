import 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import ChessEngineWebView from '../components/ChessEngineWebView';
import { chessEngineRef } from '../services/chessEngineService';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      {/* Hidden off-thread chess engine — stays alive for the entire app session */}
      <ChessEngineWebView ref={chessEngineRef as any} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1B7A3E' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#F5F5F0' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="dashboard" options={{ title: 'Puzzle Path' }} />
        <Stack.Screen name="puzzles/index" options={{ title: 'Your Puzzles' }} />
        <Stack.Screen name="puzzles/[id]" options={{ title: 'Solve Puzzle' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
