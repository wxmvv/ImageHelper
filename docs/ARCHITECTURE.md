# ImageHelper — 架构 (ARCHITECTURE)

## 目录

```
src/
  manifest.json               MV3 清单（Chrome / Safari 共用）
  _locales/{en,zh_CN}/messages.json
  core/                       纯逻辑，零 DOM 依赖（可单测）
    types.ts                  ImageRecord / PageSession / Settings / 枚举
    messages.ts               消息类型常量 + 请求/响应类型
    settings.ts               默认值、规范化（normalizeSettings）
    url.ts                    绝对化、规范化、图片扩展名、协议判断
    hash.ts                   FNV-1a 稳定 id
    srcset.ts                 srcset 解析（取最大候选）
    naming.ts                 下载命名模板渲染 + 非法字符清洗 + 重名处理
    zip.ts                    store-only ZIP 写入器（CRC32，UTF-8 flag）
    filter.ts                 筛选/排序（纯函数）
    format.ts                 bytes / 尺寸格式化
  platform/                   唯一允许直接调用 chrome.* 的共享层
    storage.ts                storage.session → local 降级封装
    rpc.ts                    页面/SW 之间的请求响应封装
    i18n.ts                   词典 + t()（构建期打包两份 locale）
    theme.ts                  主题读取与应用
    download-sink.ts          Blob 落盘（downloads API → a[download] → open）
  background/
    index.ts                  仅做装配：注册 handler、监听器
    handlers.ts               消息 handler map
    sessions.ts               每 tab 的图片会话（内存 + 持久化快照）
    injection.ts              注入内容脚本 / 与 frame 通讯
    tabs.ts                   打开筛选页、清理 tab 会话
    context-menu.ts           右键菜单
    commands.ts               快捷键
  content/
    sniffer.ts                content script 入口（isolated world）
    dom-scan.ts               DOM 扫描
    css-scan.ts               CSSOM + 计算样式
    network-scan.ts           resource timing / observer
    lazy-scan.ts              懒加载属性
    autoscroll.ts             自动滚动
    reporter.ts               批量上报（去重 + 节流）
    page-hook.ts              MAIN world 钩子（fetch/xhr/Image.src）
  pages/
    extractor/                index.html, main.ts, state.ts, render/*, actions/*
    popup/                    index.html, main.ts
    options/                  index.html, main.ts
    multiurl/                 index.html, main.ts
  ui/
    styles/tokens.css         设计变量（亮/暗）
    styles/base.css           重置 + 通用组件
    styles/{extractor,popup,options,multiurl}.css
    dom.ts                    h() 元素工厂、事件委托、防抖
    i18n.ts                   t() + data-i18n 应用
```

构建：`esbuild`（`build.mjs`）→ `dist/`。产物为 **可直接加载的目录**，不含 hash 文件名，
HTML 引用固定路径，方便 Safari converter 直接转换。

## 数据流

```
page(frames)                     background(SW)                   pages
-----------                      --------------                   -----
content/sniffer  --batch-->  handlers → sessions(rev++)
      ^                            |
      |  ping/rescan               |  broadcast session:images
      +----------------------------+------------------------------> extractor (增量合并)
                                                                   |
                                          download engine <--------+
```

- 会话以 `tabId` 为键；`ImageRecord.id` = `sha1(url)` 前 16 位（同步哈希，FNV-1a 也可）。
- `rev` 单调递增，筛选页据此判断是否需要重渲染。
- 数组顺序即发现顺序；排序在筛选页做，不改数据。

## 消息协议（`core/messages.ts`）

```ts
type Envelope<T> = { id: string; type: string; payload: T };
type Reply<D> = { id: string; ok: true; data: D } | { id: string; ok: false; error: string };

// content → background（单向，不等回复）
'sniffer:hello'   { frameUrl, frameDepth }
'sniffer:batch'   { frameUrl, images: ImageRecord[] }   // 每 250ms 或 100 条

// pages → background（请求/响应）
'extract:start'   { tabId }                 -> { ok: boolean; extractorTabId?: number }
'extract:rescan'  { tabId }                 -> { frames: number }
'page:autoscroll' { tabId }                 -> { frames: number }
'session:get'     { tabId }                 -> { session: PageSession }
'session:clear'   { tabId }                 -> { ok: true }
'extractor:open'  { tabId }                 -> { tabId: number }
'download:files'  { tabId, items: DownloadItem[], naming } -> { started: number; failed: number }
'tabs:current'    {}                        -> { tabId, title, url }

// background → pages（广播，chrome.runtime.sendMessage 无 handler）
'session:images'  { tabId, rev, page: PageInfo, images: ImageRecord[] }
'session:status'  { tabId, frames: Record<frameId, {url, done}> }
'session:reset'   { tabId }
```

`rpc.ts` 约定：所有请求带自增 `id` + 8s 超时；背景侧 `handlers.ts` 用
`Record<string, (payload, sender) => Promise<unknown>>` 注册，禁止 switch 大杂烩。

