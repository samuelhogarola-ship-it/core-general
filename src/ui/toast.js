/**
 * core-general · ui/toast.js
 * Toast de notificación sin dependencias. Compatible con HTML puro, React, Vue, etc.
 *
 * Uso básico:
 *   import { showToast } from 'core-general/src/ui/toast.js';
 *   showToast('Mensaje enviado correctamente.');
 *
 * Requiere importar styles/toast.css (o equivalente) en el proyecto.
 */

const TOAST_ID = 'web-core-toast';
const VISIBLE_CLASS = 'web-core-toast--visible';
const DEFAULT_DURATION = 4000;

/**
 * Muestra un toast de notificación.
 *
 * @param {string} message
 * @param {object} [options]
 * @param {'success'|'error'|'info'} [options.type='success']
 * @param {number} [options.duration=4000] - ms antes de ocultarse
 */
export function showToast(message, options = {}) {
  const { type = 'success', duration = DEFAULT_DURATION } = options;

  let toast = document.getElementById(TOAST_ID);

  if (!toast) {
    toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.className = 'web-core-toast';
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
      <span class="web-core-toast__icon" aria-hidden="true"></span>
      <p class="web-core-toast__message"></p>
    `;
    document.body.appendChild(toast);
  }

  const icon = toast.querySelector('.web-core-toast__icon');
  const messageEl = toast.querySelector('.web-core-toast__message');

  toast.dataset.type = type;
  icon.textContent = type === 'error' ? '✕' : '✓';
  messageEl.textContent = message;

  toast.classList.remove(VISIBLE_CLASS);

  // Doble rAF para garantizar la transición de entrada
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add(VISIBLE_CLASS));
  });

  clearTimeout(toast._hideTimeout);
  toast._hideTimeout = setTimeout(() => {
    toast.classList.remove(VISIBLE_CLASS);
  }, duration);
}
