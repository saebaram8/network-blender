/* ═══════════════════════════════════════════════════════════
   build-artifact.js — claude.ai 에 올릴 판을 만든다.

   두 가지를 한다.
   ① index.html 을 base64 로 페이지 안에 품게 한다(`mixer-tpl`).
      그러면 '온라인 저장' 이 통신 없이 제 소스를 얻는다 —
      fetch 가 막히는 뷰어에서도 된다.
   ② 이미 올라가 있는 판에서 저장 덩이(`mixer-state`)를 옮겨 담는다.
      이걸 안 하면 내가 배포할 때마다 사람이 저장해 둔 것이 날아간다.

   쓰기:
     node build-artifact.js                       # 저장 덩이 없이
     node build-artifact.js 내려받은판.html        # 그 판의 저장 덩이를 이어받아
   ═══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const b64 = Buffer.from(app, 'utf8').toString('base64');

let state = '';
const prev = process.argv[2];
if(prev){
  const html = fs.readFileSync(prev, 'utf8');
  // 진짜 저장 덩이만 집는다 — 소스 안의 정규식·템플릿 문자열이 아니라
  const m = html.match(/<script id="mixer-state" type="application\/json">([\s\S]*?)<\/script>/);
  if(m && m[1].trim().startsWith('{')){
    try{
      const o = JSON.parse(m[1]);
      const n = (o.rows || []).length;
      state = '<script id="mixer-state" type="application/json">' + m[1] + '<' + '/script>';
      console.log('이어받은 저장본: ' + n + '명' + (o.savedAt ? ' · ' + o.savedAt : ''));
    }catch(e){ console.log('저장 덩이를 읽지 못했습니다 — 없이 갑니다'); }
  } else {
    console.log('그 판에는 저장 덩이가 없습니다 — 없이 갑니다');
  }
}

const out = '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<title>만남 배분기</title></head>\n<body>\n'
  // 덩이는 앱보다 **앞**에 둔다 — 뒤에 두면 boot() 이 돌 때 파서가 아직 안 만들어서 못 읽는다
  + (state ? state + '\n' : '')
  + '<script id="mixer-tpl" type="text/plain">' + b64 + '<' + '/script>\n'
  + app + '\n'
  + '</body></html>';

const dst = path.join(__dirname, 'artifact.html');
fs.writeFileSync(dst, out);
console.log('만들었습니다: artifact.html  ' + Math.round(out.length/1024) + 'KB'
  + ' (품은 소스 ' + Math.round(app.length/1024) + 'KB)');
