/* ═══════════════════════════════════════════════════════════
   browser-check.js — 진짜 브라우저에서 index.html 을 열어
   ① 그려지는지 ② 얼마나 걸리는지 ③ 콘솔 오류가 없는지 본다.

   check.js 는 얇은 DOM 이라 그리기를 못 본다. 이쪽이 눈이다.
   `node browser-check.js` · 그림도 남기려면 `node browser-check.js --shot`
   ═══════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const path = require('path');

const SHOT = process.argv.indexOf('--shot') >= 0;
const FILE = 'file://' + path.join(__dirname, 'index.html');

let fails = 0;
const ok  = (t)=> console.log('  \x1b[32m✓\x1b[0m ' + t);
const bad = (t)=>{ fails++; console.log('  \x1b[31m✗\x1b[0m ' + t); };
const assert = (c,t)=> c ? ok(t) : bad(t);

(async ()=>{
  // 이 상자에 깔린 크로미움을 그대로 쓴다 (playwright 가 따로 받지 않도록)
  const fs = require('fs');
  const EXE = '/opt/pw-browsers/chromium';
  const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
  const errors = [];

  for(const theme of ['light','dark']){
    const page = await browser.newPage({ colorScheme: theme, viewport:{width:1280, height:1000} });
    page.on('console', m=>{ if(m.type()==='error') errors.push(theme+': '+m.text()); });
    page.on('pageerror', e=>{ errors.push(theme+': '+e.message); });
    await page.goto(FILE);
    await page.evaluate(()=> localStorage.clear());
    await page.reload();

    console.log('\n\x1b[1m'+theme+' 화면\x1b[0m');

    // 예시 명단을 넣는다 — 사람이 누를 단추를 그대로 누른다
    await page.click('#b-demo');
    await page.waitForTimeout(300);

    const state = await page.evaluate(()=>{
      const C = window.__CHECK__;
      return {
        people: C.PEOPLE.length,
        sessions: C.S.sessions.length,
        teams: C.S.sessions.map(s=>(s.teams||[]).length),
        rooms: (C.S.rooms.list||[]).length,
        ms: C.LASTMS,
        genderCol: C.S.genderCol,
        headers: C.S.headers
      };
    });
    assert(state.people === 29, '예시 명단 29명을 읽었다 ('+state.people+')');
    assert(state.sessions === 4, '세션 4개가 생겼다');
    assert(state.teams.every(t=>t>0), '세션마다 조가 생겼다 ['+state.teams.join(',')+']');
    assert(state.rooms > 0, '방이 배정됐다 ('+state.rooms+'개)');
    assert(state.genderCol >= 0, '성별 열을 알아서 짚었다 ('+state.headers[state.genderCol]+')');

    // 화면에 진짜 글자가 찍혔나
    const seen = await page.evaluate(()=>({
      teamCards: document.querySelectorAll('#result-body .team').length,
      roomCards: document.querySelectorAll('#rooms-body .team').length,
      chips: document.querySelectorAll('#roster-body .chip').length,
      segs: document.querySelectorAll('#sess-body .seg').length,
      stats: document.querySelectorAll('#diag-body .stat').length,
      heat: document.querySelectorAll('#diag-body table.hm td.cell').length,
      hdr: document.getElementById('hdr-state').textContent
    }));
    assert(seen.teamCards > 0, '배정표가 그려졌다 (조 카드 '+seen.teamCards+'장)');
    assert(seen.roomCards > 0, '숙박표가 그려졌다 (방 카드 '+seen.roomCards+'장)');
    assert(seen.chips === 29, '참가자 칩 29개');
    assert(seen.segs > 0, '조건 고르는 단추가 그려졌다 ('+seen.segs+'개)');
    assert(seen.stats === 4, '진단 숫자판 4개');
    assert(seen.heat === 29*28, '만남 행렬이 29×28칸 ('+seen.heat+')');

    // 글자와 바탕이 붙어버리지 않았나 — 테마 사고의 전형
    const contrast = await page.evaluate(()=>{
      const lum = (c)=>{
        const m = c.match(/[\d.]+/g).map(Number);
        const f = (v)=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
        return 0.2126*f(m[0]) + 0.7152*f(m[1]) + 0.0722*f(m[2]);
      };
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      const out = [];
      for(const sel of ['.brand','.stat .v','.team li span','.rail a','.note','.pill']){
        const el = document.querySelector(sel);
        if(!el) continue;
        let bg = bodyBg, p = el;
        while(p){ const c = getComputedStyle(p).backgroundColor;
          if(c && c!=='rgba(0, 0, 0, 0)' && c!=='transparent'){ bg=c; break; } p=p.parentElement; }
        const a = lum(getComputedStyle(el).color), b = lum(bg);
        out.push({ sel, ratio: (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05) });
      }
      return { bodyBg, out };
    });
    assert(contrast.bodyBg !== 'rgba(0, 0, 0, 0)', 'body 에 바탕색이 칠해져 있다 ('+contrast.bodyBg+')');
    const worst = contrast.out.reduce((a,b)=> a.ratio<b.ratio?a:b);
    assert(worst.ratio >= 3.0, '가장 흐린 글자도 대비 '+worst.ratio.toFixed(1)+':1 ('+worst.sel+')');

    // 가로 스크롤이 생기지 않았나
    const overflow = await page.evaluate(()=> document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 1, '가로로 넘치지 않는다 ('+overflow+'px)');

    // 다시 셈하는 데 얼마나 걸리나 — 손댈 때마다 도는 값
    const times = await page.evaluate(()=>{
      const C = window.__CHECK__;
      const out = [];
      for(let i=0;i<3;i++){
        C.S.sessions.forEach(s=>{ s.seed = 1000+i*77; });
        const t0 = performance.now();
        C.recompute();
        out.push(performance.now()-t0);
      }
      return out;
    });
    const avg = times.reduce((a,b)=>a+b,0)/times.length;
    // 세션 넷 + 숙박을 통째로 다시 푸는 값이다. 손으로 느끼는 한계가 어디쯤인지로 잡는다.
    if(avg < 600) ok('다시 셈하는 데 평균 '+Math.round(avg)+'ms');
    else if(avg < 1000) console.log('  \x1b[33m!\x1b[0m 다시 셈하는 데 평균 '+Math.round(avg)+'ms — 조금 굼뜹니다');
    else bad('다시 셈하는 데 평균 '+Math.round(avg)+'ms — 손댈 때마다 기다리게 됩니다');

    // 세션이 여섯인 무거운 판
    const heavy = await page.evaluate(()=>{
      const C = window.__CHECK__;
      while(C.S.sessions.length < 6) C.S.sessions.push(C.newSession('추가'));
      const t0 = performance.now(); C.recompute(); return performance.now()-t0;
    });
    console.log('  · 세션 6개일 때 ' + Math.round(heavy) + 'ms');

    if(SHOT){
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({ path: path.join(__dirname, 'shot-'+theme+'.png'), fullPage:true });
      ok('그림을 남겼습니다: shot-'+theme+'.png');
    }
    await page.close();
  }

  await browser.close();
  console.log('\n' + '─'.repeat(52));
  if(errors.length){ errors.forEach(e=>bad('콘솔 오류 — '+e)); }
  else ok('콘솔 오류 없음');
  if(fails){ console.log('\x1b[31m'+fails+'군데 틀렸습니다\x1b[0m'); process.exit(1); }
  console.log('\x1b[32m다 지켜졌습니다\x1b[0m');
})();
