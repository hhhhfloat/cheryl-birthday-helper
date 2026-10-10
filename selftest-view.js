// @anchor: selftest_view_intro
// 视图层自测：用极简 DOM 桩 (无 jsdom) 在 Node 里加载 script.js，
// 模拟 pointer 事件验证涂抹 / 任意选中拖动 / 行列并集 / 右键擦除 / 持久化。
// 运行：node cheryl-birthday-helper/selftest-view.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS - ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL - ' + name + ' :: ' + e.message);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 期望 ' + b + ' 实际 ' + a); }

// @anchor: selftest_view_dom
// 极简 DOM 桩：仅实现 script.js 用到的 API（classList / dataset / closest / appendChild 等）
class El {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.parent = null;
    this.dataset = {};
    this.attrs = {};
    this.classes = new Set();
    this.listeners = {};
    this.textContent = '';
    this.style = {};
  }
  get className() { return Array.from(this.classes).join(' '); }
  set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() {
    const s = this.classes;
    return {
      add: (...n) => n.forEach((x) => s.add(x)),
      remove: (...n) => n.forEach((x) => s.delete(x)),
      contains: (n) => s.has(n),
      toggle: (n, force) => {
        const on = force === undefined ? !s.has(n) : !!force;
        if (on) s.add(n); else s.delete(n);
        return on;
      }
    };
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  set innerHTML(v) { this.children = []; }
  get innerHTML() { return ''; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  setPointerCapture() { }
  releasePointerCapture() { }
  closest(sel) {
    const cls = sel.replace(/^\./, '');
    let n = this;
    while (n) { if (n.classes && n.classes.has(cls)) return n; n = n.parent; }
    return null;
  }
}

function makeEnv() {
  const byId = {};
  const grid = new El('div'); byId.grid = grid;
  const status = new El('p'); byId.status = status;
  ['btn-save', 'btn-load', 'btn-clear-sel', 'btn-clear-target', 'btn-reset']
    .forEach((id) => { byId[id] = new El('button'); });
  const modeBtns = ['paint', 'select', 'erase', 'target'].map((m) => {
    const b = new El('button'); b.dataset.mode = m; return b;
  });

  const store = new Map();
  const env = {
    hit: null,
    listeners: {},
    document: {
      getElementById: (id) => byId[id] || null,
      createElement: (tag) => new El(tag),
      querySelectorAll: (sel) => (sel === '.mode-btn' ? modeBtns : []),
      elementFromPoint: () => env.hit,
      addEventListener: (t, fn) => { (env.listeners[t] = env.listeners[t] || []).push(fn); },
      removeEventListener: () => { }
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    setTimeout: (fn) => { void fn; return 0; },
    clearTimeout: () => { },
    console: console,
    JSON: JSON,
    Number: Number,
    String: String,
    Math: Math
  };
  env.addEventListener = () => { };
  env.removeEventListener = () => { };
  env.window = env;
  env.window.GridCore = require('./grid-core.js');
  return env;
}
// @anchor: selftest_view_dom_end

// @anchor: selftest_view_run
// 载入 script.js 到隔离上下文，并返回可直接调用其顶层函数的沙箱
function loadScript(env) {
  const sandbox = env;
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'script.js' });
  sandbox.init();
  return sandbox;
}

function down(sb, r, c, button) {
  const el = sb.cellEls[r][c];
  sb.onPointerDown({ target: el, pointerType: 'mouse', button: button || 0, pointerId: 1, preventDefault: () => { } });
}
function move(sb, r, c) {
  sb.hit = sb.cellEls[r][c];
  sb.onPointerMove({ clientX: 0, clientY: 0, pointerId: 1 });
}
function up(sb) { sb.onPointerUp({ pointerId: 1 }); }

