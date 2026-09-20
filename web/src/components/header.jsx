import { createContext, useContext, useEffect, useRef } from 'react';

/**
 * The phone header has two states: the large title that sits at the top of
 * each section, and the compact 44px bar that fades in once the large title
 * has scrolled away. The shell owns the bar; each section's <PageTitle> tells
 * it (through this context) whether the large title is still on screen.
 */
export const HeaderContext = createContext({ setCollapsed: () => {} });

export function PageTitle({ eyebrow, title, children, action, className }) {
  const { setCollapsed } = useContext(HeaderContext);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      // The compact bar is 44px + safe area; treat the title as gone once it is
      // tucked underneath that bar rather than once it leaves the viewport.
      { rootMargin: '-60px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      setCollapsed(false);
    };
  }, [setCollapsed]);

  return (
    <div className={`page-head${className ? ` ${className}` : ''}`}>
      <div className="page-head-text">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="large-title" ref={ref}>
          {title}
        </h1>
        {children && <p className="page-lede">{children}</p>}
      </div>
      {action && <div className="page-head-action">{action}</div>}
    </div>
  );
}
