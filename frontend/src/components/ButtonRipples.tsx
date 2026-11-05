import { useEffect } from 'react';

/** Delegated feedback also covers buttons mounted later in dialogs and portals. */
export function ButtonRipples() {
  useEffect(() => {
    const overlays = new Set<HTMLDivElement>();
    const clear = () => {
      overlays.forEach((overlay) => overlay.remove());
      overlays.clear();
    };
    const showRipple = (event: MouseEvent | PointerEvent) => {
      if (event.type === 'click' && event.detail !== 0) return;
      if (event.button !== 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const button = event.target instanceof Element
        ? event.target.closest<HTMLElement>('button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]')
        : null;
      if (!button || button.matches(':disabled, [aria-disabled="true"]')) return;

      const bounds = button.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const keyboard = event.type === 'click';
      const x = keyboard ? bounds.width / 2 : event.clientX - bounds.left;
      const y = keyboard ? bounds.height / 2 : event.clientY - bounds.top;
      const diameter = 2 * Math.hypot(Math.max(x, bounds.width - x), Math.max(y, bounds.height - y));
      const style = getComputedStyle(button);
      const overlay = document.createElement('div');
      overlay.className = 'button-ripple-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      Object.assign(overlay.style, {
        left: `${bounds.left}px`, top: `${bounds.top}px`,
        width: `${bounds.width}px`, height: `${bounds.height}px`,
        borderRadius: style.borderRadius, color: style.color,
      });
      const wave = document.createElement('span');
      wave.className = 'button-ripple-wave';
      Object.assign(wave.style, {
        width: `${diameter}px`, height: `${diameter}px`,
        left: `${x - diameter / 2}px`, top: `${y - diameter / 2}px`,
      });
      overlay.append(wave);
      document.body.append(overlay);
      overlays.add(overlay);
      const animation = wave.animate([
        { transform: 'scale(0)', opacity: 0.22 },
        { transform: 'scale(1)', opacity: 0 },
      ], { duration: 550, easing: 'ease-out' });
      animation.finished.finally(() => {
        overlay.remove();
        overlays.delete(overlay);
      });
    };
    document.addEventListener('pointerdown', showRipple, true);
    document.addEventListener('click', showRipple, true);
    document.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => {
      document.removeEventListener('pointerdown', showRipple, true);
      document.removeEventListener('click', showRipple, true);
      document.removeEventListener('scroll', clear, true);
      window.removeEventListener('resize', clear);
      clear();
    };
  }, []);
  return null;
}
