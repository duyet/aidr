import { useEffect, useRef } from "react";

/**
 * Attach to any horizontally-scrollable element (chip rows, the /about
 * pipeline diagram, the runs table) so mouse WHEEL scrolling moves it
 * sideways instead of doing nothing. React's onWheel is passive, so
 * preventDefault() inside it is silently ignored — the listener has to be
 * attached manually with { passive: false }.
 *
 * Also drives the `.edge-fade-x` class (styles.css): sets the `--fade-l`
 * and `--fade-r` CSS custom properties to 24px only on the side(s) that
 * still have content to scroll to, so the mask never fades an edge that's
 * already fully visible.
 *
 * The read/write batching here is a fix, not a style choice. The old
 * `update()` read `clientWidth`/`scrollWidth` and then wrote two custom
 * properties *unconditionally* on every scroll event, so a scroll burst left
 * the element's inline style dirty ~60 times a second. The next
 * geometry read — the scroll listener, the ResizeObserver, or anything else
 * on the page that measures after that write — then had to flush a pending
 * layout. Lighthouse attributed 33 ms of homepage forced reflow; this is the
 * only first-party geometry-read-after-style-write on the route.
 *
 * Two changes remove it:
 *   1. the custom properties are only written when the value actually
 *      changes, so a settled scroll container writes nothing at all and
 *      leaves no dirty style behind; and
 *   2. scroll-driven updates are coalesced into one rAF, so a burst costs
 *      one read and one write instead of one of each per event.
 */
export function useHorizontalScroll<
  T extends HTMLElement = HTMLDivElement,
>(): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let lastLeft: string | null = null;
    let lastRight: string | null = null;
    let frame = 0;

    // Read all geometry first, then write. No interleaved read-after-write,
    // so this can never force a synchronous layout on its own.
    const update = () => {
      frame = 0;
      const canScrollLeft = el.scrollLeft > 0;
      const canScrollRight =
        el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      const nextLeft = canScrollLeft ? "24px" : "0px";
      const nextRight = canScrollRight ? "24px" : "0px";
      if (nextLeft !== lastLeft) {
        el.style.setProperty("--fade-l", nextLeft);
        lastLeft = nextLeft;
      }
      if (nextRight !== lastRight) {
        el.style.setProperty("--fade-r", nextRight);
        lastRight = nextRight;
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY && !e.deltaX) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
        schedule();
      }
    };

    update();
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", schedule, { passive: true });
    // ResizeObserver already runs after layout, so its callback can read
    // geometry without a forced reflow.
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", schedule);
      resizeObserver.disconnect();
    };
  }, []);

  return ref;
}
