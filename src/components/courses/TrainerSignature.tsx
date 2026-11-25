import { useEffect, useState } from 'react';
import { getTrainerSignature } from '../../services/trainerSignatures';

export function TrainerSignature({ profileId, trainerName }: { profileId?: string | null; trainerName?: string }) {
  const [signature, setSignature] = useState<{ id: string; image: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSignature(null);
    if (profileId) getTrainerSignature(profileId, trainerName).then(image => {
      if (!cancelled) setSignature(image ? { id: profileId, image } : null);
    }).catch(() => { if (!cancelled) setSignature(null); });
    return () => { cancelled = true; };
  }, [profileId, trainerName]);
  if (!signature || signature.id !== profileId) return null;
  return <img src={signature.image} alt="Trainer signature" style={{ position: 'absolute', top: '79%', left: '14%', width: '24%', height: '6.5%', objectFit: 'contain', objectPosition: 'center bottom', zIndex: 1 }} />;
}
