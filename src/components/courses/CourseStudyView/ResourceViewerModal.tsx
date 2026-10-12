import React, { useState, useEffect } from 'react';
import {
  X,
  File,
  ExternalLink
} from 'lucide-react';

export interface ResourceFile {
  name: string;
  url: string;
  size?: number;
}

interface ResourceViewerModalProps {
  file: ResourceFile | null;
  onClose: () => void;
  courseTitle?: string;
}

export const ResourceViewerModal: React.FC<ResourceViewerModalProps> = ({
  file,
  onClose
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!file) return null;

  const ext = file.name.split('.').pop()?.toLowerCase() || 'file';
  const hasPreviewUrl = Boolean(file.url && file.url !== '#' && file.url.length > 5);
  const isPdf = ext === 'pdf';
  const isImage = ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'].includes(ext);
  const isText = ['txt', 'csv', 'md', 'json', 'xml', 'log'].includes(ext)
    || file.url.startsWith('data:text/')
    || file.url.startsWith('data:application/json');

  const fileTypeLabel = ext.toUpperCase();
  const pdfPreviewUrl = getPdfPreviewUrl(file.url);

  return (
    <div
      className="koruna-modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'transparent',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem'
      }}
    >
      <div
        className="koruna-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(940px, 100%)',
          height: 'min(82vh, 760px)',
          position: 'relative',
          overflow: 'visible'
        }}
      >
        <button
          onClick={onClose}
          title="Close preview"
          style={{
            position: 'absolute',
            top: '-14px',
            right: '-14px',
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            color: '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 8px 22px rgba(15, 23, 42, 0.18)',
            zIndex: 1
          }}
        >
          <X size={18} />
        </button>

        {hasPreviewUrl && isImage ? (
          <div style={{ height: '100%', minHeight: '520px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src={file.url}
              alt={file.name}
              style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain' }}
            />
          </div>
        ) : hasPreviewUrl && isPdf ? (
          <iframe
            src={pdfPreviewUrl}
            title={file.name}
            style={{ width: '100%', height: '82vh', minHeight: '520px', border: 'none', display: 'block', background: '#ffffff' }}
          />
        ) : hasPreviewUrl && isText ? (
          <TextContentPreview url={file.url} />
        ) : hasPreviewUrl && file.url.startsWith('http') && ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext) ? (
          <iframe
            src={`https://docs.google.com/gview?url=${encodeURIComponent(file.url)}&embedded=true`}
            title={file.name}
            style={{ width: '100%', height: '82vh', minHeight: '520px', border: 'none', display: 'block', background: '#ffffff' }}
          />
        ) : (
          <SimpleFilePreview
            fileName={file.name}
            fileTypeLabel={fileTypeLabel}
            hasPreviewUrl={hasPreviewUrl}
            url={file.url}
          />
        )}
      </div>
    </div>
  );
};

const getPdfPreviewUrl = (url: string) => {
  if (url.includes('#')) {
    return `${url}&toolbar=0&navpanes=0&scrollbar=0`;
  }

  return `${url}#toolbar=0&navpanes=0&scrollbar=0`;
};

const SimpleFilePreview: React.FC<{
  fileName: string;
  fileTypeLabel: string;
  hasPreviewUrl: boolean;
  url: string;
}> = ({ fileName, fileTypeLabel, hasPreviewUrl, url }) => (
  <div
    style={{
      minHeight: '520px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.85rem',
      padding: '2rem',
      textAlign: 'center',
      color: '#475569'
    }}
  >
    <div
      style={{
        width: '56px',
        height: '56px',
        borderRadius: '10px',
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <File size={28} style={{ color: '#64748b' }} />
    </div>
    <div>
      <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a', fontWeight: 800 }}>{fileName}</h3>
      <p style={{ margin: '0.35rem 0 0', fontSize: '0.86rem', fontWeight: 600 }}>
        {hasPreviewUrl ? `${fileTypeLabel} preview is not available here.` : 'No online preview is available for this file.'}
      </p>
    </div>
    {hasPreviewUrl && (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          color: 'var(--koruna-primary, #a82c5d)',
          fontSize: '0.85rem',
          fontWeight: 800,
          textDecoration: 'none'
        }}
      >
        Open file <ExternalLink size={15} />
      </a>
    )}
  </div>
);

const TextContentPreview: React.FC<{ url: string }> = ({ url }) => {
  const [text, setText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);

    if (url.startsWith('data:')) {
      try {
        const base64Index = url.indexOf(';base64,');
        if (base64Index !== -1) {
          setText(atob(url.substring(base64Index + 8)));
        } else {
          const commaIndex = url.indexOf(',');
          setText(decodeURIComponent(url.substring(commaIndex + 1)));
        }
      } catch {
        setText('Unable to decode file content.');
      }
      setLoading(false);
      return;
    }

    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
      fetch(url)
        .then(res => res.text())
        .then(data => setText(data))
        .catch(() => setText('Content preview unavailable for this file URL.'))
        .finally(() => setLoading(false));
      return;
    }

    setText(url);
    setLoading(false);
  }, [url]);

  return (
    <div
      style={{
        minHeight: '520px',
        padding: '1.25rem',
        color: '#0f172a',
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        fontSize: '0.86rem',
        lineHeight: 1.6,
        overflow: 'auto'
      }}
    >
      {loading ? (
        <div style={{ color: '#64748b', fontFamily: 'Inter, system-ui, sans-serif' }}>Loading preview...</div>
      ) : (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
          {text || 'File is empty.'}
        </pre>
      )}
    </div>
  );
};
