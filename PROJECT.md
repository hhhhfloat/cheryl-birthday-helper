<!-- @anchor: project_intro -->
<!-- 项目定位与架构说明：Cheryl's Birthday 8×8 网格推理辅助工具。 -->

# Cheryl's Birthday 网格推理助手

零依赖纯前端小工具（双击 `index.html` 即用），用于手工推演 Cheryl's Birthday 一类的「网格 + 排除法」逻辑题。

<!-- @anchor: project_layers -->
<!-- 三层状态模型与设计决策——修改内核语义前必读 -->
## 定位
8×8 可涂色网格，把「题面」与「推演辅助」分成三层处理：
- **涂色层（黑 / 白）**：固定题面本身。
- **选中层（蓝色内描边）**：候选范围，用于缩小搜索范围，属临时辅助。
- **目标层（黄色填充）**：标记目标格，**属于题面的一部分**，且**仅白色格子可标记**。

## 设计决策
- **三层相互独立、可叠加**：涂黑会连带清除该格目标（目标只存在于白格）；选中与二者互不影响。
- **选中可「按行 / 列」也可「逐格」**：选中模式下点击 / 拖动格子即任意选中（以首格取反为笔刷，保证拖动一致），点击行 / 列标签则批量选中整行 / 整列；两者共用同一存储，行 / 列叠加取**并集**。
- **底层按单格存储**：行 / 列只是批量添加，因此并集与逐格消除可并存（代价：清整行会连清该行与其它选中列的交叠格）。
- **消除 = 取消选中态**：不改动涂色与目标；支持按行 / 列整体消除与拖动连续自由消除。
- **右键快捷擦除**：选中 / 消除模式下按鼠标右键，本次手势临时转为擦除（含行 / 列标签）。
- **默认全黑**：新建题面 64 格全黑，涂色模式下点击 / 拖动循环切换黑↔白。
- **纯逻辑与视图分离**：`grid-core.js` 为无 DOM 依赖的状态内核（浏览器挂 `window.GridCore`，Node 可 require），`script.js` 只负责 DOM 映射、手势与持久化，内核因此可独立自测。

<!-- @anchor: project_interaction -->
<!-- 交互约定：模式、坐标头、指针手势 -->
## 交互
- 模式：涂色 / 选中 / 消除 / 目标，工具栏按钮切换，当前模式提示显示于状态条。
- 坐标头：左侧行 A–H，顶部列 1–8；选中 / 消除模式下点击标签即操作整行 / 整列，标签在整行 / 整列被选中时高亮。
- 手势：`pointerdown` 定位目标，拖动经 `document.elementFromPoint` 命中格，`setPointerCapture` 保证移出网格仍连续；同一套手势被四种模式复用（笔刷语义由按下格决定）。

<!-- @anchor: project_storage -->
<!-- 持久化约定：键名、保存范围、入口 -->
## 持久化
- 手动「保存」写入 `localStorage`，键 `cheryl-birthday-helper/v1`，存全套状态（涂色 + 选中 + 目标，紧凑三元组）。
- 启动自动载入；提供「载入 / 清空选中 / 清空目标 / 重置全部」。

<!-- @anchor: project_testing -->
<!-- 测试与运行方式 -->
## 运行与自测
- 运行：直接双击 `index.html`（或经任意静态服务器打开）。
- 内核自测：`node cheryl-birthday-helper/selftest-core.js`（无 DOM 依赖）。
- 视图自测：`node cheryl-birthday-helper/selftest-view.js`（自带极简 DOM 桩 + `vm` 载入 `script.js`，模拟 pointer 事件）。

<!-- @anchor: project_files -->
<!-- 文件清单 -->
## 文件
- `index.html` / `style.css` / `script.js`：外壳、样式、交互层。
- `grid-core.js`：纯逻辑内核。
- `selftest-core.js` / `selftest-view.js`：内核自测 / 视图自测脚本。

<!-- @anchor: project_tail -->
<!-- 末尾锚点：新增章节请插入到此处之前（position=before） -->
