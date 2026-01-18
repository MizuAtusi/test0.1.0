import type { PointerEvent as ReactPointerEvent } from 'react';
import type { EffectImage } from '@/lib/effects';
import type { StageRect } from '@/lib/stageFit';

const BASE_WIDTH = 1200;
const BASE_HEIGHT = 675;

type TitleScreenItem = EffectImage & {
  kind?: 'image' | 'pc';
  characterId?: string;
};

export function TitleScreenCanvas({
  items,
  stageRect,
  containerWidth,
  containerHeight,
  isSelected,
  onPointerDown,
  showGuide,
  className,
  pointerEvents,
}: {
  items: TitleScreenItem[];
  stageRect: StageRect;
  containerWidth?: number;
  containerHeight?: number;
  isSelected?: (item: TitleScreenItem) => boolean;
  onPointerDown?: (event: ReactPointerEvent, item: TitleScreenItem) => void;
  showGuide?: boolean;
  className?: string;
  pointerEvents?: React.CSSProperties['pointerEvents'];
}) {
  const scale = stageRect.width > 0 ? stageRect.width / BASE_WIDTH : 0;
  const isDev = import.meta.env?.DEV;

  if (isDev && typeof containerWidth === 'number' && typeof containerHeight === 'number') {
    const tooWide = stageRect.width > containerWidth + 0.5;
    const tooTall = stageRect.height > containerHeight + 0.5;
    if (tooWide || tooTall) {
      console.error('[Title][rect:invalid]', {
        containerWidth,
        containerHeight,
        stageRect,
      });
    } else {
      console.log('[Title][rect]', {
        containerWidth,
        containerHeight,
        stageRect,
      });
    }
  }

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        left: stageRect.x,
        top: stageRect.y,
        width: stageRect.width,
        height: stageRect.height,
        pointerEvents,
      }}
    >
      {showGuide && (
        <div
          className="absolute left-0 top-0 pointer-events-none"
          style={{
            width: stageRect.width,
            height: stageRect.height,
            border: '1px dashed rgba(255, 255, 255, 0.4)',
            boxSizing: 'border-box',
          }}
        />
      )}
      <div
        className="relative"
        style={{
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {items.map((item) => {
          const anchor = item.anchor === 'top-left' ? 'top-left' : 'center';
          const left =
            anchor === 'top-left' ? item.x * BASE_WIDTH : BASE_WIDTH / 2 + item.x * BASE_WIDTH;
          const top =
            anchor === 'top-left' ? item.y * BASE_HEIGHT : BASE_HEIGHT / 2 + item.y * BASE_HEIGHT;
          const baseTransform = anchor === 'top-left' ? 'translate(0, 0)' : 'translate(-50%, -50%)';
          const transformOrigin = anchor === 'top-left' ? 'top left' : 'center';
          const active = isSelected ? isSelected(item) : false;
          return (
            <div
              key={item.id}
              className={`absolute ${active ? 'ring-2 ring-primary' : ''}`}
              style={{
                left,
                top,
                transform: `${baseTransform} rotate(${item.rotate}deg) scale(${item.scale})`,
                transformOrigin,
                opacity: item.opacity,
                zIndex: item.z,
                cursor: onPointerDown ? 'grab' : undefined,
                userSelect: 'none',
              }}
              onPointerDown={onPointerDown ? (event) => onPointerDown(event, item) : undefined}
            >
              <img
                src={item.url}
                alt={item.label}
                className="object-contain pointer-events-none select-none"
                style={{ maxWidth: BASE_WIDTH, maxHeight: BASE_HEIGHT }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
