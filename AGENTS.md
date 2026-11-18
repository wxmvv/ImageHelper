# AGENTS.md — ImageHelper 开发约定

给所有自动化编码代理（Codex / Claude Code / …）的硬性约束。先读 `docs/PLAN.md`、
`docs/ARCHITECTURE.md`、`docs/UI.md`，再动手。

## 基本

- 语言：TypeScript，`strict: true`，`noUncheckedIndexedAccess`。禁止 `any`。
- 运行时零框架、零 jQuery；DOM 用 `ui/dom.ts` 的 `h()` 工厂与事件委托。
- 只用具名导出；一个文件一个职责；单文件 ≤ 300 行，超了就拆。
- 注释用英文、解释「为什么」而不是「做了什么」；不要留 TODO 占位实现。
- 用户可见文案一律走 i18n（`t('key')`），**中英双语必须同时补齐**。
- 提交前必须 `npm run check` 通过（tsc + eslint + prettier + test）。
- 不要改 `src/manifest.json` 的权限集合，除非任务明确要求（Safari 兼容性约束见架构文档）。
- 不引入新依赖；`package.json` 的 dependencies 必须保持为空（构建/测试依赖在 devDependencies）。

## 目录与命名

- `core/` 下不允许出现 `document` / `window` / `chrome` 引用（纯函数，便于单测）。
- 文件名 kebab-case；类型/接口 PascalCase；函数 camelCase；常量 UPPER_SNAKE。
- CSS 类名：`ih-` 前缀 + kebab-case；状态类 `is-*`；CSS 变量 `--ih-*`（tokens.css 除外）。
- HTML 只做骨架，不写内联样式；`<script type="module" src="./main.js">`。

## 行为约束

- 任何网络请求必须可失败：统一 try/catch，UI 侧给出可读错误，不抛未捕获异常。
- 任何对 `chrome.*` 的调用都要考虑 Safari 缺失（见架构「Safari 兼容约束」）。
- 渲染用户数据只用 `textContent` / `setAttribute`，禁止字符串拼 `innerHTML`。
- 事件监听必须可解绑（页面级单例除外）。
- 大数组操作注意 O(n)：筛选/排序在 `core/filter.ts` 内一次完成，不在渲染循环里做。

## 验证方式

- 单测：`node:test`，放 `test/*.test.ts`，用 `node --experimental-strip-types` 或 esbuild 预处理（见 build 脚本）。
- e2e：`tools/e2e/run.mjs`，puppeteer-core + 本机 Chrome for Testing，加载 `dist/`，
  用 `tools/fixtures/site/` 的静态站点做基准页。
- 每个阶段结束必须实际运行构建与测试，并贴出真实输出，不接受“应该可以”。
