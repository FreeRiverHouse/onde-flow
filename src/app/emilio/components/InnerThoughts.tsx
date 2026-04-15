'use client';

import { useEffect, useState } from 'react';

interface InnerThoughtsProps {
  thought?: string;
}

export default function InnerThoughts({ thought }: InnerThoughtsProps) {
  const [visible, setVisible] = useState(false);
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    if (thought) {
      setDisplayed(thought);
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [thought]);

  if (!displayed) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '12%',
        left: '8%',
        maxWidth: '220px',
        pointerEvents: 'none',
        zIndex: 10,
        opacity: visible ? 1 : 0,
        transition: 'opacity 300ms ease-in-out',
      }}
    >
      <div
        style={{
          background: 'rgba(5, 5, 20, 0.55)',
          border: '1px solid rgba(124, 58, 237, 0.25)',
          borderRadius: '10px',
          padding: '8px 12px',
          color: 'rgba(180, 160, 255, 0.7)',
          fontSize: '11px',
          fontStyle: 'italic',
          fontFamily: 'JetBrains Mono, monospace',
          lineHeight: '1.4',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        💭 {displayed}
      </div>
    </div>
  );
}
