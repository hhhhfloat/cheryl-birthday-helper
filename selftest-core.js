// @anchor: selftest_intro
// 内核自测：验证 grid-core.js 的三层状态、选中并集、目标约束、行列标记与序列化。
// 运行：node cheryl-birthday-helper/selftest-core.js

const assert = require('assert');
const core = require('./grid-core.js');

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

test('初始状态：全黑、无选中、无目标', () => {
  const g = core.createState();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      assert.strictEqual(g[r][c].color, 'black');
      assert.strictEqual(g[r][c].sel, false);
      assert.strictEqual(g[r][c].target, false);
    }
  }
});

test('仅白格可标记目标', () => {
  const g = core.createState();
  assert.strictEqual(core.setTarget(g, 0, 0, true), false);
  assert.strictEqual(g[0][0].target, false);
  core.setColor(g, 0, 0, 'white');
  assert.strictEqual(core.setTarget(g, 0, 0, true), true);
  assert.strictEqual(g[0][0].target, true);
});

test('涂黑自动清除该格目标', () => {
  const g = core.createState();
  core.setColor(g, 1, 1, 'white');
  core.setTarget(g, 1, 1, true);
  core.setColor(g, 1, 1, 'black');
  assert.strictEqual(g[1][1].target, false);
});

test('setSelected 支持任意单格选中 / 取消', () => {
  const g = core.createState();
  assert.strictEqual(core.setSelected(g, 2, 3, true), true);
  assert.strictEqual(g[2][3].sel, true);
  assert.strictEqual(g[2][2].sel, false);
  assert.strictEqual(core.setSelected(g, 2, 3, true), false, '重复设置应返回未变更');
  assert.strictEqual(core.setSelected(g, 2, 3, false), true);
  assert.strictEqual(g[2][3].sel, false);
});

test('行选中 + 列选中 = 并集', () => {
  const g = core.createState();
  core.selectRow(g, 3);
  core.selectCol(g, 5);
  assert.strictEqual(g[3][2].sel, true);  // 仅行
  assert.strictEqual(g[0][5].sel, true);  // 仅列
  assert.strictEqual(g[3][5].sel, true);  // 交叠
  assert.strictEqual(g[0][0].sel, false); // 外部
});

test('clearRow 只清该行，不动列', () => {
  const g = core.createState();
  core.selectRow(g, 3);
  core.selectCol(g, 5);
  core.clearRow(g, 3);
  assert.strictEqual(g[3][2].sel, false);
  assert.strictEqual(g[0][5].sel, true);
});

test('clearCol 只清该列，不动行', () => {
  const g = core.createState();
  core.selectRow(g, 2);
  core.selectCol(g, 6);
  core.clearCol(g, 6);
  assert.strictEqual(g[0][6].sel, false);
  assert.strictEqual(g[2][0].sel, true);
});

test('isRowAllSelected / isColAllSelected', () => {
  const g = core.createState();
  assert.strictEqual(core.isRowAllSelected(g, 0), false);
  core.selectRow(g, 0);
  assert.strictEqual(core.isRowAllSelected(g, 0), true);
  core.selectCol(g, 4);
  assert.strictEqual(core.isColAllSelected(g, 4), true);
  core.clearCol(g, 4);
  assert.strictEqual(core.isColAllSelected(g, 4), false);
});

test('clearAllSelection / clearAllTargets', () => {
  const g = core.createState();
  core.selectRow(g, 0);
  core.selectCol(g, 7);
  core.setColor(g, 2, 2, 'white');
  core.setTarget(g, 2, 2, true);
  core.clearAllSelection(g);
  assert.strictEqual(g[0][0].sel, false);
  assert.strictEqual(g[7][1].sel, false);
  core.clearAllTargets(g);
  assert.strictEqual(g[2][2].target, false);
});

test('序列化往返一致', () => {
  const g = core.createState();
  core.setColor(g, 2, 2, 'white');
  core.setTarget(g, 2, 2, true);
  core.selectRow(g, 4);
  const data = core.serialize(g);
  const g2 = core.deserialize(data);
  assert.ok(g2, '应成功反序列化');
  assert.strictEqual(g2[2][2].color, 'white');
  assert.strictEqual(g2[2][2].target, true);
  assert.strictEqual(g2[4][7].sel, true);
  assert.strictEqual(g2[0][0].color, 'black');
  assert.strictEqual(g2[0][0].sel, false);
});

test('反序列化拒绝非法数据', () => {
  assert.strictEqual(core.deserialize(null), null);
  assert.strictEqual(core.deserialize({}), null);
  assert.strictEqual(core.deserialize({ cells: [] }), null);
  assert.strictEqual(core.deserialize({ cells: new Array(8).fill([]) }), null);
});

test('反序列化：黑格不保留目标', () => {
  const data = { v: 1, cells: [] };
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) { row.push([0, 0, 1]); } // 黑格却标了目标
    data.cells.push(row);
  }
  const g = core.deserialize(data);
  assert.ok(g);
  assert.strictEqual(g[0][0].color, 'black');
  assert.strictEqual(g[0][0].target, false);
});

test('行列标记：唯一且可切换 / 清除', () => {
  const m = core.createMarks();
  assert.strictEqual(m.row, -1);
  assert.strictEqual(m.col, -1);
  assert.strictEqual(core.toggleMark(m, 'row', 3), true);
  assert.strictEqual(m.row, 3);
  assert.strictEqual(core.toggleMark(m, 'row', 5), true);
  assert.strictEqual(m.row, 5, '标记唯一，新的行取代旧行');
  assert.strictEqual(m.col, -1, '标记行不影响列');
  assert.strictEqual(core.toggleMark(m, 'row', 5), true);
  assert.strictEqual(m.row, -1, '再次点击同一行取消标记');
  assert.strictEqual(core.toggleMark(m, 'col', 2), true);
  assert.strictEqual(m.col, 2);
  assert.strictEqual(core.isMarked(m, 'col', 2), true);
  assert.strictEqual(core.isMarked(m, 'col', 3), false);
  assert.strictEqual(core.clearMark(m, 'col'), true);
  assert.strictEqual(m.col, -1);
  assert.strictEqual(core.clearMark(m, 'col'), false, '已空时清除返回未变更');
});

test('行列标记：非法轴忽略', () => {
  const m = core.createMarks();
  assert.strictEqual(core.toggleMark(m, 'diag', 1), false);
  assert.strictEqual(core.setMark(m, 'diag', 1), false);
  assert.strictEqual(m.row, -1);
});

test('序列化往返：行列标记随存档保留', () => {
  const g = core.createState();
  const m = core.createMarks();
  core.toggleMark(m, 'row', 6);
  core.toggleMark(m, 'col', 1);
  const data = core.serialize(g, m);
  assert.strictEqual(data.v, 2);
  const m2 = core.readMarks(data);
  assert.strictEqual(m2.row, 6);
  assert.strictEqual(m2.col, 1);
});

test('readMarks：旧数据 / 越界值回退为无标记', () => {
  const old = core.readMarks({ v: 1, cells: [] });
  assert.strictEqual(old.row, -1);
  assert.strictEqual(old.col, -1);
  const bad = core.readMarks({ mark: [99, -2] });
  assert.strictEqual(bad.row, -1);
  assert.strictEqual(bad.col, -1);
  assert.strictEqual(core.readMarks(null).row, -1);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) { process.exitCode = 1; }
