import { useState, useRef, useCallback, useEffect } from 'react';

export function useLocalNav() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // Track whether the menu was opened by keyboard so we only auto-focus then
  const keyboardOpen = useRef(false);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Move focus to first menuitem only when opened via keyboard (ArrowDown/Up)
  useEffect(() => {
    if (!isOpen || !menuRef.current || !keyboardOpen.current) return;
    keyboardOpen.current = false;
    const first = menuRef.current.querySelector('[role="menuitem"]');
    first?.focus();
  }, [isOpen]);

  const onMenuKeyDown = useCallback(
    (e) => {
      if (!menuRef.current) return;
      const items = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'));
      if (!items.length) return;
      const idx = items.indexOf(document.activeElement);

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          items[(idx + 1) % items.length].focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          items[(idx - 1 + items.length) % items.length].focus();
          break;
        case 'Home':
          e.preventDefault();
          items[0].focus();
          break;
        case 'End':
          e.preventDefault();
          items[items.length - 1].focus();
          break;
        case 'Escape':
          e.preventDefault();
          close();
          break;
        case 'Tab':
          // Let focus leave the menu naturally; close it
          setIsOpen(false);
          break;
        default:
          break;
      }
    },
    [close]
  );

  const onTriggerKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        keyboardOpen.current = true;
        setIsOpen(true);
      }
    },
    []
  );

  return { isOpen, toggle, close, triggerRef, menuRef, onMenuKeyDown, onTriggerKeyDown };
}
