import { on } from '../../ui/dom.ts';

interface Point {
  x: number;
  y: number;
}
interface Pointer {
  start: Point;
  point: Point;
  touch: boolean;
}

function position(event: MouseEvent): Point {
  return { x: event.clientX, y: event.clientY };
}

function geometry(pointers: Map<number, Pointer>): { center: Point; distance: number } | undefined {
  const [a, b] = pointers.values();
  if (!a || !b) return undefined;
  return {
    center: { x: (a.point.x + b.point.x) / 2, y: (a.point.y + b.point.y) / 2 },
    distance: Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y),
  };
}

export function bindLightboxGestures(
  root: HTMLElement,
  image: HTMLImageElement,
  step: (delta: number) => void,
) {
  const pointers = new Map<number, Pointer>();
  let scale = 1;
  let x = 0;
  let y = 0;
  let pinched = false;
  const render = (): void => {
    image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };
  const reset = (): void => {
    pointers.clear();
    pinched = false;
    scale = 1;
    x = y = 0;
    render();
  };
  const zoom = (factor: number, point?: Point): void => {
    const next = Math.max(0.2, Math.min(8, scale * factor));
    const box = root.getBoundingClientRect();
    const px = point ? point.x - box.left - box.width / 2 : 0;
    const py = point ? point.y - box.top - box.height / 2 : 0;
    x = px - ((px - x) * next) / scale;
    y = py - ((py - y) * next) / scale;
    scale = next;
  };
  const release = (event: PointerEvent, cancelled: boolean): void => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointers.delete(event.pointerId);
    const wasPinched = pinched;
    if (!pointers.size) pinched = false;
    if (!pointer.touch || cancelled || wasPinched || scale > 1) return;
    const dx = event.clientX - pointer.start.x;
    const dy = event.clientY - pointer.start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  };
  const off = [
    on(
      root,
      'wheel',
      (e) => {
        e.preventDefault();
        const event = e as WheelEvent;
        zoom(Math.exp(-event.deltaY * 0.002), position(event));
        render();
      },
      { passive: false },
    ),
    on(image, 'dblclick', () => {
      if (scale !== 1) reset();
      else {
        zoom(2);
        render();
      }
    }),
    on(image, 'pointerdown', (e) => {
      const event = e as PointerEvent;
      if (event.button !== 0 || pointers.size >= 2) return;
      const point = position(event);
      pointers.set(event.pointerId, { start: point, point, touch: event.pointerType === 'touch' });
      if (pointers.size > 1) pinched = true;
      image.setPointerCapture(event.pointerId);
    }),
    on(image, 'pointermove', (e) => {
      const event = e as PointerEvent;
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      const previous = pointer.point;
      const before = geometry(pointers);
      pointer.point = position(event);
      const after = geometry(pointers);
      if (before && after) {
        zoom(after.distance / Math.max(1, before.distance), before.center);
        x += after.center.x - before.center.x;
        y += after.center.y - before.center.y;
      } else if (!pointer.touch || scale > 1) {
        x += pointer.point.x - previous.x;
        y += pointer.point.y - previous.y;
      }
      render();
    }),
    on(image, 'pointerup', (e) => release(e as PointerEvent, false)),
    on(image, 'pointercancel', (e) => release(e as PointerEvent, true)),
    on(image, 'lostpointercapture', (e) => release(e as PointerEvent, true)),
  ];
  return {
    reset,
    zoomBy(factor: number): void {
      if (factor < 1 && scale > 1 && scale * factor <= 1) reset();
      else {
        zoom(factor);
        render();
      }
    },
    dispose(): void {
      off.forEach((unbind) => unbind());
    },
  };
}
