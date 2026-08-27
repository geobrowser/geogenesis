const MAIN_SCROLL_SURFACE_SELECTOR = '[data-app-scroll-surface], [data-power-tools-scroll]';
const PANEL_ROOT_SELECTOR = '[data-entity-side-panel], [data-power-tools-entity-panel]';

function isInsideSidePanel(el: Element): boolean {
  return Boolean(el.closest(PANEL_ROOT_SELECTOR));
}

export function hideMainPageScrollbars(): () => void {
  const { documentElement: html, body } = document;

  html.classList.add('no-scrollbar');
  body.classList.add('no-scrollbar');

  const hiddenSurfaces: HTMLElement[] = [];
  for (const el of document.querySelectorAll(MAIN_SCROLL_SURFACE_SELECTOR)) {
    if (!(el instanceof HTMLElement) || isInsideSidePanel(el)) continue;
    el.classList.add('no-scrollbar');
    hiddenSurfaces.push(el);
  }

  return () => {
    html.classList.remove('no-scrollbar');
    body.classList.remove('no-scrollbar');
    for (const el of hiddenSurfaces) {
      el.classList.remove('no-scrollbar');
    }
  };
}
