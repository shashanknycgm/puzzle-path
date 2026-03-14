import React, { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { WebView } from 'react-native-webview';
import type { PositionEval } from '../services/puzzleGenerator';

export interface StockfishRef {
  evaluate: (fen: string, depth?: number) => Promise<PositionEval>;
}

// Stockfish WASM loaded from a CDN (works in WebView)
// We bundle the engine inline as a minimal UCI interface
const STOCKFISH_HTML = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
// We use stockfish.js via CDN
var worker = null;
var pendingResolve = null;
var currentFen = null;
var targetDepth = 15;
var bestMove = null;
var score = 0;

function loadEngine() {
  worker = new Worker('https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish-nnue-16-single.js');
  worker.onmessage = function(e) {
    var line = e.data;

    // Parse best move line
    if (line.startsWith('bestmove')) {
      var parts = line.split(' ');
      bestMove = parts[1];
      if (pendingResolve) {
        pendingResolve({ fen: currentFen, bestMove: bestMove, score: score });
        pendingResolve = null;
      }
      return;
    }

    // Parse score from info line
    if (line.startsWith('info') && line.includes(' score cp ')) {
      var cpIdx = line.indexOf(' score cp ') + ' score cp '.length;
      var cpEnd = line.indexOf(' ', cpIdx);
      score = parseInt(line.substring(cpIdx, cpEnd), 10) || 0;
    } else if (line.startsWith('info') && line.includes(' score mate ')) {
      var mateIdx = line.indexOf(' score mate ') + ' score mate '.length;
      var mateEnd = line.indexOf(' ', mateIdx);
      var mateIn = parseInt(line.substring(mateIdx, mateEnd), 10) || 1;
      score = mateIn > 0 ? 30000 : -30000;
    }
  };

  worker.postMessage('uci');
  worker.postMessage('isready');
}

window.addEventListener('message', function(e) {
  try {
    var msg = JSON.parse(e.data);
    if (msg.type === 'evaluate') {
      currentFen = msg.fen;
      targetDepth = msg.depth || 15;
      score = 0;
      bestMove = null;

      pendingResolve = function(result) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'result',
          reqId: msg.reqId,
          fen: result.fen,
          bestMove: result.bestMove,
          score: result.score
        }));
      };

      worker.postMessage('position fen ' + currentFen);
      worker.postMessage('go depth ' + targetDepth);
    }
  } catch(err) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: err.message }));
  }
});

loadEngine();
<\/script>
</body>
</html>
`;

const StockfishEngine = forwardRef<StockfishRef>((_, ref) => {
  const webviewRef = useRef<WebView>(null);
  const pendingRequests = useRef<Map<string, (result: PositionEval) => void>>(new Map());

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'result' && msg.reqId) {
        const resolve = pendingRequests.current.get(msg.reqId);
        if (resolve) {
          pendingRequests.current.delete(msg.reqId);
          resolve({ fen: msg.fen, bestMove: msg.bestMove, score: msg.score });
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  useImperativeHandle(ref, () => ({
    evaluate(fen: string, depth = 15): Promise<PositionEval> {
      return new Promise((resolve) => {
        const reqId = Math.random().toString(36).slice(2);
        pendingRequests.current.set(reqId, resolve);

        const js = `
          window.dispatchEvent(new MessageEvent('message', {
            data: JSON.stringify({ type: 'evaluate', fen: ${JSON.stringify(fen)}, depth: ${depth}, reqId: ${JSON.stringify(reqId)} })
          }));
          true;
        `;
        webviewRef.current?.injectJavaScript(js);
      });
    },
  }));

  return (
    <WebView
      ref={webviewRef}
      source={{ html: STOCKFISH_HTML }}
      onMessage={handleMessage}
      style={{ width: 0, height: 0, opacity: 0 }}
      javaScriptEnabled
      originWhitelist={['*']}
    />
  );
});

export default StockfishEngine;
