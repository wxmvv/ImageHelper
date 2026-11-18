# ImageHelper Development Guide

**English** · [简体中文](DEVELOPMENT_CN.md) · [Back to README](../README.md)

## Set up

Use Node.js 24 and npm. Building the Safari extension also requires macOS and Xcode.

```sh
git clone https://github.com/wxmvv/ImageHelper.git
cd ImageHelper
npm ci
npm run build
```

The build writes the unpacked extension to `dist/`. Edit the shared source in `src/`. Generate Safari resources with the build script so the Xcode project and the shared source stay in sync.

## Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `dist/`.
3. Open a webpage and click ImageHelper in the toolbar to try extraction.
4. After rebuilding, reload ImageHelper on the extensions page and refresh the webpage under test.

Inspect the service worker from the extension card. For UI issues, inspect the toolbar popup or open DevTools in the results page.

## Safari on macOS

Build the extension for local debugging.

```sh
npm run safari:build -- --local-signing
```

Open `safari/build/Build/Products/Debug/ImageHelper.app` and enable ImageHelper in **Safari → Settings → Extensions**. To load a locally signed build, see the developer settings steps in the [Safari build notes](SAFARI.md) (Chinese).

Use `npm run safari:build -- --sync-only` to update the extension resources before building or debugging in Xcode. For a build with an Apple development certificate, set the same team on both Xcode targets and run `npm run safari:build`. To check signing and registration for the default build output, run `node tools/safari-verify.mjs`.

## Test and debug

| Command                | Purpose                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Watch and rebuild scripts and styles. Run `npm run build` again after changing static files such as HTML or locale files. |
| `npm run check`        | Run TypeScript, ESLint, Prettier, and unit tests.                                                                         |
| `npm run fixtures`     | Serve the local fixture site at `http://127.0.0.1:8123` for manual testing.                                               |
| `npm run chrome:setup` | Download Chrome for Testing for the bundled browser tests.                                                                |
| `npm run e2e`          | Run Chrome tests for extraction, filtering, downloads, and settings against local fixtures.                               |
| `npm run ui:shots`     | Capture UI screenshots under `.ref/shots/`.                                                                               |

The bundled browser test launcher expects the Apple Silicon macOS installation of Chrome for Testing. Run a fresh build before `npm run e2e` and stop any manually started fixture server first, because the suite manages its own server.

## Source layout

- `src/core/` covers filtering, URLs, filenames, and ZIP assembly.
- `src/platform/` wraps browser APIs, storage, and localization.
- `src/content/` discovers images and `src/background/` manages sessions and tabs.
- `src/pages/` and `src/ui/` contain the extension pages and shared UI.
- `tools/` and `test/` cover builds, fixtures, and automated checks.

Before opening a pull request, run `npm run build` and `npm run check`. For changes to extraction, downloads, or the UI, also run the relevant browser tests. See [AGENTS.md](../AGENTS.md) for repository conventions and the [architecture notes](ARCHITECTURE.md) for data flow.
