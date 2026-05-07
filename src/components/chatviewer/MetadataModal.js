import React, { useEffect, useRef } from 'react';
import { GcdsButton } from '@cdssnc/gcds-components-react';
import Prism from 'prismjs';

const MetadataModal = ({ metadata, onClose, t }) => {
  const codeRef = useRef(null);

  useEffect(() => {
    if (metadata) {
      document.body.style.overflow = 'hidden';
      if (codeRef.current) {
        Prism.highlightElement(codeRef.current);
      }
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [metadata]);

  if (!metadata) {
    return null;
  }

  const isXml =
    typeof metadata === 'string' &&
    metadata.trim().startsWith('<') &&
    metadata.trim().endsWith('>');

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '2rem',
      }}
    >
      <div
        className="bg-white rounded-lg w-full max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col metadata-modal"
        style={{ position: 'relative' }}
      >
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold">{t('logging.metadataDetails')}</h2>
          <GcdsButton type="button" variant="secondary" onClick={onClose}>
            {t('logging.close')}
          </GcdsButton>
        </div>
        <div className="p-6 overflow-auto flex-grow">
          <pre
            className="whitespace-pre-wrap break-words"
            style={{ maxWidth: '100%', fontSize: '14px', lineHeight: '1.5' }}
          >
            <code ref={codeRef} className={`language-${isXml ? 'xml' : 'json'}`}>
              {typeof metadata === 'string'
                ? metadata.replace(/\n/g, '\n')
                : JSON.stringify(metadata || {}, null, 2).replace(/\n/g, '\n')}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
};

export default MetadataModal;
