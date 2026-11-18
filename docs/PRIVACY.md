# ImageHelper Privacy Policy

**English** · [简体中文](PRIVACY_CN.md) · [Back to README](../README.md)

Effective 18 November 2026. This policy covers the ImageHelper extensions for Chrome and Safari.

ImageHelper processes extraction results on your device. The extension has no account system, developer-operated backend, advertising, or analytics. The project does not sell extension user data.

## Website access and image extraction

On sites where your browser grants access, ImageHelper can read page titles, page and frame URLs, and image references in page content and styles. To find images that load early or appear dynamically, it can observe resource timing and look for image URLs in supported `fetch` and `XMLHttpRequest` responses. It can buffer candidate URLs in the page before you open the results. ImageHelper uses these records to show source pages and image results, including available dimensions, file sizes, and alt text.

The extension opens the URLs you submit for multi-URL extraction in background tabs. It combines the results locally and closes the tabs it opened.

## Network requests and sharing

ImageHelper contacts the relevant websites or image hosts when it opens a submitted page, displays a favicon, loads thumbnails or previews, compares similar images, or downloads files. These recipients may receive the URL being requested and ordinary request information, such as your IP address. The browser may send cookies or a referrer when the request and browser settings allow it.

ImageHelper builds ZIP archives locally and saves downloads through your browser. It writes image links to your clipboard when you choose a copy action. It does not send extraction results or settings to the developer.

## Local storage and controls

Settings and saved filters are stored locally in the browser. Extraction sessions, including page and image URLs, may be stored in browser session storage or in extension-local storage where session storage is unavailable. This allows results to survive interruptions such as a background process restart. ImageHelper attempts to remove session snapshots when you close or navigate away from their source tabs.

ImageHelper's options control whether CSS scanning, network observations, and page request hooks contribute to extraction results. Use your browser's extension controls to manage site access or disable ImageHelper. To remove stored extension data, use your browser's data removal or uninstall controls. Downloaded files can be deleted separately.

## Chrome Web Store Limited Use

ImageHelper's use of information obtained through Chrome APIs follows the limited-use requirements of the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use). The extension uses this information to provide image extraction, preview, filtering, and download features.

## Questions and changes

For privacy questions, use [GitHub Issues](https://github.com/wxmvv/ImageHelper/issues). Issues are public, so omit private links, credentials, and personal information. Policy changes will appear on this page with an updated effective date.
