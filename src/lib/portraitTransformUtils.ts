import type { PortraitPosition } from '@/lib/portraitTransformsShared';

export const STAGE_BASE_WIDTH = 1200;
export const STAGE_BASE_HEIGHT = 675;

type AssetTransformSource = {
  scale?: number | null;
  offset_x?: number | null;
  offset_y?: number | null;
  scale_left?: number | null;
  offset_x_left?: number | null;
  offset_y_left?: number | null;
  scale_center?: number | null;
  offset_x_center?: number | null;
  offset_y_center?: number | null;
  scale_right?: number | null;
  offset_x_right?: number | null;
  offset_y_right?: number | null;
};

function toNumber(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function relToBasePxX(rel: number) {
  return Math.round(rel * STAGE_BASE_WIDTH);
}

export function relToBasePxY(rel: number) {
  return Math.round(rel * STAGE_BASE_HEIGHT);
}

export function basePxToRelX(value: unknown) {
  const n = toNumber(value);
  return n == null ? undefined : n / STAGE_BASE_WIDTH;
}

export function basePxToRelY(value: unknown) {
  const n = toNumber(value);
  return n == null ? undefined : n / STAGE_BASE_HEIGHT;
}

export function legacyTransformToRel(transform: { scale?: number; offsetX?: number; offsetY?: number } | null) {
  if (!transform) return null;
  const scale = toNumber(transform.scale);
  const x = basePxToRelX(transform.offsetX);
  const y = basePxToRelY(transform.offsetY);
  if (scale == null && x == null && y == null) return null;
  return { scale, x, y };
}

export function hasPositionTransformColumns(asset: AssetTransformSource, position: PortraitPosition) {
  if (position === 'left') {
    return asset.scale_left != null || asset.offset_x_left != null || asset.offset_y_left != null;
  }
  if (position === 'right') {
    return asset.scale_right != null || asset.offset_x_right != null || asset.offset_y_right != null;
  }
  return asset.scale_center != null || asset.offset_x_center != null || asset.offset_y_center != null;
}

export function getAssetLegacyTransformRel(asset: AssetTransformSource) {
  const scale = toNumber(asset.scale);
  const x = basePxToRelX(asset.offset_x);
  const y = basePxToRelY(asset.offset_y);
  if (scale == null && x == null && y == null) return null;
  return { scale, x, y };
}

export function getAssetTransformRel(asset: AssetTransformSource, position: PortraitPosition) {
  const fromPosition = () => {
    if (position === 'left') {
      return {
        scale: toNumber(asset.scale_left),
        x: basePxToRelX(asset.offset_x_left),
        y: basePxToRelY(asset.offset_y_left),
      };
    }
    if (position === 'right') {
      return {
        scale: toNumber(asset.scale_right),
        x: basePxToRelX(asset.offset_x_right),
        y: basePxToRelY(asset.offset_y_right),
      };
    }
    return {
      scale: toNumber(asset.scale_center),
      x: basePxToRelX(asset.offset_x_center),
      y: basePxToRelY(asset.offset_y_center),
    };
  };

  const pos = fromPosition();
  const hasPos = pos.scale != null || pos.x != null || pos.y != null;
  if (hasPos) return pos;

  return getAssetLegacyTransformRel(asset);
}
