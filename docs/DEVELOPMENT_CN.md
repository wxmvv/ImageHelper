# ImageHelper 开发指南

[English](DEVELOPMENT.md) · **简体中文** · [返回 README](../README_CN.md)

## 准备环境

使用 Node.js 24 和 npm。构建 Safari 扩展还需要 macOS 和 Xcode。

```sh
git clone https://github.com/wxmvv/ImageHelper.git
cd ImageHelper
npm ci
npm run build
```

构建后，`dist/` 可直接加载为解压扩展。两种浏览器共用 `src/` 中的源码。修改后通过构建脚本同步 Safari 扩展资源。

## Chrome

1. 打开 `chrome://extensions`，启用「开发者模式」。
2. 选择「加载已解压的扩展程序」，打开 `dist/`。
3. 打开网页，点击工具栏上的 ImageHelper 测试提取。
4. 重新构建后，在扩展管理页重新加载 ImageHelper，并刷新正在测试的网页。

可从扩展管理页检查 Service Worker。调试界面时，可检查工具栏弹窗，或在结果页打开开发者工具。

## macOS 上的 Safari

用本地签名构建调试版。

```sh
npm run safari:build -- --local-signing
```

打开 `safari/build/Build/Products/Debug/ImageHelper.app`，在「Safari → 设置 → 扩展」启用 ImageHelper。本地签名构建的启用步骤见 [Safari 构建说明](SAFARI.md)。

在 Xcode 构建或调试前，可运行 `npm run safari:build -- --sync-only` 同步资源。若使用 Apple 开发证书，请为两个 Xcode target 配置同一团队，再运行 `npm run safari:build`。可用 `node tools/safari-verify.mjs` 检查默认构建产物的签名和注册状态。

## 测试与调试

| 命令                   | 用途                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`          | 监听并重新构建脚本和样式。修改 HTML、语言文件等静态资源后，请重新运行 `npm run build`。 |
| `npm run check`        | 运行 TypeScript、ESLint、Prettier 和单元测试。                                          |
| `npm run fixtures`     | 在 `http://127.0.0.1:8123` 启动本地测试站点，供手动测试。                               |
| `npm run chrome:setup` | 下载浏览器测试使用的 Chrome for Testing。                                               |
| `npm run e2e`          | 用 Chrome 和本地测试站点覆盖提取、筛选、下载和设置流程。                                |
| `npm run ui:shots`     | 将界面截图保存到 `.ref/shots/`。                                                        |

仓库自带的测试启动器使用 macOS Apple Silicon 版 Chrome for Testing。运行 `npm run e2e` 前先重新构建，并关闭手动启动的测试站点，测试会自行管理服务器。

## 源码目录

- `src/core/` 包含筛选、URL、文件命名和 ZIP 打包。
- `src/platform/` 封装浏览器 API、存储和国际化。
- `src/content/` 发现图片，`src/background/` 管理会话和标签页。
- `src/pages/` 和 `src/ui/` 包含页面及共用界面组件。
- `tools/` 和 `test/` 包含构建工具、测试站点和自动化测试。

提交 Pull Request 前，请运行 `npm run build` 和 `npm run check`。涉及提取、下载或界面的改动，请同时运行相关浏览器测试。开发约定见 [AGENTS.md](../AGENTS.md)，数据流见[架构说明](ARCHITECTURE.md)。