function run() {
  const sb = loadScript(makeEnv());

  test('涂色：单格黑→白、再点白→黑', () => {
    const g = sb.cells;
    down(sb, 0, 0); up(sb);
    eq(g[0][0].color, 'white', '首次点击应变白');
    down(sb, 0, 0); up(sb);
    eq(g[0][0].color, 'black', '再次点击应回黑');
  });

  test('涂色：拖动连续涂抹一致画笔', () => {
    const g = sb.cells;
    eq(g[1][0].color, 'black');
    down(sb, 1, 0); move(sb, 1, 1); move(sb, 1, 2); up(sb);
    eq(g[1][0].color, 'white', '起点应变白');
    eq(g[1][1].color, 'white', '拖动经过应变白');
    eq(g[1][2].color, 'white', '拖动经过应变白');
  });

  test('选中：点击任意单格可选中', () => {
    sb.setMode('select');
    const g = sb.cells;
    eq(g[4][4].sel, false);
    down(sb, 4, 4); up(sb);
    eq(g[4][4].sel, true, '单格应被选中');
    eq(g[4][3].sel, false, '相邻格不应被选中');
  });

  test('选中：拖动连续选中（任意选中）', () => {
    const g = sb.cells;
    down(sb, 6, 0); move(sb, 6, 1); move(sb, 6, 2); up(sb);
    eq(g[6][0].sel, true);
    eq(g[6][1].sel, true);
    eq(g[6][2].sel, true);
    eq(g[5][1].sel, false, '其它行不受影响');
  });

  test('选中：点击已选中格取消选中', () => {
    const g = sb.cells;
    down(sb, 4, 4); up(sb);
    eq(g[4][4].sel, false, '再次点击应取消选中');
  });

  test('选中：行 / 列标签取并集', () => {
    const g = sb.cells;
    sb.onPointerDown({ target: sb.rowLabelEls[0], pointerType: 'mouse', button: 0, pointerId: 1, preventDefault: () => { } });
    sb.onPointerUp({ pointerId: 1 });
    sb.onPointerDown({ target: sb.colLabelEls[5], pointerType: 'mouse', button: 0, pointerId: 1, preventDefault: () => { } });
    sb.onPointerUp({ pointerId: 1 });
    eq(g[0][7].sel, true, '整行选中');
    eq(g[7][5].sel, true, '整列选中');
    eq(g[0][5].sel, true, '交叠格为选中');
    eq(g[1][6].sel, false, '并集之外不应选中');
  });

  test('选中模式右键：按格 / 拖动擦除，不动涂色与目标', () => {
    const g = sb.cells;
    sb.setMode('paint'); down(sb, 3, 3); up(sb);   // 涂白
    sb.setMode('target'); down(sb, 3, 3); up(sb);  // 标为目标
    eq(g[3][3].target, true);
    sb.setMode('select');
    down(sb, 3, 3, 2); up(sb);
    eq(g[3][3].sel, false, '右键应取消选中');
    eq(g[3][3].color, 'white', '涂色不应改变');
    eq(g[3][3].target, true, '目标不应改变');
    eq(g[0][0].sel, true, '左键选中状态不应被影响');
    down(sb, 0, 0, 2); move(sb, 0, 1); up(sb);
    eq(g[0][1].sel, false, '右键拖动连续擦除');
  });

  test('选中模式右键点行标签：清整行选中', () => {
    const g = sb.cells;
    sb.onPointerDown({ target: sb.rowLabelEls[0], pointerType: 'mouse', button: 2, pointerId: 1, preventDefault: () => { } });
    sb.onPointerUp({ pointerId: 1 });
    eq(g[0][0].sel, false, '整行选中应被清空');
    eq(g[7][5].sel, true, '列选中不受影响');
  });

  test('消除模式：逐格取消选中', () => {
    const g = sb.cells;
    sb.setMode('erase');
    down(sb, 7, 5); up(sb);
    eq(g[7][5].sel, false, '消除模式应取消选中');
  });

  test('目标：仅白格可标记，涂黑自动清除', () => {
    const g = sb.cells;
    sb.setMode('target');
    down(sb, 2, 0); up(sb);
    eq(g[2][0].target, false, '黑格不可标目标');
    sb.setMode('paint'); down(sb, 2, 0); up(sb);   // 涂白
    sb.setMode('target'); down(sb, 2, 0); up(sb);
    eq(g[2][0].target, true, '白格可标目标');
    sb.setMode('paint'); down(sb, 2, 0); up(sb);   // 涂黑
    eq(g[2][0].target, false, '涂黑应清除目标');
  });

  test('持久化：保存后载入还原颜色 / 目标 / 选中', () => {
    sb.setMode('paint'); down(sb, 5, 1); up(sb);     // 涂白
    sb.setMode('target'); down(sb, 5, 1); up(sb);    // 标目标
    sb.setMode('select'); down(sb, 5, 6); up(sb);    // 选中
    eq(sb.saveState(true), true, '保存应成功');
    sb.setMode('paint'); down(sb, 5, 1); up(sb);     // 破坏：涂黑（并清目标）
    sb.setMode('select'); down(sb, 5, 6); up(sb);    // 破坏：取消选中
    eq(sb.loadState(), true, '载入应成功');
    eq(sb.cells[5][1].color, 'white', '还原颜色');
    eq(sb.cells[5][1].target, true, '还原目标');
    eq(sb.cells[5][6].sel, true, '还原选中');
  });
}


// @anchor: selftest_view_run_end

run();
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { process.exitCode = 1; }
