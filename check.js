/* ═══════════════════════════════════════════════════════════
   check.js — index.html 의 배정 엔진을 얇은 DOM 에 얹어 돌린다.
   `node check.js` 로 쓴다. 인자를 주면 판 수를 늘린다: `node check.js 40`

   불러오기만 확인하는 검사로는 "선언 전에 쓴 변수" 같은 것을 못 잡는다.
   여기서는 진짜 명단을 먹여 recompute() 를 끝까지 돌리고,
   나온 배정이 규칙을 지켰는지 하나하나 센다.
   ═══════════════════════════════════════════════════════════ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = SRC.match(/<script>([\s\S]*)<\/script>/);
if(!m){ console.error('index.html 안에서 <script> 를 찾지 못했습니다'); process.exit(1); }

/* ── 얇은 DOM: 무엇을 물어도 자리는 있고, 자식은 없다 ── */
function stubEl(){
  const el = {
    textContent:'', innerHTML:'', value:'', disabled:false, checked:false,
    style:new Proxy({}, {get:()=> '', set:()=>true}),
    dataset:{},
    classList:{ add(){}, remove(){}, toggle(){}, contains(){return false} },
    onclick:null, onchange:null,
    appendChild(){}, removeChild(){}, focus(){}, select(){}, scrollIntoView(){},
    addEventListener(){}, removeEventListener(){},
    getAttribute(){ return '#x'; },
    querySelectorAll(){ return []; },
    querySelector(){ return null; }
  };
  return el;
}
const listeners = {};
const document = {
  getElementById(){ return stubEl(); },
  querySelector(){ return stubEl(); },
  querySelectorAll(){ return []; },
  createElement(){ return stubEl(); },
  body: stubEl(),
  documentElement: stubEl(),
  addEventListener(k,f){ (listeners[k]=listeners[k]||[]).push(f); },
  execCommand(){ return true; }
};
const store = {};
const ctx = {
  document,
  window: { print(){}, clipboardData:null },
  navigator: { clipboard:null },
  localStorage: {
    getItem(k){ return k in store ? store[k] : null; },
    setItem(k,v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; }
  },
  performance: { now: ()=> Number(process.hrtime.bigint()/1000n)/1000 },
  IntersectionObserver: function(){ return { observe(){}, disconnect(){} }; },
  setTimeout, clearTimeout, console, Math, JSON, Number, String, Array, Object,
  Map, Set, Int32Array, Float64Array, isNaN, parseInt, parseFloat, Proxy
};
ctx.globalThis = ctx;
ctx.window.document = document;

vm.createContext(ctx);
try{ vm.runInContext(m[1], ctx, { filename:'index.html<script>' }); }
catch(e){ console.error('스크립트가 돌지 않습니다:\n' + (e && e.stack || e)); process.exit(1); }

const C = ctx.__CHECK__;
if(!C){ console.error('__CHECK__ 훅이 없습니다'); process.exit(1); }

