/** Minimal DOM helpers for the plain-DOM overlays. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

export function show(node: HTMLElement): void {
  node.classList.remove('hidden');
}

export function hide(node: HTMLElement): void {
  node.classList.add('hidden');
}

/** Restart a CSS animation by forcing a reflow between class toggles. */
export function replay(node: HTMLElement, animationClass: string): void {
  node.classList.remove(animationClass);
  void node.offsetWidth;
  node.classList.add(animationClass);
}
