import { useLayoutEffect, useState } from "react";

/**
 * Whether a line-clamped element hides part of its text: its full height (scrollHeight) is taller than the lines it
 * shows. Measured after each render of `text` and again when the element changes size (rotation, resizing). Returns
 * true while `expanded` too, so the toggle that collapses it again stays visible.
 */
export const useClampedOverflow = (ref, text, expanded) => {
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || expanded) return undefined;

    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, text, expanded]);

  return overflows || expanded;
};
