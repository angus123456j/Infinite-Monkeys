import { useLayoutEffect, useState, type ReactNode } from "react";

const HPAD = 36;
const VPAD = 28;
/** ~ rail + gaps + 816px page + horizontal padding — layout “comfortable” above this width */
const DESIGN_MIN_WIDTH = 1240;
/** Title bar + toolbar + minimum editor chrome */
const DESIGN_MIN_HEIGHT = 700;
const MIN_SCALE = 0.52;

function readScale(): number {
  if (typeof window === "undefined") return 1;
  const sw = (window.innerWidth - HPAD) / DESIGN_MIN_WIDTH;
  const sh = (window.innerHeight - VPAD) / DESIGN_MIN_HEIGHT;
  return Math.min(1, sw, sh);
}

/**
 * On smaller viewports, scales the entire subtree uniformly (same aspect / proportions as a
 * large display) so fixed-width editor chrome does not crowd the document column.
 */
export default function ViewportScale({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(readScale);

  useLayoutEffect(() => {
    const onResize = () => setScale(readScale());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const s = Math.max(MIN_SCALE, Math.min(1, scale));

  if (s >= 0.997) {
    return <>{children}</>;
  }

  return (
    <div className="viewport-scale-root">
      <div
        className="viewport-scale-stage"
        style={{
          transform: `scale(${s})`,
          width: `calc(100vw / ${s})`,
          height: `calc(100vh / ${s})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
