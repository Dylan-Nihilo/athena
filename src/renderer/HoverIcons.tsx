import { useEffect, useRef, useSyncExternalStore } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  PlusIcon,
  RefreshCwIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import { HugeiconsIcon } from '@hugeicons/react';

// Adapted from lucide-animated. HeroUI's trigger owns hover and press handling.
const mediaQuery = '(hover: hover) and (prefers-reduced-motion: no-preference)';
const allowsMotion = () => window.matchMedia(mediaQuery).matches;
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(mediaQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};
const TurningGlyph = motion.create(HugeiconsIcon);

export function TurnIcon({
  kind,
  hovered,
  size = 16,
}: {
  kind: 'plus' | 'refresh';
  hovered: boolean;
  size?: number;
}) {
  const enabled = useSyncExternalStore(subscribe, allowsMotion);
  const angle = kind === 'plus' ? 180 : 50;
  return (
    <TurningGlyph
      icon={kind === 'plus' ? PlusIcon : RefreshCwIcon}
      strokeWidth={1.7}
      aria-hidden
      size={size}
      initial={false}
      animate={{ rotate: enabled && hovered ? angle : 0 }}
      transition={{ duration: enabled ? 0.25 : 0, ease: 'easeOut' }}
    />
  );
}

export function NavigationArrow({
  forward = false,
  hovered,
}: {
  forward?: boolean;
  hovered: boolean;
}) {
  const enabled = useSyncExternalStore(subscribe, allowsMotion);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!hovered || !enabled || !svg.current) return;
    // Stroke Rounded navigation icons draw the shaft first, then the arrowhead.
    const [shaft, head] = svg.current.querySelectorAll('path');
    if (!shaft || !head) return;
    const timing = { duration: 320, easing: 'ease-in-out' };
    const shaftMotion = shaft.animate(
      {
        transformOrigin: forward ? 'left center' : 'right center',
        transform: ['scaleX(1)', 'scaleX(.84)', 'scaleX(1)'],
      },
      timing,
    );
    const headMotion = head.animate(
      { transform: ['translateX(0)', `translateX(${forward ? -3 : 3}px)`, 'translateX(0)'] },
      timing,
    );
    return () => {
      shaftMotion.cancel();
      headMotion.cancel();
    };
  }, [enabled, forward, hovered]);
  return (
    <HugeiconsIcon
      ref={svg}
      aria-hidden
      icon={forward ? ArrowRight02Icon : ArrowLeft02Icon}
      size={16}
      strokeWidth={1.7}
    />
  );
}
