// @anchor: script_intro
// 交互层：把 grid-core.js 的纯状态映射到 DOM，处理模式化指针手势与 localStorage 持久化。

// @anchor: script_config
// 常量与状态提示文案；内核引用来自 grid-core.js
var Core = window.GridCore;
var SIZE = Core.SIZE;
var BLACK = Core.BLACK;
var WHITE = Core.WHITE;
var ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
var COL_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8'];
var MODES = ['paint', 'select', 'erase', 'target', 'mark'];
var STORAGE_KEY = 'cheryl-birthday-helper/v1';
var MODE_HINTS = {
  paint: '涂色：点击或拖动格子，黑 / 白循环切换',
  select: '选中：点击 / 拖动格子任意选中（叠加行 / 列标签），按住鼠标右键拖动可擦除',
  erase: '消除：点击行 / 列标签或拖动格子取消选中',
  target: '目标：点击或拖动白色格子，用黄色标出目标',
  mark: '标记：点击行标签标红（唯一一行）、点击列标签标蓝（唯一一列），再次点击取消；右键清除'
};

// @anchor: script_config_end

// @anchor: script_state
var brushSel = null;

// 运行时状态：单元格二维数组（唯一数据源）+ 行列标记 + 当前模式 + 手势上下文 + DOM 缓存
var cells = Core.createState();
var marks = Core.createMarks();
var mode = 'paint';
var pointerActive = false;
var gestureErase = false;
var brushColor = null;
var brushTarget = null;
var cellEls = [];
var rowLabelEls = [];
var colLabelEls = [];
var statusTimer = null;

// @anchor: script_state_end

// @anchor: script_build
// 构建网格 DOM：角落 + 列标签(数字) + 每行(行标签字母 + 单元格)，并缓存引用
function buildGrid() {
  var grid = document.getElementById('grid');
  grid.innerHTML = '';
  cellEls = [];
  rowLabelEls = [];
  colLabelEls = [];

  var corner = document.createElement('div');
  corner.className = 'corner';
  grid.appendChild(corner);

  for (var c = 0; c < SIZE; c++) {
    var cl = document.createElement('div');
    cl.className = 'col-label';
    cl.dataset.axis = 'col';
    cl.dataset.index = String(c);
    cl.textContent = COL_LABELS[c];
    cl.setAttribute('role', 'button');
    cl.setAttribute('aria-label', '第 ' + COL_LABELS[c] + ' 列');
    colLabelEls[c] = cl;
    grid.appendChild(cl);
  }

  for (var r = 0; r < SIZE; r++) {
    var rl = document.createElement('div');
    rl.className = 'row-label';
    rl.dataset.axis = 'row';
    rl.dataset.index = String(r);
    rl.textContent = ROW_LABELS[r];
    rl.setAttribute('role', 'button');
    rl.setAttribute('aria-label', '第 ' + ROW_LABELS[r] + ' 行');
    rowLabelEls[r] = rl;
    grid.appendChild(rl);

    cellEls[r] = [];
    for (var cc = 0; cc < SIZE; cc++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = String(r);
      cell.dataset.c = String(cc);
      cell.setAttribute('role', 'gridcell');
      cellEls[r][cc] = cell;
      grid.appendChild(cell);
    }
  }
}
// @anchor: script_build_end

// @anchor: script_render
// 状态 → 视图：刷新单元格三态样式与行 / 列标签的选中 / 标记样式
function renderAll() {
  for (var r = 0; r < SIZE; r++) {
    for (var c = 0; c < SIZE; c++) { renderCell(r, c); }
  }
  renderLabels();
  renderMarks();
}

function renderCell(r, c) {
  var st = cells[r][c];
  var el = cellEls[r][c];
  el.classList.toggle('is-black', st.color === BLACK);
  el.classList.toggle('is-white', st.color === WHITE);
  el.classList.toggle('is-selected', st.sel);
  el.classList.toggle('is-target', st.target);
  el.setAttribute('aria-pressed', st.sel ? 'true' : 'false');
}

function renderLabels() {
  for (var r = 0; r < SIZE; r++) {
    rowLabelEls[r].classList.toggle('is-active', Core.isRowAllSelected(cells, r));
  }
  for (var c = 0; c < SIZE; c++) {
    colLabelEls[c].classList.toggle('is-active', Core.isColAllSelected(cells, c));
  }
}

