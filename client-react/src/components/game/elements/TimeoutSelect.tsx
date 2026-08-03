import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TimeoutSelectProps {
  value: number;
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
}

export default function TimeoutSelect({ value, options, onChange }: TimeoutSelectProps) {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
    });
  };

  useEffect(() => {
    if (open) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.timeout-select') && !target.closest('.timeout-select__dropdown')) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const currentLabel = options.find((o) => o.value === value)?.label ?? `${value}s`;

  return (
    <div className="timeout-select">
      <button
        ref={triggerRef}
        type="button"
        className="timeout-select__trigger"
        onClick={() => setOpen(!open)}
      >
        <span className="timeout-select__value">{currentLabel}</span>
        <span className={`timeout-select__arrow${open ? ' timeout-select__arrow--open' : ''}`}>▼</span>
      </button>
      {open && createPortal(
        <ul className="timeout-select__dropdown" style={dropdownStyle}>
          {options.map((opt) => (
            <li
              key={opt.value}
              className={`timeout-select__option${opt.value === value ? ' timeout-select__option--selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
