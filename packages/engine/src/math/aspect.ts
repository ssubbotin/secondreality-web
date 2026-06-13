export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Mode-X 320x200 pixels were non-square: the buffer was displayed on a 4:3 CRT,
 * so the intended DISPLAY aspect is 4/3, not 320/200 (=1.6). Render targets that
 * reproduce a mode-X part must present at this aspect or circles/balls look stretched.
 */
export const MODEX_DISPLAY_ASPECT = 4 / 3;

/** Largest rect of ratio `contentAspect` centered inside `outerW x outerH` (CSS "contain"). */
export function computeContainRect(outerW: number, outerH: number, contentAspect: number): Rect {
  const outerAspect = outerW / outerH;
  if (outerAspect > contentAspect) {
    // outer is wider -> limited by height (pillarbox)
    const height = outerH;
    const width = height * contentAspect;
    return { x: (outerW - width) / 2, y: 0, width, height };
  }
  // outer is taller (or equal) -> limited by width (letterbox)
  const width = outerW;
  const height = width / contentAspect;
  return { x: 0, y: (outerH - height) / 2, width, height };
}
