import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import WebView from 'react-native-webview';
import { Chess } from 'chess.js';

const BOARD_SIZE = Dimensions.get('window').width - 16;

// Lichess cburnett piece set — same pieces shown on lichess.org
const PIECE_BASE = 'https://lichess1.org/assets/piece/cburnett';

export type MoveInfo = { from: string; to: string; promotion?: string };

interface Props {
  fen: string;
  onMove?: (info: MoveInfo) => void;
  gestureEnabled?: boolean;
  highlightSquares?: { from: string; to: string };
  flipped?: boolean;
}

function buildHTML(
  fen: string,
  gestureEnabled: boolean,
  legalMoves: { from: string; to: string }[],
  hl?: { from: string; to: string },
  flipped = false
): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;}
html,body{width:100%;height:100%;overflow:hidden;}
#b{display:grid;grid-template-columns:repeat(8,12.5%);width:100vw;height:100vw;}
.s{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;}
.pi{width:100%;height:100%;object-fit:contain;pointer-events:none;display:block;}
.dot{width:30%;height:30%;background:rgba(0,0,0,0.22);border-radius:50%;z-index:1;}
.ring{position:absolute;inset:0;border:min(7px,1.6vw) solid rgba(0,0,0,0.28);border-radius:50%;z-index:2;pointer-events:none;}
</style>
</head>
<body>
<div id="b"></div>
<script>
// F/R are the canonical board-array axes (never change)
const F='abcdefgh'.split('');
const R='87654321'.split(''); // R[0]='8' → board[0] = rank 8
const BASE=${JSON.stringify(PIECE_BASE)};
const fen=${JSON.stringify(fen)};
const ge=${gestureEnabled};
const lm=${JSON.stringify(legalMoves)};
const hl=${JSON.stringify(hl ?? null)};
const flipped=${flipped};
const turn=fen.split(' ')[1]||'w';

// Display order depends on orientation
const dRanks=flipped?['1','2','3','4','5','6','7','8']:['8','7','6','5','4','3','2','1'];
const dFiles=flipped?['h','g','f','e','d','c','b','a']:['a','b','c','d','e','f','g','h'];

function parseFen(f){
  return f.split(' ')[0].split('/').map(row=>{
    const r=[];
    for(const c of row){
      if(isNaN(c)) r.push(c);
      else for(let i=0;i<+c;i++) r.push(null);
    }
    return r;
  });
}
const board=parseFen(fen);
let sel=null;

function tgts(from){return lm.filter(m=>m.from===from).map(m=>m.to);}

function pieceUrl(pc){
  const isW=pc>='A'&&pc<='Z';
  return BASE+'/'+(isW?'w':'b')+pc.toUpperCase()+'.svg';
}

function render(){
  const b=document.getElementById('b');
  b.innerHTML='';
  dRanks.forEach((rank)=>{
    dFiles.forEach((file)=>{
      const sq=file+rank;
      // Use canonical indices for board lookup and square-color math
      const fi=F.indexOf(file);
      const ri=R.indexOf(rank);
      const light=(fi+ri)%2===0;
      const pc=board[ri][fi];
      const isSel=sel===sq;
      const ts=sel?tgts(sel):[];
      const isTgt=ts.includes(sq);
      const isHlF=hl&&hl.from===sq;
      const isHlT=hl&&hl.to===sq;

      let bg=light?'#f0d9b5':'#b58863';
      if(isSel) bg='#f6f669';
      else if(isTgt) bg=light?'#cdd26a':'#aaa23a';
      else if(isHlT) bg='#e8943a';
      else if(isHlF) bg='#f7c25e';

      const d=document.createElement('div');
      d.className='s';
      d.style.background=bg;

      if(pc){
        const img=document.createElement('img');
        img.className='pi';
        img.src=pieceUrl(pc);
        d.appendChild(img);
        if(isTgt){
          const rg=document.createElement('div');
          rg.className='ring';
          d.appendChild(rg);
        }
      } else if(isTgt){
        const dot=document.createElement('div');
        dot.className='dot';
        d.appendChild(dot);
      }

      d.onclick=()=>tap(sq);
      b.appendChild(d);
    });
  });
}

function tap(sq){
  if(!ge) return;
  const fi=F.indexOf(sq[0]),ri=R.indexOf(sq[1]);
  const pc=board[ri][fi];
  const isW=pc&&pc>='A'&&pc<='Z';
  const isB=pc&&pc>='a'&&pc<='z';
  const mine=(turn==='w'&&isW)||(turn==='b'&&isB);

  if(sel){
    const ts=tgts(sel);
    if(ts.includes(sq)){
      try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'move',from:sel,to:sq}));}catch(e){}
      sel=null;render();return;
    }
  }
  sel=(pc&&mine)?sq:null;
  render();
}

render();
</script>
</body>
</html>`;
}

export default function ChessBoard({ fen, onMove, gestureEnabled = true, highlightSquares, flipped = false }: Props) {
  const legalMoves = React.useMemo(() => {
    try {
      const chess = new Chess(fen);
      return chess.moves({ verbose: true }).map((m: any) => ({ from: m.from, to: m.to }));
    } catch {
      return [];
    }
  }, [fen]);

  const html = buildHTML(fen, gestureEnabled, legalMoves, highlightSquares, flipped);

  return (
    <View style={styles.container}>
      <WebView
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={(e) => {
          try {
            const data = JSON.parse(e.nativeEvent.data);
            if (data.type === 'move') {
              onMove?.({ from: data.from, to: data.to });
            }
          } catch {}
        }}
        originWhitelist={['*']}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: BOARD_SIZE, height: BOARD_SIZE },
  webview: { flex: 1 },
});
