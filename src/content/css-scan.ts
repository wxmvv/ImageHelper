import type { RawImage } from './types.ts';

function urls(text: string, source: RawImage['source'], base = document.baseURI): RawImage[] {
  return [...text.matchAll(/url\(\s*['"]?([^'")]+)/gi)].flatMap((match) => {
    try {
      return [{ url: new URL(match[1]?.trim() ?? '', base).href, source }];
    } catch {
      return [];
    }
  });
}

export function scanStyleSheets(): RawImage[] {
  const images: RawImage[] = [];
  const visit = (rules: CSSRuleList, base: string): void => {
    for (const rule of rules) {
      if ('style' in rule) images.push(...urls((rule.style as CSSStyleDeclaration).cssText, 'cssom', base));
      if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules, base);
      if (rule instanceof CSSImportRule && rule.styleSheet) read(rule.styleSheet);
    }
  };
  const read = (sheet: CSSStyleSheet): void => {
    try {
      visit(sheet.cssRules, sheet.href || document.baseURI);
    } catch {
      /* Cross-origin sheets deliberately deny CSSOM access. */
    }
  };
  for (const sheet of document.styleSheets) read(sheet);
  return images;
}

export async function scanComputedStyles(signal?: AbortSignal): Promise<RawImage[]> {
  const elements = document.querySelectorAll<HTMLElement>('body *');
  const images: RawImage[] = [];
  for (let offset = 0; offset < elements.length && !signal?.aborted; offset += 400) {
    await new Promise<void>((resolve) => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 100 });
      else setTimeout(resolve, 0);
    });
    for (let i = offset; i < Math.min(offset + 400, elements.length) && !signal?.aborted; i++) {
      const el = elements[i];
      if (
        !el ||
        /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(el.tagName) ||
        !(el.offsetWidth || el.offsetHeight)
      )
        continue;
      images.push(...urls(getComputedStyle(el).backgroundImage, 'css-bg'));
    }
  }
  return images;
}

export function isCssHidden(el: Element): boolean {
  const style = getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
}
