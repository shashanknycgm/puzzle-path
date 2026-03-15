import React, { useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';

export interface ChessEngineRef {
  evaluate: (fen: string, depth?: number) => Promise<{ bestMove: string; score: number }>;
}

type QItem = {
  id: string;
  fen: string;
  depth: number;
  resolve: (r: { bestMove: string; score: number }) => void;
  reject: (e: Error) => void;
};

/**
 * HTML page that runs chess.js 0.x + alpha-beta inside WKWebView.
 * WKWebView runs in a separate process on iOS — computation never blocks the RN JS thread.
 * Chess.js 0.10.3 is loaded from CDN (~85KB, cached after first load).
 */
const ENGINE_HTML = `<!DOCTYPE html><html><head>
<script>
var PVALS={p:100,n:320,b:330,r:500,q:900,k:0};

function mat(ch){
  var s=0,b=ch.board();
  for(var i=0;i<8;i++)for(var j=0;j<8;j++){var sq=b[i][j];if(sq)s+=sq.color==='w'?(PVALS[sq.type]||0):-(PVALS[sq.type]||0);}
  return s;
}

function ab(ch,d,a,b,max){
  if(d===0)return mat(ch);
  var mvs=ch.moves({verbose:true});
  if(!mvs.length){if(ch.in_checkmate())return max?-30000:30000;return 0;}
  mvs.sort(function(x,y){
    var xv=x.captured?(PVALS[x.captured]||0)-(PVALS[x.piece]||0)/10:-999;
    var yv=y.captured?(PVALS[y.captured]||0)-(PVALS[y.piece]||0)/10:-999;
    return yv-xv;
  });
  var best=max?-1e9:1e9;
  for(var i=0;i<mvs.length;i++){
    var m=mvs[i];
    ch.move({from:m.from,to:m.to,promotion:m.promotion});
    var v=ab(ch,d-1,a,b,!max);
    ch.undo();
    if(max){if(v>best)best=v;if(v>a)a=v;}
    else{if(v<best)best=v;if(v<b)b=v;}
    if(b<=a)break;
  }
  return best;
}

function evaluate(id,fen,depth){
  if(typeof Chess==='undefined'){send({type:'error',id:id,msg:'Chess not loaded'});return;}
  try{
    var ch=new Chess(fen);
    var mvs=ch.moves({verbose:true});
    if(!mvs.length){send({type:'result',id:id,bestMove:'',score:0});return;}
    mvs.sort(function(x,y){
      var xv=x.captured?(PVALS[x.captured]||0):-999;
      var yv=y.captured?(PVALS[y.captured]||0):-999;
      return yv-xv;
    });
    var isW=ch.turn()==='w',bm=mvs[0],bs=-1e9;
    for(var i=0;i<mvs.length;i++){
      var m=mvs[i];
      ch.move({from:m.from,to:m.to,promotion:m.promotion});
      var raw=ab(ch,depth-1,-1e9,1e9,!isW);
      ch.undo();
      var s=isW?raw:-raw;
      if(s>bs){bs=s;bm=m;}
    }
    send({type:'result',id:id,bestMove:bm.from+bm.to+(bm.promotion||''),score:isW?bs:-bs});
  }catch(e){send({type:'error',id:id,msg:String(e)});}
}

function send(obj){window.ReactNativeWebView.postMessage(JSON.stringify(obj));}

window.addEventListener('load',function(){
  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/chess.js@0.10.3/chess.min.js';
  s.onload=function(){send({type:'ready'});};
  s.onerror=function(){send({type:'error',id:'init',msg:'chess.js load failed'});};
  document.head.appendChild(s);
});
</script></head><body></body></html>`;

const ChessEngineWebView = forwardRef<ChessEngineRef>((_, ref) => {
  const webviewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const processingRef = useRef(false);
  const queueRef = useRef<QItem[]>([]);
  const pendingRef = useRef<Map<string, QItem>>(new Map());
  const counterRef = useRef(0);

  const processNext = useCallback(() => {
    if (processingRef.current || !readyRef.current || queueRef.current.length === 0) return;
    const item = queueRef.current.shift()!;
    processingRef.current = true;
    pendingRef.current.set(item.id, item);
    webviewRef.current?.injectJavaScript(
      `evaluate(${JSON.stringify(item.id)},${JSON.stringify(item.fen)},${item.depth});true;`
    );
  }, []);

  const evaluate = useCallback(
    (fen: string, depth = 8): Promise<{ bestMove: string; score: number }> => {
      const id = String(counterRef.current++);
      return new Promise((resolve, reject) => {
        queueRef.current.push({ id, fen, depth, resolve, reject });
        processNext();
      });
    },
    [processNext],
  );

  useImperativeHandle(ref, () => ({ evaluate }), [evaluate]);

  return (
    <View style={{ height: 0, width: 0, overflow: 'hidden' }}>
      <WebView
        ref={webviewRef}
        source={{ html: ENGINE_HTML }}
        javaScriptEnabled
        originWhitelist={['*']}
        style={{ height: 1, width: 1, opacity: 0 }}
        scrollEnabled={false}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'ready') {
              readyRef.current = true;
              processNext();
            } else if (data.type === 'result' || data.type === 'error') {
              const item = pendingRef.current.get(data.id);
              if (item) {
                pendingRef.current.delete(data.id);
                processingRef.current = false;
                if (data.type === 'result') {
                  item.resolve({ bestMove: data.bestMove, score: data.score });
                } else {
                  item.reject(new Error(data.msg));
                }
                processNext();
              }
            }
          } catch {}
        }}
      />
    </View>
  );
});

export default ChessEngineWebView;