// 行列标记：红色行 / 蓝色列各至多一个（is-marked 由 .row-label / .col-label 分别着色）
function renderMarks() {
  for (var r = 0; r < SIZE; r++) {
    rowLabelEls[r].classList.toggle('is-marked', Core.isMarked(marks, 'row', r));
  }
  for (var c = 0; c < SIZE; c++) {
    colLabelEls[c].classList.toggle('is-marked', Core.isMarked(marks, 'col', c));
  }
}

// @anchor: script_render_end

// @anchor: script_ops
// 视图层原子操作：调用内核改状态后，仅重绘受影响的单个单元格
function paintCell(r, c, color) {
  if (Core.setColor(cells, r, c, color)) renderCell(r, c);
}
function selectCell(r, c, value) {
  if (Core.setSelected(cells, r, c, value)) renderCell(r, c);
}
function markTarget(r, c, value) {
  if (Core.setTarget(cells, r, c, value)) renderCell(r, c);
}
// @anchor: script_ops_end

// @anchor: script_input
// 指针手势：按下命中行 / 列标签或单元格，拖动用 elementFromPoint 命中格，按模式分派；
// 选中模式既可点击 / 拖动格子任意选中（以按下格的反相为画笔，拖动连续涂选），也可点行 / 列标签；
// 标记模式点击行 / 列标签设置唯一红行 / 蓝列标记；
// 选中 / 消除 / 标记模式下按鼠标右键 → 本次手势临时转为擦除（取消选中 / 清除标记）
function hitCellFromPoint(x, y) {
  var el = document.elementFromPoint(x, y);
  if (!el) return null;
  var cellEl = el.closest('.cell');
  if (!cellEl) return null;
  return { r: Number(cellEl.dataset.r), c: Number(cellEl.dataset.c) };
}

function applyCellDown(r, c) {
  var st = cells[r][c];
  if (gestureErase) {
    selectCell(r, c, false);
    pointerActive = true;
  } else if (mode === 'paint') {
    brushColor = st.color === BLACK ? WHITE : BLACK;
    paintCell(r, c, brushColor);
    pointerActive = true;
  } else if (mode === 'select') {
    brushSel = !st.sel;
    selectCell(r, c, brushSel);
    pointerActive = true;
  } else if (mode === 'target') {
    if (st.color !== WHITE) { status('仅白色格子可标记为目标'); return; }
    brushTarget = !st.target;
    markTarget(r, c, brushTarget);
    pointerActive = true;
  } else if (mode === 'mark') {
    status('标记模式：请点击网格外侧的行号（红）/ 列号（蓝）');
  }
}

function onPointerDown(e) {
  var rightButton = (e.pointerType === 'mouse' && e.button === 2);
  var leftButton = (e.pointerType !== 'mouse') || e.button === 0;
  var rightErase = rightButton && (mode === 'select' || mode === 'erase' || mode === 'mark');
  if (!leftButton && !rightErase) return;
  gestureErase = (mode === 'erase') || rightErase;

  var t = e.target;
  var rowLabel = t.closest ? t.closest('.row-label') : null;
  var colLabel = t.closest ? t.closest('.col-label') : null;
  if (rowLabel || colLabel) {
    e.preventDefault();
    var axisEl = rowLabel || colLabel;
    onAxisAction(axisEl.dataset.axis, Number(axisEl.dataset.index), gestureErase);
    return;
  }
  var cellEl = t.closest ? t.closest('.cell') : null;
  if (!cellEl) return;
  e.preventDefault();
  pointerActive = false;
  applyCellDown(Number(cellEl.dataset.r), Number(cellEl.dataset.c));
  if (pointerActive) {
    var grid = document.getElementById('grid');
    if (grid && grid.setPointerCapture && e.pointerId !== undefined) {
      try { grid.setPointerCapture(e.pointerId); } catch (err) { /* 部分环境不支持，忽略 */ }
    }
  }
}

function onPointerMove(e) {
  if (!pointerActive) return;
  var hit = hitCellFromPoint(e.clientX, e.clientY);
  if (!hit) return;
  if (gestureErase) selectCell(hit.r, hit.c, false);
  else if (mode === 'paint' && brushColor) paintCell(hit.r, hit.c, brushColor);
  else if (mode === 'select' && brushSel !== null) selectCell(hit.r, hit.c, brushSel);
  else if (mode === 'target' && brushTarget !== null) markTarget(hit.r, hit.c, brushTarget);
}

