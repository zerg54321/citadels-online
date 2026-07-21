import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  show: boolean;
  title?: string;
  dialogClass?: string;
  headerClass?: string;
  onClose?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}

// Replaces Vue's common/Modal.vue. Uses a portal to document.body so the
// overlay escapes any transformed/clipped ancestor. Bootstrap 4 modal classes
// are reused from the shared SCSS; no jQuery/Bootstrap JS dependency.
export default function Modal({
  show,
  title = '',
  dialogClass = 'modal-dialog-centered',
  headerClass = '',
  onClose,
  children,
  footer,
}: ModalProps) {
  if (!show) return null;
  return createPortal(
    <div className="modal fade show d-block" style={{ background: 'rgba(0,0,0,0.65)', zIndex: 1050 }}>
      <div className={`modal-dialog ${dialogClass}`}>
        <div className="modal-content">
          <div className={`modal-header ${headerClass}`}>
            <h5 className="modal-title mb-0">{title}</h5>
            <button type="button" className="close text-white" onClick={onClose} aria-label="close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