## ImageRecord

```ts
type ImageSource =
  | 'img'
  | 'srcset'
  | 'picture'
  | 'css-bg'
  | 'cssom'
  | 'inline-style'
  | 'lazy-attr'
  | 'svg-image'
  | 'video-poster'
  | 'input-image'
  | 'favicon'
  | 'meta'
  | 'link'
  | 'network'
  | 'page-hook';

interface ImageRecord {
  id: string;
  url: string; // 已绝对化，未转义
  ext: string; // 小写，无点；未知为 'img'
  source: ImageSource;
  width?: number; // 固有尺寸
  height?: number;
  renderedWidth?: number; // 元素渲染尺寸
  renderedHeight?: number;
  bytes?: number; // 来自 resource timing 或 HEAD
  mime?: string;
  alt?: string;
  frameUrl?: string;
  inViewport?: boolean;
  hidden?: boolean; // display:none / 0 尺寸
  discoveredAt: number;
}
```

## 嗅探规则

1. `dom-scan`：`getBoundingClientRect` 取尺寸；`img.naturalWidth/Height` 优先；
   `currentSrc` 优先于 `src`；`srcset` 取描述符最大的候选并入；懒加载属性逐一尝试。
2. `css-scan`：CSSOM 递归所有 `CSSRule`，正则 `url\(\s*['"]?([^'")]+)`；跨域表捕获 `SecurityError` 静默跳过。
   计算样式仅对 `offsetWidth||offsetHeight` 非零元素，且分批 `requestIdleCallback`，每批 400 个。
3. `network-scan`：过滤 `initiatorType in (img, css, link, video, audio, fetch, xmlhttprequest)` 且
   URL 形似图片 或 扩展名已知；`encodedBodySize` 作为 bytes。observer 持续收集。
4. `page-hook`：只扫描 `Content-Type` 为 text/json/js/html 且长度 < 2MB 的响应；
   正则匹配图片 URL 与 `data:image/...;base64,`；`Image.prototype.src` setter 也上报。
   与 isolated world 用 `window.postMessage({__image_helper__: token, images})` 通信，token 由注入时随机生成。
5. 上报前去重（同一 frame 内 Set），并丢弃 `blob:`、`chrome-extension:`、`about:`；
   `data:` 由设置控制（默认忽略大于 64KB 的 data URI）。
6. 单页 5000 张上限，超过后停止新增并上报 `truncated: true`。

## 去重

- `url`（默认）：同 URL 只留一条，保留信息最全（有尺寸 > 无尺寸）。
- `similar`：在筛选页用 `fetch → createImageBitmap → OffscreenCanvas 9x8 → dHash 64bit`，
  汉明距离 ≤ 阈值（默认 6）归为一组，只保留面积最大者，组内其余折叠并可展开。
  Worker 池 2 个，按可见顺序计算，带进度。
- 去重只影响展示集合，原始数据保留（`state.all` vs `state.visible`）。

## 下载

- `zip`：筛选页 `DownloadEngine` 以并发 4 fetch（`referrer` 设为源页面 URL），
  失败重试 2 次（指数退避）；`core/zip.ts` 以 store 模式流式拼装 `Blob`；
  完成后 `saveBlob()`：优先 `chrome.downloads.download`（存在且可用），否则 `a[download]` + `blob:`，
  再否则 `window.open`。
- `files`：逐张走 `download:files` 交给 background，用 `chrome.downloads` 顺序下载（间隔 120ms 防限流）。
- 命名模板 token：`{index} {name} {ext} {w} {h} {page} {host} {date} {hash}`；
  默认 `{name}_{w}x{h}.{ext}`；文件名清洗 `[\\/:*?"<>|]`，长度 ≤ 120 字节，重复自动 `-2`。
- 记录 `failed: {url, reason}[]`，UI 汇总可重试。

## Safari 兼容约束（必须遵守）

- 不使用 `chrome.webRequest`、`declarativeNetRequest`、`fontSettings`、`chrome.notifications`。
- `chrome.downloads` 视作可选能力（`typeof chrome.downloads?.download === 'function'`）。
- 不使用 `chrome.storage.session` 作为唯一存储：封装 `storage.ts`，按 `session → local` 降级。
- 不使用 `chrome.scripting.registerContentScripts`；静态注入 + `executeScript` 兜底。
- MAIN world 钩子通过 `web_accessible_resources` + `<script src>` 注入（不用 `world: "MAIN"`）。
- 所有路径相对、无 hash 文件名；manifest 不使用 `update_url`。
- 不依赖 `OffscreenCanvas` 之外的实验 API；`OffscreenCanvas` 不可用时降级到普通 canvas。

## 安全

- 注入的钩子脚本使用随机 token，只接受同 token 的 `postMessage`。
- 所有页面数据经 `textContent` 渲染，禁止 `innerHTML` 拼接（仅静态模板可用）。
- 下载 URL 只允许 `http/https/data/image` 协议。
