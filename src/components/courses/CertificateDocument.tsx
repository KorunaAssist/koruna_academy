interface Props {
  recipientName: string;
  displayCourseTitle: string;
  displayTrainerName: string;
  displayIssueDate: string;
  printable?: boolean;
}

export function CertificateDocument({ recipientName, displayCourseTitle, displayTrainerName, displayIssueDate, printable = false }: Props) {
  return (
      <div
        id={printable ? "printable-certificate" : undefined}
        style={{
          width: '100%',
          maxWidth: '960px',
          containerType: 'inline-size',
          borderRadius: '24px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)',
          position: 'relative',
          overflow: 'hidden',
          background: '#ffffff'
        }}
      >
        {/* Base Image Template */}
        <img
          src="/Certificate.png"
          alt="Certificate Template"
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            userSelect: 'none'
          }}  
        />

        {/* ── Dynamic Text Overlays ── */}

        {/* 1. Recipient Name Overlay */}
        <div style={{
          position: 'absolute',
          top: '37.3%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '68%',
          textAlign: 'center',
          background: '#ffffff',
          padding: '0.25cqi 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <span style={{
            fontSize: 'clamp(8px, 4.6cqi, 44px)',
            fontWeight: 800,
            color: '#b8185c',
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            {recipientName}
          </span>
        </div>

        {/* 2. Course Title Overlay */}
        <div style={{
          position: 'absolute',
          top: '67.2%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '65%',
          textAlign: 'center',
          background: '#ffffff',
          padding: '0.16cqi 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <span style={{
            fontSize: 'clamp(5px, 2.25cqi, 22px)',
            fontWeight: 800,
            color: '#111827',
            lineHeight: 1.25,
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            {displayCourseTitle}
          </span>
        </div>

        {/* 3. Trainer Overlay */}
        <div style={{
          position: 'absolute',
          top: '82.5%',
          left: '26%',
          transform: 'translateX(-50%)',
          width: '24%',
          textAlign: 'center',
          background: '#ffffff',
          padding: '0.16cqi 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <span style={{
            fontSize: 'clamp(4px, 1.6cqi, 15px)',
            fontWeight: 700,
            color: '#111827',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            {displayTrainerName}
          </span>
        </div>

        {/* Cover the certificate-number label embedded in the template. */}
        <div aria-hidden="true" style={{
          position: 'absolute',
          top: '81%',
          left: '36%',
          width: '28%',
          height: '13%',
          background: '#ffffff'
        }} />

        {/* 5. Completion Date Overlay */}
        <div style={{
          position: 'absolute',
          top: '82.5%',
          left: '74%',
          transform: 'translateX(-50%)',
          width: '24%',
          textAlign: 'center',
          background: '#ffffff',
          padding: '0.16cqi 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <span style={{
            fontSize: 'clamp(4px, 1.6cqi, 15px)',
            fontWeight: 700,
            color: '#111827',
            fontFamily: 'Inter, system-ui, sans-serif'
          }}>
            {displayIssueDate}
          </span>
        </div>
      </div>
  );
}
