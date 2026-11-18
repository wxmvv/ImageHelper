# Safari 版本

Chrome 与 Safari 共用同一份 `src/`，Safari 版由官方转换器生成 Xcode 工程并编译成 macOS App。

## 构建

```bash
npm run safari:build
```

日常构建保留现有 Xcode 工程、团队签名、Swift 文件及用户设置，不删除 `safari/`。

1. `npm run build` → `dist/`。
2. 复制到 `.tools/dist-safari/`，仅在副本移除 `downloads` 权限、
   `options_ui.open_in_tab`、`minimum_chrome_version`，不修改 Chrome 清单。
3. 只有工程不存在时才调用 converter 创建工程并修正 bundle id；已有目录但工程不完整时停止，避免覆盖。
4. 同步扩展 `Resources/`，清理生成目录内过期资源。新增或删除根目录文件时会先停止，
   需在 Xcode 更新对应文件和扩展 target membership 后重试；目录内部资源可直接同步。
5. 新建工程首次用 ad-hoc 签名；已有工程完全沿用 Xcode 签名配置。
   团队、证书不一致时由 Xcode 报错，不静默回退成本地签名。

```bash
npm run safari:build -- --open          # 构建并启动 App
npm run safari:build -- --sync-only     # 构建网页并同步资源，随后可在 Xcode ⌘R
npm run safari:build -- --no-build      # 使用已有 dist/
npm run safari:build -- --local-signing # 仅本次强制 ad-hoc，不修改工程签名配置
npm run safari:build -- --help
```

产物：`safari/build/Build/Products/Debug/ImageHelper.app`。脚本需要支持直接运行 TypeScript 的 Node（推荐 Node 24）。
有团队时，请在 Xcode 为 **ImageHelper** 和 **ImageHelper Extension** 选择同一 Team 和开发证书。
签名失败会直接报告错误，证书或钥匙串权限需按 Xcode 提示处理。
不要设置 `CODE_SIGNING_ALLOWED=NO`，否则扩展会丢失沙盒 entitlement，无法正常注册。

## 启用（需要手动点两次，macOS 安全限制）

```bash
open safari/build/Build/Products/Debug/ImageHelper.app
```

然后：

1. Safari → 设置 → 高级 → 勾选「显示网页开发者功能」
2. 使用 ad-hoc 签名时：设置 → 开发者 → 勾选 **允许未签名的扩展**（退出 Safari 后需重勾；旧版入口在「开发」菜单）
3. Safari → 设置 → 扩展 → 勾选 **ImageHelper**

完成后工具栏出现图标，点击 → 「提取本页图片」。

## 当前状态（2026-11-08）

- 编译：`** BUILD SUCCEEDED **`，appex 内含全部资源（manifest / background.js / sniffer.js / page-hook.js /
  四个页面 + hash-worker.js / _locales / icons / styles）。
- 注册：`pluginkit -m -p com.apple.Safari.web-extension` 列出 `+ com.wxm.imagehelper.Extension(1.0)`。
- **已在真实 Safari 中验证通过**（Safari 26 / macOS 27）：
  - 工具栏点击 → 新标签打开 `safari-web-extension://…/extractor.html?tabId=1173`；
  - 筛选页渲染 10 张卡片，10 张缩略图全部加载成功，统计显示 `10 images · 0 selected · 10.1 KB`；
  - 选中 2 张 → 「下载选中」→ 通过 `a[download]` + blob 保存 ZIP（4388 字节），
    `unzip -l` 校验 2 个条目且字节数与原图一致；
  - 页面侧 fetch 钩子已注入（`window.fetch.toString()` 为包装后的实现），说明 content script 与 MAIN world 注入均生效。
- 验证脚本：`node tools/safari-verify.mjs`（检查签名、沙盒、注册、运行状态）。

## 兼容性处理

| Chrome 能力                               | Safari 情况              | 本项目做法                                                                           |
| ----------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| `chrome.downloads`                        | 不存在                   | `platform/download-sink.ts`：downloads → `a[download]`+blob → `window.open` 三级降级 |
| `chrome.storage.session`                  | 可用性随版本             | `platform/storage.ts`：session → local 自动降级                                      |
| `chrome.runtime.sendMessage` 返回 Promise | 旧版本只有回调           | `platform/rpc.ts::callRuntimeMessage` 同时兼容两种形态                               |
| `world: "MAIN"` 注入                      | 支持不稳定               | 用 `web_accessible_resources` + `<script src>` + 随机 token                          |
| `chrome.scripting.executeScript`          | 16.4+ 支持，受限页会失败 | 失败返回 false，UI 提示「当前页面不支持提取」                                        |
| `declarativeNetRequest` / `webRequest`    | 不支持（阻塞式）         | 完全未使用，嗅探走 PerformanceObserver + DOM/CSS                                     |
| `OffscreenCanvas`                         | 支持                     | 相似去重 Worker 内使用，失败降级普通 canvas                                          |

## 已知限制

- 未签名扩展每次启动 Safari 都要重新「允许未签名扩展」。要长期使用需用开发者证书签名（`DEVELOPMENT_TEAM` +
  `CODE_SIGN_STYLE=Automatic`，宿主和扩展必须使用同一证书）。
- Safari 的 `blob:` 下载会弹出保存对话框；批量下载建议用 ZIP 模式（一次对话框）。
- 部分站点对 `fetch` 有严格 CORS/CSP，ZIP 打包时个别图片会失败并计入失败列表（可在 UI 重试）。
