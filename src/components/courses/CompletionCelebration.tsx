import './completionCelebration.css';

/** Decorative, lightweight mascot shared by completion dialogs. */
export function CompletionCelebration() {
  return (
    <div className="completion-celebration" aria-hidden="true">
      <svg viewBox="0 0 240 170" width="240" height="170" focusable="false">
        <ellipse cx="120" cy="153" rx="49" ry="7" fill="#fce7f3" />
        <g className="completion-confetti" fill="#ec4899">
          <path d="m32 38 7 3-3 9-7-3z" /><path d="m195 56 8-4 4 8-8 4z" />
          <path d="m62 17 4 8-8 4-4-8z" fill="#fbbf24" />
          <path d="m173 19 7 2-2 10-7-2z" fill="#a78bfa" />
          <circle cx="24" cy="93" r="4" fill="#a78bfa" /><circle cx="215" cy="105" r="4" fill="#fbbf24" />
        </g>
        <g className="completion-mascot" stroke="#713149" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M93 130 86 148h20l5-15m21-3 3 18h20l-10-20" fill="#f9a8d4" />
          <path d="M84 88Q54 92 54 66M155 88q28-2 32-27" fill="none" strokeWidth="12" stroke="#f9a8d4" />
          <path d="M78 57Q69 24 88 25q15 1 20 22m26 0q7-27 22-22 16 6 5 35" fill="#f9a8d4" />
          <rect x="76" y="43" width="89" height="94" rx="37" fill="#fdf2f8" />
          <path d="m94 79 5-4 5 4m29 0 5-4 5 4" fill="none" />
          <ellipse cx="92" cy="91" rx="8" ry="5" fill="#f9a8d4" stroke="none" />
          <ellipse cx="148" cy="91" rx="8" ry="5" fill="#f9a8d4" stroke="none" />
          <path d="M110 91q10 17 20 0Z" fill="#ec4899" />
          <path d="m120 107 5 9 10 2-7 7 1 10-9-5-9 5 1-10-7-7 10-2Z" fill="#fbbf24" stroke="#b77913" strokeWidth="2" />
          <path d="m72 48 47-16 49 16-49 16Z" fill="#713149" />
          <path d="M160 49v22" stroke="#fbbf24" />
        </g>
      </svg>
    </div>
  );
}
