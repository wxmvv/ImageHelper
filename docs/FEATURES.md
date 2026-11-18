# 功能索引

每一行都是「功能 → 实现 → 验证方式」。新增功能请顺手补一行。

## 嗅探

| 功能                                                  | 实现                                              | 验证                                  |
| ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| `img`（含 `currentSrc`）                              | `content/dom-scan.ts`                             | `tools/e2e/sniff.test.mjs`            |
| `srcset` 全部候选（单页上限 24）                      | `content/dom-scan.ts` + `core/srcset.ts`          | `test/srcset.test.ts`、sniff e2e      |
| `picture > source`                                    | `content/dom-scan.ts`                             | sniff e2e（webp 备选）                |
| SVG `<image>` / `video[poster]` / `input[type=image]` | `content/dom-scan.ts`                             | sniff e2e                             |
| favicon / `og:image` / `twitter:image`                | `content/dom-scan.ts`                             | sniff e2e                             |
| 指向图片的链接 `a[href]`                              | `content/dom-scan.ts` + `core/url.ts::isImageUrl` | sniff e2e                             |
| 懒加载属性（13 种）                                   | `content/lazy-scan.ts`                            | `test/lazy-scan.test.ts`              |
| CSS `background-image`（样式表 CSSOM）                | `content/css-scan.ts::scanStyleSheets`            | sniff e2e（stylesheet 背景）          |
| CSS 计算样式背景（分批 idle）                         | `content/css-scan.ts::scanComputedStyles`         | sniff e2e（pseudo 元素）              |
| 内联 `style` 中的 `url()`                             | `content/dom-scan.ts`                             | sniff e2e（inline style）             |
| Shadow DOM 内部图片                                   | `content/dom-scan.ts::collectRoots`               | `tools/e2e/shadow.test.mjs`           |
| 网络资源时间线 + 真实字节数                           | `content/network-scan.ts`                         | `test/network-scan.test.ts`           |
| `fetch` / `XHR` 响应体里的图片地址                    | `content/page-hook.ts`                            | sniff e2e（`?xhr=1`、`?attribute=1`） |
| `Image.src` 赋值                                      | `content/page-hook.ts`                            | sniff e2e（`?dynamic=1`）             |
| 子框架嗅探（all_frames）                              | `content/sniffer.ts` + manifest                   | sniff e2e（iframe）                   |
| 自动滚动触发懒加载                                    | `content/autoscroll.ts`                           | sniff e2e（lazy.html）                |
| 去重 / 上限 / data URL 策略                           | `content/reporter.ts`                             | `test/reporter.test.ts`               |

## 筛选页

| 功能                              | 实现                                                            | 验证                     |
| --------------------------------- | --------------------------------------------------------------- | ------------------------ |
| 增量接收 + 状态订阅               | `pages/extractor/state.ts`、`main.ts`                           | extractor e2e            |
| 格式筛选（带计数）                | `pages/extractor/filters.ts`                                    | extractor e2e（png）     |
| 尺寸漏斗（预设 + 自定义）         | `pages/extractor/filters.ts`                                    | `test/filter.test.ts`    |
| URL 包含 / 排除 / 正则            | `pages/extractor/filters.ts` + `core/filter.ts`                 | `test/filter.test.ts`    |
| 相似图去重（dHash + Worker 池）   | `pages/extractor/hashing.ts`、`hash-worker.ts`、`core/dhash.ts` | extractor e2e（similar） |
| 排序（体积/宽度/发现顺序）        | `core/filter.ts`                                                | `test/filter.test.ts`    |
| 网格懒加载缩略图（并发 8）        | `pages/extractor/thumbnails.ts`、`grid.ts`                      | extractor e2e（1400 张） |
| 单击选中 / Shift 范围 / Ctrl 反选 | `pages/extractor/grid.ts`、`selection.ts`                       | extractor e2e            |
| 大图预览（缩放/拖拽/切图/键盘）   | `pages/extractor/lightbox.ts`、`shortcuts.ts`                   | extractor e2e            |
| 右键菜单（下载/复制/新标签/移除） | `pages/extractor/grid.ts`                                       | 手工                     |
| 筛选状态持久化                    | `platform/page-settings.ts`                                     | extractor e2e            |

## 下载

| 功能                                  | 实现                                                        | 验证                                            |
| ------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| ZIP 打包（store 模式、流式）          | `core/zip.ts`、`downloads/engine.ts`                        | `test/zip.test.ts`、extractor e2e（解压断言）   |
| 命名模板 + 非法字符 + 重名            | `core/naming.ts`                                            | `test/naming.test.ts`、`test/downloads.test.ts` |
| 并发 4 + 超时 + 重试 + 取消           | `downloads/fetch.ts`、`engine.ts`                           | `test/downloads.test.ts`                        |
| 逐张保存（downloads API → blob 降级） | `platform/download-sink.ts`、`background/download-files.ts` | `test/downloads.test.ts`                        |
| 进度条 / 失败汇总 / 重试              | `pages/extractor/download-ui.ts`                            | 手工 + extractor e2e                            |

## 其余页面

| 功能                                       | 实现                                          | 验证                       |
| ------------------------------------------ | --------------------------------------------- | -------------------------- |
| Popup（提取/多地址/选项/快捷键）           | `pages/popup/main.ts`                         | `tools/e2e/pages.test.mjs` |
| 选项页（嗅探/尺寸/下载/外观/关于）         | `pages/options/*`                             | pages e2e                  |
| 多地址提取（后台编排、并发 3、自动关标签） | `background/multi-run.ts`、`pages/multiurl/*` | pages e2e                  |
| 中英双语、即时切换                         | `platform/i18n.ts`、`_locales/*`              | pages e2e（语言切换）      |
| 快捷键 `Alt+Shift+Y`                       | `background/commands.ts`                      | 手工                       |
| 右键菜单「提取本页图片」                   | `background/context-menu.ts`                  | 手工                       |
| 主题（跟随系统/亮/暗）                     | `platform/theme.ts`                           | pages e2e                  |
| 透明弹窗背景                               | `pages/popup/main.ts`、`ui/styles/popup.css`  | pages e2e                  |
