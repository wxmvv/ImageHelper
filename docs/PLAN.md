# ImageHelper — 规划 (PLAN)

## 目标

实现一款图片批量嗅探、筛选和下载扩展，支持 **Chrome (MV3)** 与 **Safari Web Extension**。
代码按职责分层，运行时使用原生 DOM，核心逻辑可独立测试。

## 功能范围

### v1

1. **嗅探**（content script，document_start，all_frames）
   - DOM：`img`（含 `currentSrc`/`srcset`）、`picture>source`、`svg>image`、`video[poster]`、
     `input[type=image]`、`link[rel~=icon]`、`meta[og:image|twitter:image]`、`a[href]` 指向图片、
     常见懒加载属性（`data-src`/`data-original`/`data-lazy-src`/`data-url`/`data-srcset`…）、内联 `style`。
   - CSS：`document.styleSheets` 的 CSSOM 递归（含 media/supports/keyframes）与元素计算样式 `background-image`。
   - 网络：`performance.getEntriesByType('resource')` + `PerformanceObserver`，提供真实字节数。
   - 页面钩子（MAIN world，单独脚本）：拦截 `fetch` / `XMLHttpRequest` 响应文本里的图片地址；拦截 `Image.src` 赋值。
   - 懒加载：手动「自动滚动」逐屏滚动触发加载；DOM 变化增量扫描。
   - 所有 frame 分别上报，带上 `frameUrl` 与元素几何信息。
2. **筛选页**（独立 tab）
   - 头部：源页面信息、统计（张数 / 已选 / 总体积）、重新扫描、自动滚动、下载选中 / 下载全部。
   - 筛选：格式、最小宽高（预设 + 自定义）、URL 包含/排除（关键字或正则）、去重（URL / 相似 / 关闭）、排序。
   - 网格：懒加载缩略图、尺寸与字节徽标、单击选中（或按设置预览）、Shift 范围选择、右键菜单。
   - 大图预览：缩放、拖拽、左右切换、复制/下载/新标签打开。
   - 批量下载：ZIP 打包（自研 store-only zip，流式拼装）或逐张下载，命名模板，失败重试与进度。
   - 键盘：`A` 全选、`I` 反选、`V` 预览、`Esc` 关闭、`Delete` 移除。
3. **Popup**：提取本页 / 多地址提取 / 选项 / 快捷键提示。
4. **多地址提取**：粘贴 URL 列表 → 后台逐个打开 → 合并结果 → 批量下载。
5. **选项**：阈值、嗅探开关、点击行为、下载方式、命名模板、主题、语言。
6. **i18n**：`zh_CN` / `en`，默认 en（Safari 商店友好），语言可覆盖。

### v1.1（记录，不在本次交付）

- 图片编辑器（裁剪/水印/批量）
- 站点自动下载规则、收藏、Google 相似图搜索、二维码
- Firefox 打包

## 阶段与验收

| 阶段 | 内容                                                               | 验收                                               |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------- |
| P0   | 脚手架、构建、类型、lint、测试基线                                 | `npm run build` 产出 `dist/`，`npm run check` 全绿 |
| P1   | core 层（types/messages/settings/url/srcset/zip）+ background 骨架 | 单测通过；SW 能被 popup 调通                       |
| P2   | 嗅探引擎（content + page hook）                                    | fixture 页提取到全部 12 类图片；无重复；字节数正确 |
| P3   | 筛选页 UI（状态、筛选、网格、预览）                                | 截图核对；1000 张不卡；键盘/Shift 选择可用         |
| P4   | 下载（zip/逐张/命名/重试/进度）                                    | 下载 zip 可解压且内容完整；断链重试后跳过          |
| P5   | popup / options / multi-url / i18n                                 | 三个页面可用；中英切换生效                         |
| P6   | 端到端测试（Puppeteer）                                            | fixture 站点的嗅探、筛选和下载流程测试通过         |
| P7   | Safari 打包（converter + 同步脚本 + 编译验证）                     | `xcodebuild` 成功；Safari 中能提取并下载           |

## 质量门

- TypeScript `strict`，无 `any`（必要时 `unknown` + 收窄）。
- 单文件 ≤ 300 行，单一职责；导出用具名导出。
- `npm run check`：`tsc --noEmit` + `eslint` + `prettier --check` + `node:test` 单测。
- 所有用户可见文案走 i18n；所有颜色/间距走 CSS 变量。
- 不引入 UI 框架；运行时依赖只允许 `jszip` 之外的自研实现（本方案不使用 jszip）。