function onPointerUp(e) {
  if (!pointerActive) return;
  pointerActive = false;
  gestureErase = false;
  brushColor = null;
  brushSel = null;
  brushTarget = null;
  renderLabels();
  var grid = document.getElementById('grid');
  if (grid && grid.releasePointerCapture && e && e.pointerId !== undefined) {
    try { grid.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  }
}

function onAxisAction(axis, index, erase) {
  if (mode === 'mark') {
    if (erase) {
      Core.clearMark(marks, axis);
      status('已清除该' + (axis === 'row' ? '行' : '列') + '标记');
    } else {
      Core.toggleMark(marks, axis, index);
      status(axis === 'row'
        ? (marks.row === index ? '已标记行 ' + ROW_LABELS[index] + '（红）' : '已取消行标记')
        : (marks.col === index ? '已标记列 ' + COL_LABELS[index] + '（蓝）' : '已取消列标记'));
    }
    renderMarks();
    return;
  }
  if (erase || mode === 'erase') {
    if (axis === 'row') Core.clearRow(cells, index); else Core.clearCol(cells, index);
    renderAll();
    return;
  }
  if (mode === 'select') {
    var allSelected = axis === 'row'
      ? Core.isRowAllSelected(cells, index)
      : Core.isColAllSelected(cells, index);
    if (axis === 'row') {
      if (allSelected) Core.clearRow(cells, index); else Core.selectRow(cells, index);
    } else {
      if (allSelected) Core.clearCol(cells, index); else Core.selectCol(cells, index);
    }
    renderAll();
  } else {
    status('请在“选中”或“消除”模式下点击行 / 列标签');
  }
}

function bindPointerEvents() {
  var grid = document.getElementById('grid');
  grid.addEventListener('pointerdown', onPointerDown);
  grid.addEventListener('pointermove', onPointerMove);
  grid.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}


// @anchor: script_input_end

// @anchor: script_mode
// 模式切换与状态提示条
function setMode(next) {
  if (MODES.indexOf(next) === -1) return;
  mode = next;
  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  var grid = document.getElementById('grid');
  if (grid) grid.dataset.mode = mode;
  status(MODE_HINTS[mode]);
}

function status(msg) {
  var el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('flash');
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(function () { el.classList.remove('flash'); }, 1600);
}
// @anchor: script_mode_end

// @anchor: script_storage
// localStorage 持久化：保存 / 载入 / 清空，并绑定工具栏按钮
function saveState(silent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Core.serialize(cells, marks)));
    if (!silent) status('已保存到本地存储');
    return true;
  } catch (err) {
    if (!silent) status('保存失败：' + err.message);
    return false;
  }
}

function loadState() {
  var raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (err) { return false; }
  if (!raw) return false;
  var parsed = null;
  try { parsed = JSON.parse(raw); } catch (err) { return false; }
  var restored = Core.deserialize(parsed);
  if (!restored) return false;
  cells = restored;
  marks = Core.readMarks(parsed);
  return true;
}

function bindToolbar() {
  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { setMode(btn.dataset.mode); });
  });
  document.getElementById('btn-save').addEventListener('click', function () { saveState(false); });
  document.getElementById('btn-load').addEventListener('click', function () {
    var ok = loadState();
    renderAll();
    status(ok ? '已载入本地存档' : '本地暂无可载入的存档');
  });
  document.getElementById('btn-clear-sel').addEventListener('click', function () {
    Core.clearAllSelection(cells);
    renderAll();
    status('已清空选中层');
  });
  document.getElementById('btn-clear-target').addEventListener('click', function () {
    Core.clearAllTargets(cells);
    renderAll();
    status('已清空目标层');
  });
  document.getElementById('btn-clear-mark').addEventListener('click', function () {
    Core.clearMarks(marks);
    renderMarks();
    status('已清空行列标记');
  });
  document.getElementById('btn-reset').addEventListener('click', function () {
    cells = Core.createState();
    marks = Core.createMarks();
    renderAll();
    status('已重置：全黑题面、无选中、无目标、无标记（未写入存储）');
  });
}

// @anchor: script_storage_end

// @anchor: script_init
// 初始化：构建网格、绑定事件、载入本地存档
function init() {
  cells = Core.createState();
  buildGrid();
  bindToolbar();
  bindPointerEvents();
  setMode('paint');
  var restored = loadState();
  renderAll();
  status(restored ? '已载入上次保存的题面' : '新题面：默认全黑，点击或拖动即可涂白');
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
// @anchor: script_init_end
