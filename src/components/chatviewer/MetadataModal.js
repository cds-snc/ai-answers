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
          <h2 className="text-xl font-semibold">{t('logging.metadataDetails')}</h2>
          <GcdsButton type="button" variant="secondary" onClick={onClose}>
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
