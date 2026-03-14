import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { validateUsername } from '../services/chesscom';
import { storage } from '../services/storage';

export default function OnboardingScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Auto-navigate if username is already saved
  useEffect(() => {
    storage.getUsername().then((saved) => {
      if (saved) {
        router.replace('/dashboard');
      } else {
        setChecking(false);
      }
    });
  }, []);

  const handleContinue = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;

    setLoading(true);
    const valid = await validateUsername(trimmed);
    setLoading(false);

    if (!valid) {
      Alert.alert('Not Found', `Couldn't find chess.com user "${trimmed}". Check your username and try again.`);
      return;
    }

    await storage.setUsername(trimmed);
    router.replace('/dashboard');
  };

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1B7A3E" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        {/* Logo / title */}
        <Text style={styles.logo}>♟</Text>
        <Text style={styles.title}>Puzzle Path</Text>
        <Text style={styles.subtitle}>
          Chess puzzles built from{'\n'}your own mistakes
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Your chess.com username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="e.g. shashanknycgm"
            placeholderTextColor="#999"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleContinue}
          />
          <TouchableOpacity
            style={[styles.button, !username.trim() && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={loading || !username.trim()}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Get Started →</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Free to use · No account needed
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1B7A3E' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1B7A3E' },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logo: { fontSize: 72, marginBottom: 8 },
  title: { fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 40,
    lineHeight: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 10 },
  input: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a1a',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#1B7A3E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#9DC9B0' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: {
    marginTop: 24,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
});
