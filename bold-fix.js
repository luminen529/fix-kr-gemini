// Gemini Bold Fixer
// 답변이 다 그려진 뒤(스트리밍이 끝나고 일정 시간 DOM 변화가 없을 때) 텍스트에 그대로 드러난 **굵게** / *기울임* 마커만 찾아 정리한다.
// 정상 렌더링된 볼드는 이미 <b>/<strong>이라 텍스트에 별표가 없으므로 건드리지 않는다.
(() => {
  'use strict';

  // true: 깨진 **텍스트**를 실제 굵은 글씨로 바꿈 / false: 별표만 제거
  const RENDER = true;
  // 이 시간(ms) 동안 변화가 없으면 답변 완료로 간주
  const QUIET_MS = 800;
  // 스트리밍 중인 답변 (Gemini는 생성이 끝날 때까지 .markdown에 aria-busy="true"를 단다)
  const BUSY = '[aria-busy="true"]';
  // 설치·업데이트 직후 background.js가 열린 탭에 다시 주입하면 이전 인스턴스를 정리한다
  const INSTANCE_EVENT = 'fix-kr-gemini:bold-fix';

  // 모델 답변 컨테이너 (Gemini, Gemini Notebook). 못 찾으면 <main>으로 대체.
  const RESPONSE = [
    'message-content',
    '.model-response-text',
    '.markdown',
    '.to-user-container',
    '.message-text-content',
    '.summary-content',
  ].join(',');
  // 아예 건드리지 않는 영역: 입력창, 사용자 질문, 코드 블록 등
  const SKIP = [
    'pre', 'textarea', 'input', 'script', 'style', 'svg',
    '[contenteditable=""]', '[contenteditable="true"]',
    'user-query', '.user-query-container', '.query-text', '.from-user-container',
    '.from-user-message-card-content',
  ].join(',');
  // 문단 내부지만 별표를 검사하지 않는 인라인 요소: 인라인 코드, 수식
  const ATOM = 'code, kbd, samp, math, .katex, .math-inline, mjx-container';

  const OBJ = '￼'; // ATOM 자리 표시용 문자
  // ***x***, **x**, *x*: 여는 마커 앞은 영숫자·별표·역슬래시가 아니고, 마커 안쪽은 공백이 아님
  const MARK_RE = /(?<![\w*\\])(\*{1,3})(?=[^\s*])([\s\S]*?[^\s*\\])\1(?!\*)/g;

  // root 아래 텍스트를 블록(문단) 단위의 "런"으로 나눈다. 런 = 텍스트 노드/ATOM 요소 배열
  function collectRuns(root) {
    const runs = [];
    let cur = [];
    const flush = () => { if (cur.length) runs.push(cur); cur = []; };
    (function walk(node) {
      for (let n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) { cur.push(n); continue; }
        if (n.nodeType !== 1) continue;
        if (n.matches(SKIP)) { flush(); continue; }
        if (n.matches(ATOM)) { cur.push(n); continue; }
        if (n.tagName === 'BR') { flush(); continue; }
        const block = !getComputedStyle(n).display.startsWith('inline');
        if (block) flush();
        walk(n);
        if (block) flush();
      }
    })(root);
    flush();
    return runs;
  }

  function fixRun(run) {
    let s = '';
    const starts = [];
    for (const n of run) {
      starts.push(s.length);
      s += n.nodeType === 3 ? n.nodeValue : OBJ;
    }
    if (!s.includes('*')) return false;

    const found = [];
    for (const m of s.matchAll(MARK_RE)) {
      const len = m[1].length;
      const end = m.index + m[0].length;
      // *기울임*은 오탐 위험이 커서 더 보수적으로: 한 줄 안, 닫는 마커 뒤 영숫자 없음
      if (len === 1 && (/\n/.test(m[2]) || /\w/.test(s[end] || ''))) continue;
      found.push({ open: m.index, close: end - len, len });
    }
    if (!found.length) return false;

    const locate = (i) => {
      let k = starts.length - 1;
      while (starts[k] > i) k--;
      return [run[k], i - starts[k]];
    };

    // 뒤에서부터 처리해야 앞쪽 인덱스가 유지된다 (Range 추출 시 원본 노드는 앞부분을 유지)
    for (const { open, close, len } of found.reverse()) {
      const [sNode, sOff] = locate(open);
      const [eNode, eOff] = locate(close);
      eNode.deleteData(eOff, len);
      sNode.deleteData(sOff, len);
      if (!RENDER) continue;
      const range = document.createRange();
      range.setStart(sNode, sOff);
      range.setEnd(eNode, sNode === eNode ? eOff - len : eOff);
      // Gemini 렌더러와 같은 태그(<b>, <i>)를 써서 원래 스타일을 그대로 받는다
      const outer = document.createElement(len === 1 ? 'i' : 'b');
      let inner = outer;
      if (len === 3) inner = outer.appendChild(document.createElement('i'));
      inner.appendChild(range.extractContents());
      range.insertNode(outer);
    }
    return true;
  }

  function fixRoot(root) {
    if (!root.isConnected || !root.textContent.includes('*')) return;
    // 중첩 마커(*a **b** c*) 대비 몇 번 반복
    for (let i = 0; i < 3; i++) {
      let changed = false;
      for (const run of collectRuns(root)) changed = fixRun(run) || changed;
      if (!changed) break;
    }
  }

  // 답변(root)별로 마지막 변경 시각을 기록하고, QUIET_MS 동안 조용해진 것만 처리
  const pending = new Map();
  let timer = 0;

  function rootOf(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || el.closest(SKIP)) return null;
    // 가장 바깥쪽 답변 컨테이너를 root로 (중첩된 선택자 중복 처리 방지)
    let root = null;
    for (let e = el.closest(RESPONSE); e; e = e.parentElement && e.parentElement.closest(RESPONSE)) root = e;
    if (root) return root;
    // 답변 컨테이너를 아는 페이지에서는 그 밖(입력창 주변 UI 등)의 변화로 <main> 전체를 훑지 않는다
    return document.querySelector(RESPONSE) ? null : el.closest('main');
  }

  function tick() {
    timer = 0;
    const now = performance.now();
    let wait = Infinity;
    for (const [root, t] of pending) {
      let left = t + QUIET_MS - now;
      // 생성 중에 잠깐 멈춘 경우: 렌더러가 아직 노드를 고치는 중이므로 끝날 때까지 미룬다
      if (left <= 0 && root.isConnected && (root.matches(BUSY) || root.querySelector(BUSY))) {
        pending.set(root, now);
        left = QUIET_MS;
      }
      if (left > 0) { wait = Math.min(wait, left); continue; }
      pending.delete(root);
      fixRoot(root);
    }
    observer.takeRecords(); // 우리가 만든 변경은 다시 감지하지 않음
    if (wait !== Infinity) timer = setTimeout(tick, wait);
  }

  function mark(root) {
    pending.set(root, performance.now());
    if (!timer) timer = setTimeout(tick, QUIET_MS);
  }

  const observer = new MutationObserver((records) => {
    // 확장 프로그램이 꺼지거나 삭제되면 남겨진 스크립트는 runtime id를 잃는다
    if (!globalThis.chrome?.runtime?.id) return stop();
    for (const r of records) {
      const root = rootOf(r.target);
      if (root) { mark(root); continue; }
      // 대화 전환 등으로 답변 컨테이너가 통째로 삽입된 경우: target은 컨테이너 바깥이다
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        for (const el of n.matches(RESPONSE) ? [n] : n.querySelectorAll(RESPONSE)) {
          const added = rootOf(el);
          if (added) mark(added);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  function stop() {
    observer.disconnect();
    clearTimeout(timer);
    timer = 0;
    pending.clear();
  }

  document.dispatchEvent(new Event(INSTANCE_EVENT));
  document.addEventListener(INSTANCE_EVENT, stop, { once: true });

  // 이미 로드된 대화
  document.querySelectorAll(RESPONSE).forEach((el) => { const root = rootOf(el); if (root) mark(root); });
})();
