const PATHS = {
  logo: '',
  image: 'M3 3h18v18H3z M3 16l5-5 5 5 3-3 5 5 M8 7h.01',
  download: 'M12 3v12m-5-5 5 5 5-5 M4 16v5h16v-5',
  copy: 'M8 8h13v13H8z M16 8V3H3v13h5',
  external: 'M14 3h7v7 M21 3l-11 11 M10 3H3v18h18v-7',
  close: 'M6 6l12 12 M6 18 18 6',
  refresh: 'M20 8a9 9 0 1 0 1 8 M20 2v6h-6',
  scroll: 'M12 3v18 M7 8l5-5 5 5 M7 16l5 5 5-5',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 4 1 2 5-2 5-4 1-1 3H9l-1-3-4-1-2-5 2-5 4-1z',
  trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  check: 'M4 12l5 5L20 6',
  invert: 'M5 9h14M15 5l4 4-4 4 M19 15H5m4-4-4 4 4 4',
  'zoom-in': 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6 M7 10h6m-3-3v6',
  'zoom-out': 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6 M7 10h6',
  'chevron-down': 'M6 9l6 6 6-6',
  filter: 'M3 4h18l-7 8v8l-4-2v-6z',
  sort: 'M4 6h16 M4 12h11 M4 18h6',
  zip: 'M5 3h14v18H5z M10 3v3h4v3h-4v3h4v5h-4v-5',
  spinner: 'M21 12a9 9 0 1 1-9-9',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  alert: 'M12 3 2 21h20z M12 9v5 M12 18h.01',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  'x-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M8 8l8 8 M8 16l8-8',
} as const;
export type IconName = keyof typeof PATHS;
export function icon(name: IconName, size = 16): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    stroke: 'currentColor',
    fill: 'none',
    'stroke-width': '1.6',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    svg.setAttribute(key, String(value));
  if (name === 'logo') {
    svg.setAttribute('viewBox', '0 0 256 256');
    const image = document.createElementNS(svg.namespaceURI, 'image');
    image.setAttribute('href', './assets/icons/icon.svg');
    image.setAttribute('width', '256');
    image.setAttribute('height', '256');
    svg.append(image);
    return svg;
  }
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
}
