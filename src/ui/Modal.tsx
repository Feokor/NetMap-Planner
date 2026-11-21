import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

interface ModalProps {
  title: string;
  children: ComponentChildren;
  footer?: ComponentChildren;
  onClose: () => void;
  width?: string;
}

export function Modal({ title, children, footer, onClose, width }: ModalProps) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      class="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div class="modal" style={width ? { width } : undefined} role="dialog" aria-modal="true">
        <div class="modal-head">
          <h2>{title}</h2>
          <button type="button" class="btn btn-ghost btn-icon" title="Закрыть" onClick={onClose}>
            ✕
          </button>
        </div>
        <div class="modal-body">{children}</div>
        {footer && <div class="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}