/* ── 셈하기 도우미 ── */
let fails = 0, warns = 0;
const ok   = (t)=> console.log('  \x1b[32m✓\x1b[0m ' + t);
const bad  = (t)=>{ fails++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const warn = (t)=>{ warns++; console.log('  \x1b[33m!\x1b[0m ' + t); };
const assert = (cond, t)=> cond ? ok(t) : bad(t);

function rint(n){ return Math.floor(Math.random()*n); }

/* ── 명단 만들기: 판마다 인원·값이 달라진다 ── */
const NAMES_A = ['서연','지우','하은','수아','지아','유나','시은','예린','다인','채원','소율','민서','윤서','지윤','수빈','예은'];
const NAMES_B = ['도윤','시우','지호','준우','건우','현우','우진','정우','민준','예준','서준','유준','태현','승현','지훈','재윤','성민','동현','상현','기범'];
function makeRoster(nF, nM, nParty){
  const rows = [['이름','성별','소속','일행','개발경험','사전교육']];
  const orgs = ['가온','나루','다솜','라온','마루','한별','바다'];
  const all = [];
  for(let i=0;i<nF;i++) all.push([NAMES_A[i%NAMES_A.length]+(i>=NAMES_A.length?'2':''),'여']);
  for(let i=0;i<nM;i++) all.push([NAMES_B[i%NAMES_B.length]+(i>=NAMES_B.length?'2':''),'남']);
  for(const [nm,g] of all){
    rows.push([nm, g, orgs[rint(orgs.length)], '',
               Math.random()<0.4?'있음':'없음', Math.random()<0.7?'수료':'미수료']);
  }
  // 일행 묶음 — 2~3명씩
  const pool = [];
  for(let i=1;i<rows.length;i++) pool.push(i);
  for(let p=0;p<nParty;p++){
    const tag = 'P'+(p+1);
    const size = 2 + (Math.random()<0.3?1:0);
    for(let k=0;k<size && pool.length;k++){
      const idx = pool.splice(rint(pool.length),1)[0];
      rows[idx][3] = tag;
    }
  }
  return rows.map(r=>r.join('\t')).join('\n');
}

/* ── 한 판 검사 ── */
function runOne(label, opt){
  const S = C.blankState();
  C.S = S;
  C.takeTable(makeRoster(opt.nF, opt.nM, opt.nParty));
  const st = C.S;

  // 세션 짜기
  st.sessions = [];
  for(let i=0;i<opt.sessions;i++){
    const s = C.newSession('세션 '+(i+1));
    s.mode = 'size';
    s.size = opt.sizes[i % opt.sizes.length];
    s.meet = 3;
    st.sessions.push(s);
  }
  // 해커톤 세션 한 개: 개발경험·사전교육을 '필수' 로
  const hack = st.sessions[Math.min(2, st.sessions.length-1)];
  hack.name = '해커톤';
  const cols = C.attrCols();
  const devCol = st.headers.indexOf('개발경험');
  const eduCol = st.headers.indexOf('사전교육');
  hack.attrs[devCol] = { level:3, mode:'spread' };
  hack.attrs[eduCol] = { level:3, mode:'spread' };
  // 다른 세션은 소속을 '중요' 로
  const orgCol = st.headers.indexOf('소속');
  for(const s of st.sessions) if(s!==hack) s.attrs[orgCol] = { level:2, mode:'spread' };

  // 불참자
  const act0 = C.activeNames();
  for(let i=0;i<opt.absent;i++){
    const s = st.sessions[rint(st.sessions.length)];
    s.absent[act0[rint(act0.length)]] = true;
  }
  // 아예 안 오는 사람
  for(let i=0;i<opt.dropped;i++) st.out[act0[rint(act0.length)]] = true;

  // 강제 편성 방 하나
  if(opt.fixRoom){
    const a = C.activeNames();
    st.rooms.fixed = [[a[0], a[a.length-1]]];
  }

  C.recompute();

  const P = C.PEOPLE, PIDX = C.PIDX, MEET = C.MEET, NP = C.NP;
  const act = C.activeNames();
  const errs = [];

  /* 1. 세션마다 참석자가 빠짐없이 딱 한 조에 들었나 */
  for(const s of st.sessions){
    const want = C.attendees(s).slice().sort();
    const got = [].concat.apply([], s.teams||[]).slice().sort();
    if(want.length !== got.length) errs.push(s.name+': 인원 '+want.length+'명인데 배정 '+got.length+'명');
    else for(let i=0;i<want.length;i++) if(want[i]!==got[i]){ errs.push(s.name+': 배정 명단이 다릅니다'); break; }
    const seen = new Set();
    for(const g of (s.teams||[])) for(const n of g){
      if(seen.has(n)) errs.push(s.name+': '+n+' 이 두 조에 들었습니다');
      seen.add(n);
    }
    // 조 크기 차이는 1 이내
    const szs = (s.teams||[]).map(g=>g.length);
    if(szs.length && Math.max.apply(null,szs)-Math.min.apply(null,szs) > 1)
      errs.push(s.name+': 조 크기 차가 '+(Math.max.apply(null,szs)-Math.min.apply(null,szs)));
  }

  /* 2. 일행이 같은 조에 들지 않았나 (하드 제약) */
  let partyHit = 0;
  for(const s of st.sessions) for(const g of (s.teams||[])){
    for(let a=0;a<g.length;a++) for(let b=a+1;b<g.length;b++){
      const pa = P[PIDX.get(g[a])], pb = P[PIDX.get(g[b])];
      if(pa.party && pa.party===pb.party) partyHit++;
    }
  }

  /* 3. 숙박: 2인실인가 · 성별이 섞이지 않았나 · 빠짐없나 */
  const R = st.rooms;
  let roomErr = [];
  const inRoom = new Set();
  for(const r of (R.list||[])){
    for(const n of r.who){
      if(inRoom.has(n)) roomErr.push(n+' 이 두 방에 들었습니다');
      inRoom.add(n);
    }
    if(!r.fixed){
      const gs = new Set(r.who.map(n=>C.valOf(P[PIDX.get(n)], st.genderCol)));
      if(gs.size>1) roomErr.push('성별이 섞인 방: '+r.who.join(','));
      if(r.who.length>2 && R.odd!=='triple') roomErr.push('2인실이 아닌 방: '+r.who.join(','));
      if(r.who.length>3) roomErr.push('3인실보다 큰 방: '+r.who.join(','));
    }
  }
  for(const n of act) if(!R.absent[n] && !inRoom.has(n)) roomErr.push(n+' 이 어느 방에도 없습니다');
  // 강제 편성이 지켜졌나
  for(const fr of R.fixed){
    const found = (R.list||[]).some(r=>r.fixed && fr.every(n=>r.who.indexOf(n)>=0));
    if(fr.length && !found) roomErr.push('강제 편성이 깨졌습니다: '+fr.join(','));
  }

  /* 4. 해커톤에서 개발경험·사전교육이 고르게 나뉘었나 */
  const d = C.diagnose();
  const hrec = d.sessions.find(x=>x.name==='해커톤');
  let devDev = 0, eduDev = 0;
  if(hrec){
    for(const a of hrec.attrs){
      if(a.name==='개발경험') devDev = a.dev;
      if(a.name==='사전교육') eduDev = a.dev;
    }
  }

  /* 5. 만남 다양성 */
  const chance = d.chance.reduce((a,x)=>a+x.v,0);
  const distinct = d.distinct.reduce((a,x)=>a+x.v,0);
  const eff = chance ? distinct/chance : 0;
  const dv = d.distinct.map(x=>x.v).sort((a,b)=>a-b);
  // 만난 사람 수가 벌어지는 것은 대개 불참·조 크기 탓이지 배정 탓이 아니다.
  // 배정을 탓할 수 있는 것은 "같은 조에 앉고도 이미 아는 사람이었다"뿐이다.
  const chMap = new Map(d.chance.map(x=>[x.name,x.v]));
  let worstDup = 0, worstWho = '';
  for(const x of d.distinct){
    const dup = (chMap.get(x.name)||0) - x.v;
    if(dup > worstDup){ worstDup = dup; worstWho = x.name; }
  }
  // 기회(같은 조에 앉은 자리)가 고른가 — 이건 배정이 손댈 수 있다
  const cv = d.chance.map(x=>x.v).sort((a,b)=>a-b);
  const chGap = cv.length ? cv[cv.length-1] - cv[0] : 0;

  console.log('\n\x1b[1m'+label+'\x1b[0m  '
    + act.length+'명 · 세션 '+st.sessions.length+'개 · '
    + Math.round(C.LASTMS)+'ms');

  assert(errs.length===0, '배정이 빠짐없고 겹치지 않는다' + (errs.length?' → '+errs.slice(0,3).join(' / '):''));
  assert(partyHit===0, '일행이 같은 조에 들지 않았다' + (partyHit?' → '+partyHit+'쌍':''));
  assert(roomErr.length===0, '숙박이 2인실·동성·빠짐없다' + (roomErr.length?' → '+roomErr.slice(0,3).join(' / '):''));
  assert(devDev < 1.0, '해커톤 개발경험 편차 ±'+devDev.toFixed(2)+' < 1.0');
  assert(eduDev < 1.0, '해커톤 사전교육 편차 ±'+eduDev.toFixed(2)+' < 1.0');
  if(eff >= 0.95) ok('겹치지 않은 정도 '+(eff*100).toFixed(1)+'%');
  else if(eff >= 0.85) warn('겹치지 않은 정도 '+(eff*100).toFixed(1)+'% (85~95%)');
  else bad('겹치지 않은 정도 '+(eff*100).toFixed(1)+'% — 너무 겹칩니다');
  if(worstDup <= 2) ok('가장 많이 겹친 사람도 '+worstDup+'번 (' + (worstWho||'—') + ')');
  else warn('한 사람이 '+worstDup+'번 겹쳤습니다 ('+worstWho+')');
  if(chGap <= 4) ok('같은 조에 앉은 자리 수가 고르다 ('+cv[0]+'~'+cv[cv.length-1]+'자리)');
  else warn('같은 조 자리가 '+cv[0]+'~'+cv[cv.length-1]+'자리로 벌어졌습니다 — 불참·조 크기 탓일 수 있습니다');
  console.log('    만난 사람 '+dv[0]+'~'+dv[dv.length-1]+'명');

  return { ms: C.LASTMS, eff, worstDup, chGap };
}

/* ── 결정론 검사: 같은 씨앗이면 같은 결과 ── */
function runDeterminism(){
  console.log('\n\x1b[1m같은 씨앗이면 같은 배정\x1b[0m');
  const roster = makeRoster(12, 18, 3);
  const snap = ()=>{
    C.S = C.blankState();
    C.takeTable(roster);
    const st = C.S;
    st.sessions = [];
    for(let i=0;i<4;i++){ const s = C.newSession('세션'+i); s.seed = 5000+i; s.size = 5; st.sessions.push(s); }
    st.rooms.seed = 77;
    C.recompute();
    return JSON.stringify(st.sessions.map(s=>s.teams)) + '|' + JSON.stringify((st.rooms.list||[]).map(r=>r.who));
  };
  const a = snap(), b = snap();
  assert(a===b, '두 번 돌려도 같다');
}

/* ── 확정(lock) 검사 ── */
function runLock(){
  console.log('\n\x1b[1m확정한 세션은 손대지 않는다\x1b[0m');
  C.S = C.blankState();
  C.takeTable(makeRoster(12, 18, 2));
  const st = C.S;
  st.sessions = [];
  for(let i=0;i<4;i++){ const s = C.newSession('세션'+i); s.size = 5; st.sessions.push(s); }
  C.recompute();
  const frozen = JSON.stringify(st.sessions[0].teams);
  st.sessions[0].locked = true;
  for(let i=1;i<4;i++) st.sessions[i].seed = Math.floor(Math.random()*1e6);
  C.recompute();
  assert(JSON.stringify(st.sessions[0].teams)===frozen, '확정한 세션이 그대로다');
}

/* ── 결과 복사 검사 ── */
function runTSV(){
  console.log('\n\x1b[1m결과를 시트로 되돌릴 수 있다\x1b[0m');
  C.S = C.blankState();
  C.takeTable(makeRoster(10, 14, 2));
  const st = C.S;
  st.sessions = [C.newSession('A'), C.newSession('B')];
  st.sessions.forEach(s=>s.size=4);
  C.recompute();
  const tsv = C.resultTSV();
  const lines = tsv.split('\n');
  const want = C.activeNames().length + 1;
  assert(lines.length===want, '줄 수가 사람 수 + 머리 한 줄 ('+lines.length+'/'+want+')');
  const w = lines[0].split('\t').length;
  assert(lines.every(l=>l.split('\t').length===w), '모든 줄의 칸 수가 같다');
  assert(lines[0].indexOf('숙박')>=0, '숙박 열이 있다');
}

/* ── 홀수 인원 검사 ── */
function runOdd(){
  console.log('\n\x1b[1m홀수가 남을 때\x1b[0m');
  for(const mode of ['single','triple']){
    C.S = C.blankState();
    C.takeTable(makeRoster(11, 13, 0));   // 둘 다 홀수
    const st = C.S;
    st.sessions = [C.newSession('A')];
    st.rooms.odd = mode;
    C.recompute();
    const list = st.rooms.list || [];
    const sizes = list.filter(r=>!r.fixed).map(r=>r.who.length).sort();
    const total = sizes.reduce((a,b)=>a+b,0);
    const ones = sizes.filter(x=>x===1).length, threes = sizes.filter(x=>x===3).length;
    assert(total===C.activeNames().length, mode+': 모두 방에 들었다 ('+total+'/'+C.activeNames().length+')');
    if(mode==='single') assert(ones===2 && threes===0, 'single: 1인실 2개 (남·여 각 하나), 3인실 0개 — '+ones+'/'+threes);
    else assert(threes===2 && ones===0, 'triple: 3인실 2개, 1인실 0개 — '+threes+'/'+ones);
  }
}

/* ── 조 크기로 메우기: 방향은 맞되 한 조에 몰리지 않아야 한다 ── */
function runBias(){
  console.log('\n\x1b[1m불리한 사람은 큰 조로, 그러나 몰리지 않게\x1b[0m');
  let big = 0, small = 0, piled = 0, rounds = 12;
  for(let t=0;t<rounds;t++){
    C.S = C.blankState();
    C.takeTable(makeRoster(12, 17, 0));          // 29명 → 6조 (5,5,5,5,5,4)
    const st = C.S;
    st.sessions = [C.newSession('해커톤')];
    st.sessions[0].size = 5;
    C.autoDefaults();                             // 해커톤 기본값(조건·유불리)을 들여온다
    C.recompute();
    const s = st.sessions[0];
    if(t===0) assert(C.hasBias(s), '해커톤에 유·불리가 자동으로 붙었다');
    const names = C.attendees(s);
    const lack = (n)=> C.valOf(C.PEOPLE[C.PIDX.get(n)], st.headers.indexOf('개발경험')) === '없음';
    const tot = names.filter(lack).length;
    // 조 크기별 불리 밀도
    const rows = s.teams.map(g=>({ L:g.length, k:g.filter(lack).length }));
    const maxL = Math.max.apply(null, rows.map(r=>r.L));
    const minL = Math.min.apply(null, rows.map(r=>r.L));
    if(maxL!==minL){
      const dBig = rows.filter(r=>r.L===maxL).reduce((a,r)=>a+r.k,0) / rows.filter(r=>r.L===maxL).length;
      const dSml = rows.filter(r=>r.L===minL).reduce((a,r)=>a+r.k,0) / rows.filter(r=>r.L===minL).length;
      if(dBig > dSml) big++; else if(dBig < dSml) small++;
    }
    // 몰림: 어느 조든 비례 몫보다 1.25명 넘게 많으면 안 된다
    for(const r of rows){
      if(r.k - tot*r.L/names.length > 1.25) piled++;
    }
  }
  assert(piled===0, '어느 조에도 불리한 사람이 몰리지 않았다 (몰린 조 '+piled+'개)');
  if(big >= small) ok('큰 조에 불리한 사람이 더 많다 ('+big+'판 : 작은 조 쪽 '+small+'판)');
  else bad('방향이 거꾸로다 — 작은 조에 더 많다 ('+small+'판 : 큰 조 쪽 '+big+'판)');

  // 기본값이 제 세션에만 붙는가
  C.S = C.blankState();
  C.takeTable(makeRoster(12, 17, 0));            // seedSessions → 세션1·2·해커톤·세션4
  const st2 = C.S;
  const hack = st2.sessions.find(s=>s.name==='해커톤');
  const plain = st2.sessions.find(s=>s.name==='세션 1');
  const dev = st2.headers.indexOf('개발경험'), edu = st2.headers.indexOf('사전교육');
  assert(C.hasBias(hack) && !C.hasBias(plain), '유·불리는 해커톤에만 붙는다');
  assert((hack.attrs[dev]||{}).level===3, '해커톤에서 개발경험이 필수다');
  assert(!(plain.attrs[dev]||{}).level, '다른 세션에서는 개발경험을 안 본다');
  assert((plain.attrs[edu]||{}).level===3, '사전교육은 모든 세션에서 필수다 (일행 = 미수료)');
  assert(hack.bias[dev+':없음']===1 && hack.bias[dev+':있음']===-1, '없음=큰 조 · 있음=작은 조');

  // 시트가 O / X 로 적혀 있어도 알아본다
  const marks = [['O','X'], ['○','×'], ['가능','불가'], ['수료','미수료']];
  for(const [yes,no] of marks){
    const rows = [['이름','성별','코딩 가능 여부','사전교육']];
    for(let i=0;i<24;i++) rows.push([NAMES_B[i%NAMES_B.length]+(i>=NAMES_B.length?'2':''),
      i%2?'남':'여', i%3?yes:no, i%4?'수료':'미수료']);
    C.S = C.blankState();
    C.takeTable(rows.map(r=>r.join('\t')).join('\n'));
    const s = C.S.sessions.find(x=>x.name==='해커톤');
    const ci = C.S.headers.indexOf('코딩 가능 여부');
    assert(s.bias[ci+':'+no]===1 && s.bias[ci+':'+yes]===-1,
      '"'+yes+'/'+no+'" 를 알아본다 — '+no+'가 큰 조로');
  }

  // O/X 명단으로도 방향과 몰림을 확인한다
  const rows = [['이름','성별','코딩 가능 여부']];
  for(let i=0;i<29;i++) rows.push([NAMES_B[i%NAMES_B.length]+(i>=NAMES_B.length?'2':''),
    i%2?'남':'여', Math.random()<0.45?'O':'X']);
  C.S = C.blankState();
  C.takeTable(rows.map(r=>r.join('\t')).join('\n'));
  const st3 = C.S;
  st3.sessions = st3.sessions.filter(s=>s.name==='해커톤');
  st3.sessions[0].size = 5;
  C.recompute();
  const s3 = st3.sessions[0], nm3 = C.attendees(s3);
  const ci3 = st3.headers.indexOf('코딩 가능 여부');
  const isX = (n)=> C.valOf(C.PEOPLE[C.PIDX.get(n)], ci3)==='X';
  const totX = nm3.filter(isX).length;
  let over = 0; const bigT = [], smallT = [];
  const Ls = s3.teams.map(g=>g.length), mx = Math.max.apply(null,Ls), mn = Math.min.apply(null,Ls);
  for(const g of s3.teams){
    const k = g.filter(isX).length;
    if(k - totX*g.length/nm3.length > 1.25) over++;
    if(g.length===mx) bigT.push(k); else if(g.length===mn) smallT.push(k);
  }
  const avg = (a)=> a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
  assert(over===0, 'O/X 명단에서도 X 가 한 조에 몰리지 않는다');
  assert(mx===mn || avg(bigT) >= avg(smallT),
    'X 는 큰 조 쪽에 더 많다 ('+mx+'명 조 평균 '+avg(bigT).toFixed(1)+' · '+mn+'명 조 평균 '+avg(smallT).toFixed(1)+')');
}

/* ── 돌리기 ── */
const N = Math.max(1, parseInt(process.argv[2] || '6', 10));
console.log('\x1b[1m만남 배분기 검사\x1b[0m  — ' + N + '판\n' + '─'.repeat(52));

const plans = [
  { label:'30명 · 세션 4개 · 5인조',      nF:12, nM:18, nParty:3, sessions:4, sizes:[5],       absent:0, dropped:0, fixRoom:true },
  { label:'30명 · 세션 3개 · 조 크기 섞음', nF:13, nM:17, nParty:4, sessions:3, sizes:[4,5,6],  absent:0, dropped:0, fixRoom:true },
  { label:'불참·이탈이 있는 판',           nF:12, nM:18, nParty:3, sessions:4, sizes:[5],       absent:5, dropped:2, fixRoom:true },
  { label:'작은 판 20명',                 nF:9,  nM:11, nParty:2, sessions:4, sizes:[4],       absent:1, dropped:0, fixRoom:false },
  { label:'큰 판 44명',                   nF:20, nM:24, nParty:5, sessions:4, sizes:[5],       absent:2, dropped:1, fixRoom:true },
  { label:'세션이 많은 판 6개',            nF:12, nM:18, nParty:3, sessions:6, sizes:[5],       absent:0, dropped:0, fixRoom:false }
];
const times = [];
for(let i=0;i<N;i++){
  const p = plans[i % plans.length];
  const r = runOne('['+(i+1)+'] '+p.label, p);
  times.push(r.ms);
}
runDeterminism();
runLock();
runTSV();
runOdd();
runBias();

console.log('\n' + '─'.repeat(52));
const slow = Math.max.apply(null, times);
console.log('가장 오래 걸린 판: ' + Math.round(slow) + 'ms'
  + '  \x1b[2m(vm 샌드박스라 실제보다 대여섯 배 느립니다 — 진짜 값은 browser-check.js)\x1b[0m');
if(fails){ console.log('\x1b[31m' + fails + '군데 틀렸습니다\x1b[0m' + (warns?' · 눈여겨볼 것 '+warns+'개':'')); process.exit(1); }
console.log('\x1b[32m다 지켜졌습니다\x1b[0m' + (warns?' · 눈여겨볼 것 '+warns+'개':''));
