import { useLayoutEffect, useRef, useState } from "react";

// single line of text that scrolls back and forth when it doesn't fit,
// so long titles never change the height of their row
export default function Marquee({ text, className = "" }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    function measure() {
      setOverflow(Math.max(0, Math.ceil(inner.scrollWidth - outer.clientWidth)));
    }
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [text]);

  const isOverflowing = overflow > 0;

  return (
    <span
      ref={outerRef}
      className={`marquee ${isOverflowing ? "is-overflowing" : ""} ${className}`}
      style={{
        "--marquee-distance": `${overflow}px`,
        // ~40px per second, with time to rest at each end
        "--marquee-duration": `${Math.max(5, overflow / 40 + 3)}s`,
      }}
      title={isOverflowing ? text : undefined}
    >
      <span ref={innerRef} className="marquee-inner">
        {text}
      </span>
    </span>
  );
}
