const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

const source = readFileSync(require('node:path').join(__dirname, '../content.js'), 'utf8');

function setup() {
  const listeners = {};
  const timers = new Map();
  let timerId = 0;
  let clicks = 0;
  class Element {
    isConnected = true;
    textContent = '안녕';
    closest() { return this; }
  }
  const editor = new Element();
  const button = {
    disabled: false,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ width: 30, height: 30 }),
    click: () => { clicks++; },
  };
  runInNewContext(source, {
    Element, Date,
    window: { addEventListener: (type, handler) => { listeners[type] = handler; } },
    document: { querySelectorAll: () => [button] },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  });
  return {
    editor, button,
    get clicks() { return clicks; },
    emit(type, props = {}) {
      const event = {
        target: editor, key: '', code: '', keyCode: 0, isComposing: false,
        stopped: false, defaultPrevented: false,
        stopImmediatePropagation() { this.stopped = true; },
        preventDefault() { this.defaultPrevented = true; },
        ...props,
      };
      listeners[type](event);
      return event;
    },
    flush() {
      const queued = [...timers.values()];
      timers.clear();
      queued.forEach(fn => fn());
    },
  };
}

for (const [name, key, code] of [
  ['macOS Enter', 'Enter', 'Enter'],
  ['Windows Process', 'Process', 'Enter'],
  ['Windows numpad', 'Process', 'NumpadEnter'],
  ['unidentified physical Enter', 'Unidentified', 'Enter'],
  ['logical Enter without physical code', 'Enter', ''],
]) {
  test(`${name}: wait for commit and send once`, () => {
    const s = setup();
    s.emit('compositionstart');
    const event = s.emit('keydown', { key, code, keyCode: 229, isComposing: true });
    assert.equal(event.defaultPrevented, false, 'IME must be able to commit');
    assert.equal(event.stopped, true, 'Gemini must not also handle this keydown');
    s.flush();
    assert.equal(s.clicks, 0);
    s.emit('compositionend', { data: '녕' });
    s.emit('keyup', { key: 'Enter', code });
    s.flush();
    assert.equal(s.clicks, 1);
    s.emit('keyup', { key: 'Enter', code });
    s.flush();
    assert.equal(s.clicks, 1);
  });
}

test('compositionend before keydown still sends using the IME flag or 229', () => {
  for (const signal of [{ keyCode: 229 }, { isComposing: true }]) {
    const s = setup();
    s.emit('compositionstart');
    s.emit('compositionend', { data: '녕' });
    s.emit('keydown', { key: 'Process', code: 'Enter', ...signal });
    s.flush();
    assert.equal(s.clicks, 1);
  }
});

test('ordinary Enter, modifiers, repeats and other IME keys retain native behavior', () => {
  for (const props of [
    { key: 'Enter', code: 'Enter' },
    ...['shiftKey', 'ctrlKey', 'metaKey', 'altKey', 'repeat'].map(flag =>
      ({ key: 'Process', code: 'Enter', keyCode: 229, [flag]: true })),
    { key: 'Process', code: 'KeyA', keyCode: 229 },
    { key: 'Unidentified', code: '', keyCode: 229 },
  ]) {
    const s = setup();
    const event = s.emit('keydown', props);
    s.emit('compositionend', { data: '녕' });
    s.flush();
    assert.equal(event.stopped, false);
    assert.equal(event.defaultPrevented, false);
    assert.equal(s.clicks, 0);
  }
});

test('cancelled composition, Escape, empty or detached editor and disabled button do not send', () => {
  for (const reason of ['cancel', 'escape', 'empty', 'detached', 'disabled']) {
    const s = setup();
    s.emit('compositionstart');
    s.emit('keydown', { key: 'Process', code: 'Enter', keyCode: 229 });
    s.emit('compositionend', { data: reason === 'cancel' ? '' : '녕' });
    if (reason === 'escape') s.emit('keydown', { key: 'Process', code: 'Escape' });
    if (reason === 'empty') s.editor.textContent = '';
    if (reason === 'detached') s.editor.isConnected = false;
    if (reason === 'disabled') s.button.disabled = true;
    s.flush();
    assert.equal(s.clicks, 0, reason);
  }
});
