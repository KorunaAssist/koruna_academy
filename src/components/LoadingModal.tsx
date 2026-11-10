import React from 'react';
import { createPortal } from 'react-dom';
import { KorunaLogoSvg } from './KorunaLogo';

interface LoadingModalProps {
  type?: 'login' | 'signup' | 'logout' | 'academy' | 'switching';
  message?: string;
  variant?: 'fullscreen' | 'modal';
}

export const LoadingModal: React.FC<LoadingModalProps> = ({ type = 'academy', message, variant = 'fullscreen' }) => {
  const getDisplayText = () => {
    if (message) return message;
    switch (type) {
      case 'logout':
        return 'Logging out...';
      case 'login':
        return 'Logging in...';
      case 'signup':
        return 'Creating account...';
      case 'switching':
        return 'Switching view...';
      case 'academy':
      default:
        return 'Loading Koruna Academy...';
    }
  };

  const displayText = getDisplayText();

  return createPortal(
    <div className={`loading-modal-overlay ${variant === 'modal' ? 'loading-modal-overlay--dialog' : ''}`}>
      <div
        className={`loading-modal-container ${variant === 'modal' ? 'loading-modal-container--dialog' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="loading-modal-emblem" aria-hidden="true">
          <KorunaLogoSvg
            width={40}
            height={30}
            useGradient={true}
          />
        </div>
        <div className="loading-text-label">
          <span>{displayText}</span>
        </div>
        <div className="loading-modal-track" aria-hidden="true"><span /></div>
      </div>
    </div>,
    document.body
  );
};
