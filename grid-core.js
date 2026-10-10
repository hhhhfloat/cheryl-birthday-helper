// @anchor: core_intro
// 纯逻辑内核：8×8 网格三层状态（color / sel / target）+ 行列标记与选中并集、目标约束、序列化。
// 无任何 DOM 依赖，浏览器挂到 window.GridCore，Node 下可 require 自测。

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GridCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // @anchor: core_config
  // 尺寸与颜色常量
  var SIZE = 8;
  var BLACK = 'black';
  var WHITE = 'white';
  var MARK_NONE = -1;
  // @anchor: core_config_end

  // @anchor: core_create
  // 创建初始状态：全黑、无选中、无目标
  function createState() {
    var cells = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) {
        row.push({ color: BLACK, sel: false, target: false });
      }
      cells.push(row);
    }
    return cells;
  }
  // @anchor: core_create_end


  // @anchor: core_query
  // 行 / 列是否已整行、整列被选中（驱动坐标头激活态与切换判断）
  function isRowAllSelected(cells, r) {
    for (var c = 0; c < SIZE; c++) { if (!cells[r][c].sel) return false; }
    return true;
  }
  function isColAllSelected(cells, c) {
    for (var r = 0; r < SIZE; r++) { if (!cells[r][c].sel) return false; }
    return true;
  }
  // @anchor: core_query_end

  // @anchor: core_ops
  // 单格与整行/整列操作；返回是否实际变更，调用方据此决定重绘范围。
  // 规则：目标仅存在于白格——涂黑时自动清除该格目标。
  function setColor(cells, r, c, color) {
    var st = cells[r][c];
    if (st.color === color) return false;
    st.color = color;
    if (color === BLACK && st.target) st.target = false;
    return true;
  }
  function setSelected(cells, r, c, value) {
    var st = cells[r][c];
    if (st.sel === value) return false;
    st.sel = value;
    return true;
  }
  function setTarget(cells, r, c, value) {
    var st = cells[r][c];
    if (st.color !== WHITE) return false;
    if (st.target === value) return false;
    st.target = value;
    return true;
  }
  function selectRow(cells, r) {
    var changed = false;
    for (var c = 0; c < SIZE; c++) { if (setSelected(cells, r, c, true)) changed = true; }
    return changed;
  }
  function clearRow(cells, r) {
    var changed = false;
    for (var c = 0; c < SIZE; c++) { if (setSelected(cells, r, c, false)) changed = true; }
    return changed;
  }
  function selectCol(cells, c) {
    var changed = false;
    for (var r = 0; r < SIZE; r++) { if (setSelected(cells, r, c, true)) changed = true; }
    return changed;
  }
  function clearCol(cells, c) {
    var changed = false;
    for (var r = 0; r < SIZE; r++) { if (setSelected(cells, r, c, false)) changed = true; }
    return changed;
  }
  function clearAllSelection(cells) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) { setSelected(cells, r, c, false); }
    }
  }
  function clearAllTargets(cells) {
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) { setTarget(cells, r, c, false); }
    }
  }
  // @anchor: core_ops_end

  // @anchor: core_marks
  // 行列标记：红色标行、蓝色标列，各至多一个（唯一），独立于单元格三层状态。
  // 以 axis='row' / 'col' 与索引定位；MARK_NONE(-1) 表示该轴无标记。
  function createMarks() { return { row: MARK_NONE, col: MARK_NONE }; }
  function validAxis(axis) { return axis === 'row' || axis === 'col'; }
  function toggleMark(marks, axis, index) {
    if (!validAxis(axis)) return false;
    var next = marks[axis] === index ? MARK_NONE : index;
    if (marks[axis] === next) return false;
    marks[axis] = next;
    return true;
  }
  function setMark(marks, axis, index) {
    if (!validAxis(axis)) return false;
    if (marks[axis] === index) return false;
    marks[axis] = index;
    return true;
  }
  function clearMark(marks, axis) {
    if (!validAxis(axis)) return false;
    if (marks[axis] === MARK_NONE) return false;
    marks[axis] = MARK_NONE;
    return true;
  }
  function clearMarks(marks) {
    var changed = marks.row !== MARK_NONE || marks.col !== MARK_NONE;
    marks.row = MARK_NONE;
    marks.col = MARK_NONE;
    return changed;
  }
  function isMarked(marks, axis, index) {
    return validAxis(axis) && marks[axis] === index;
  }
  // @anchor: core_marks_end

  // @anchor: core_serialize
  // 序列化 / 反序列化：紧凑三元组 [是否白, 是否选中, 是否目标]；非法数据返回 null。
  // v2 起附带行列标记 mark=[行, 列]（-1 表示无）；旧 v1 数据无 mark 字段，readMarks 回退为无标记。
  function serialize(cells, marks) {
    return {
      v: 2,
      cells: cells.map(function (row) {
        return row.map(function (st) {
          return [st.color === WHITE ? 1 : 0, st.sel ? 1 : 0, st.target ? 1 : 0];
        });
      }),
      mark: marks ? [marks.row, marks.col] : [MARK_NONE, MARK_NONE]
    };
  }
  function deserialize(data) {
    if (!data || !Array.isArray(data.cells) || data.cells.length !== SIZE) return null;
    var cells = createState();
    for (var r = 0; r < SIZE; r++) {
      var row = data.cells[r];
      if (!Array.isArray(row) || row.length !== SIZE) return null;
      for (var c = 0; c < SIZE; c++) {
        var t = row[c];
        if (!Array.isArray(t) || t.length < 3) return null;
        var isBlack = t[0] !== 1;
        cells[r][c].color = isBlack ? BLACK : WHITE;
        cells[r][c].sel = t[1] === 1;
        cells[r][c].target = isBlack ? false : t[2] === 1;
      }
    }
    return cells;
  }
  // 从存档中还原行列标记；缺失或越界一律回退为无标记
  function readMarks(data) {
    var m = createMarks();
    if (!data || !Array.isArray(data.mark)) return m;
    var r = data.mark[0];
    var c = data.mark[1];
    if (typeof r === 'number' && r >= 0 && r < SIZE) m.row = r;
    if (typeof c === 'number' && c >= 0 && c < SIZE) m.col = c;
    return m;
  }
  // @anchor: core_serialize_end

  return {
    SIZE: SIZE,
    BLACK: BLACK,
    WHITE: WHITE,
    MARK_NONE: MARK_NONE,
    createState: createState,
    isRowAllSelected: isRowAllSelected,
    isColAllSelected: isColAllSelected,
    setColor: setColor,
    setSelected: setSelected,
    setTarget: setTarget,
    selectRow: selectRow,
    clearRow: clearRow,
    selectCol: selectCol,
    clearCol: clearCol,
    clearAllSelection: clearAllSelection,
    clearAllTargets: clearAllTargets,
    createMarks: createMarks,
    toggleMark: toggleMark,
    setMark: setMark,
    clearMark: clearMark,
    clearMarks: clearMarks,
    isMarked: isMarked,
    serialize: serialize,
    deserialize: deserialize,
    readMarks: readMarks
  };
});
