// Minimal anchored positioning for tooltips, popovers and menus (fixed coordinates, viewport-clamped).
import { useLayoutEffect, useState, type RefObject } from 'react';

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Align = 'start' | 'center' | 'end';

export interface FloatingPos {
  top: number;
  left: number;
  side: Side;
}

const GAP = 6;
const MARGIN = 8;

export function computePosition(anchor: DOMRect, floating: { width: number; height: number }, side: Side, align: Align): FloatingPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let s = side;
  // Flip when there isn't room on the preferred side.
  if (s === 'top' && anchor.top - floating.height - GAP < MARGIN) s = 'bottom';
  else if (s === 'bottom' && anchor.bottom + floating.height + GAP > vh - MARGIN && anchor.top > floating.height + GAP) s = 'top';
  else if (s === 'left' && anchor.left - floating.width - GAP < MARGIN) s = 'right';
  else if (s === 'right' && anchor.right + floating.width + GAP > vw - MARGIN) s = 'left';

  let top: number;
  let left: number;
  if (s === 'top' || s === 'bottom') {
    top = s === 'top' ? anchor.top - floating.height - GAP : anchor.bottom + GAP;
    left =
      align === 'start' ? anchor.left : align === 'end' ? anchor.right - floating.width : anchor.left + anchor.width / 2 - floating.width / 2;
  } else {
    left = s === 'left' ? anchor.left - floating.width - GAP : anchor.right + GAP;
    top = align === 'start' ? anchor.top : align === 'end' ? anchor.bottom - floating.height : anchor.top + anchor.height / 2 - floating.height / 2;
  }
  left = Math.max(MARGIN, Math.min(left, vw - floating.width - MARGIN));
  top = Math.max(MARGIN, Math.min(top, vh - floating.height - MARGIN));
  return { top, left, side: s };
}

/** Tracks the floating element's position while `open` (re-measures on scroll/resize). */
export function useFloating(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  side: Side,
  align: Align,
): FloatingPos | null {
  const [pos, setPos] = useState<FloatingPos | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const a = anchorRef.current;
      const f = floatingRef.current;
      if (!a || !f) return;
      setPos(computePosition(a.getBoundingClientRect(), { width: f.offsetWidth, height: f.offsetHeight }, side, align));
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchorRef, floatingRef, side, align]);
  return pos;
}

/** Portal container: inside an open modal <dialog> (top layer) when the anchor lives in one, else <body>. */
export function portalRoot(anchor: HTMLElement | null): HTMLElement {
  return (anchor?.closest('dialog[open]') as HTMLElement | null) ?? document.body;
}
