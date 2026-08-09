import React, { useEffect, useRef } from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import Prism from 'prismjs';
import { useReturnFocusOnClose } from '../../hooks/useReturnFocusOnClose.js';

// Elements a keyboard user could plausibly land on inside the dialog, for
// the Tab-trap below. gcds-button is included explicitly because it's a
// custom element (not a <button>) and doesn't match the native selectors.
const FOCUSABLE_SELECTOR =
  'button, gcds-button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const MetadataModal = ({ metadata, onClose, t }) => {
  const codeRef = useRef(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  // The element that had focus right before the modal opened (e.g. the
  // row's "Expand" button) — captured below so focus can return to it once
  // the modal closes, instead of being lost to <body>.
  const triggerRef = useRef(null);
  const headingId = 'metadata-modal-heading';
  const isOpen = !!metadata;

  useReturnFocusOnClose(isOpen, triggerRef);

  useEffect(() => {
    if (metadata) {
      // Must run before focus moves into the dialog below.
      triggerRef.current = document.activeElement;
      document.body.style.overflow = 'hidden';
      if (codeRef.current) {
        Prism.highlightElement(codeRef.current);
      }
      closeButtonRef.current?.focus?.();
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [metadata]);

  // Escape-to-close and a Tab/Shift+Tab focus trap, active only while open.
  useEffect(() => {
    if (!metadata) {
      return undefined;
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const focusable = dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [metadata, onClose]);

  if (!metadata) {
    return null;
  }

  const isXml =
    typeof metadata === 'string' &&
    metadata.trim().startsWith('<') &&
    metadata.trim().endsWith('>');

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-stretch justify-stretch z-[9999]"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'stretch',
        zIndex: 9999,
        padding: 0,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="bg-white flex flex-col metadata-modal"
        style={{
          position: 'relative',
          width: '100vw',
          height: '100vh',
          maxWidth: '100vw',
          maxHeight: '100vh',
          overflow: 'hidden',
          borderRadius: 0,
        }}
      >
        <div
          className="p-4 border-b flex justify-between items-center"
          style={{
            flex: '0 0 auto',
            background: '#fff',
          }}
        >
          <h2 id={headingId} className="text-xl font-semibold">{t('logging.metadataDetails')}</h2>
          <GcdsButton ref={closeButtonRef} type="button" buttonRole="secondary" onClick={onClose}>
            {t('logging.close')}
          </GcdsButton>
        </div>
        <div
          className="p-6 overflow-auto flex-grow"
          style={{
            minHeight: 0,
            overflowX: 'auto',
            overflowY: 'auto',
          }}
        >
          <pre
            className="whitespace-pre-wrap break-words"
            style={{
              maxWidth: '100%',
              fontSize: '14px',
              lineHeight: '1.5',
              margin: 0,
            }}
          >
            <code ref={codeRef} className={`language-${isXml ? 'xml' : 'json'}`}>
              {typeof metadata === 'string'
                ? metadata
                : JSON.stringify(metadata || {}, null, 2)}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
};

export default MetadataModal;
