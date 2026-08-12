import React, { useEffect, useMemo, useRef } from 'react';
import { GcdsButton } from '@gcds-core/components-react';
import Prism from 'prismjs';
// The json grammar is a separate component (xml is aliased in Prism core).
// Imported here rather than relied on as a side effect of ChatViewer's own
// import, so this modal highlights correctly wherever it gets mounted.
import 'prismjs/components/prism-json.js';
import { useReturnFocusOnClose } from '../../hooks/useReturnFocusOnClose.js';

// Elements a keyboard user could plausibly land on inside the dialog, for
// the Tab-trap below. gcds-button is included explicitly because it's a
// custom element (not a <button>) and doesn't match the native selectors.
const FOCUSABLE_SELECTOR =
  'button, gcds-button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Highlighting is done here, to an HTML string React renders itself, rather
// than by pointing Prism.highlightElement at a live <code> node. Prism
// rewrites the innerHTML of whatever element it is given — if React owned
// that element's children, it would later reconcile against nodes Prism had
// already destroyed (the same class of failure as DataTables re-parenting a
// React-rendered <table>). dangerouslySetInnerHTML makes React the only
// writer: it never reconciles children it did not create, so even the
// document-wide Prism.highlightAll() in useChatLogsTable can't corrupt it.
//
// Safe against injection: Prism escapes & and < as it tokenizes, and the
// no-grammar fallback escapes explicitly.
//
// TODO(follow-up, PR #1684 review): duplicates the exported escapeHtml in
// src/utils/chatviewer/chatViewer.js (used by buildMetadataCellHtml for the
// same underlying feature — the table's metadata cell). That one also escapes
// quotes; this one deliberately doesn't need to since it only feeds text-node
// content, not an HTML attribute — but the duplication risks silent
// divergence if one gets tightened later and the other doesn't. Worth
// consolidating into one shared helper.
const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const highlightToHtml = (text, language) => {
  const grammar = Prism.languages[language];
  return grammar ? Prism.highlight(text, grammar, language) : escapeHtml(text);
};

const MetadataModal = ({ metadata, onClose, t }) => {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  // The element that had focus right before the modal opened (e.g. the
  // row's "Expand" button) — captured below so focus can return to it once
  // the modal closes, instead of being lost to <body>.
  const triggerRef = useRef(null);
  const headingId = 'metadata-modal-heading';
  const isOpen = !!metadata;

  useReturnFocusOnClose(isOpen, triggerRef);

  // Keep the latest onClose in a ref so the keydown-trap effect below only
  // needs to key off `metadata` — onClose is a new function identity on
  // every ChatViewer render, and including it directly in that effect's
  // deps meant the document keydown listener was torn down and re-attached
  // on every render while the modal stayed open.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (metadata) {
      // Must run before focus moves into the dialog below.
      triggerRef.current = document.activeElement;
      document.body.style.overflow = 'hidden';
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
        onCloseRef.current();
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
  }, [metadata]);

  // Above the early return below, so the hook order stays stable whether or
  // not the modal is open.
  const { language, html } = useMemo(() => {
    if (!metadata) {
      return { language: 'json', html: '' };
    }

    const isXml =
      typeof metadata === 'string' &&
      metadata.trim().startsWith('<') &&
      metadata.trim().endsWith('>');
    const text =
      typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {}, null, 2);
    const lang = isXml ? 'xml' : 'json';

    return { language: lang, html: highlightToHtml(text, lang) };
  }, [metadata]);

  if (!metadata) {
    return null;
  }

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
          {/* The language- class goes on the <pre> as well as the <code>
              because that is what prism.css themes, and it is what
              Prism.highlightElement used to copy up from the <code> before
              highlighting moved into the render above. */}
          <pre
            className={`language-${language} whitespace-pre-wrap break-words`}
            style={{
              maxWidth: '100%',
              fontSize: '14px',
              lineHeight: '1.5',
              margin: 0,
            }}
          >
            <code
              className={`language-${language}`}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </pre>
        </div>
      </div>
    </div>
  );
};

export default MetadataModal;
