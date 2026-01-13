import { useEffect, useMemo, useRef, useState } from 'react';

export function StageFrame({
  ratio = 16 / 9,
  mode = 'contain',
  className,
  children,
}: {
  ratio?: number;
  mode?: 'contain' | 'width';
  className?: string;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setAvailable({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const size = useMemo(() => {
    const w = available.width;
    const h = available.height;
    if (!w) return null;
    if (mode === 'width' || !h) {
      const width = w;
      const height = width / ratio;
      return { width, height };
    }
    const width = Math.min(w, h * ratio);
    const height = width / ratio;
    return { width, height };
  }, [available.width, available.height, ratio, mode]);

  return (
    <div ref={rootRef} className={`flex items-center justify-center ${className ?? ''}`}>
      <div
        className="relative mx-auto"
        style={size ? { width: size.width, height: size.height } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
