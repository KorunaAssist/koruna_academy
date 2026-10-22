import { useCallback, useEffect, useState } from 'react';
import { emptyPathData, learningPathService } from '../../services/learningPaths';

export function useLearningPaths(userId?: string) {
  const [data,setData] = useState(emptyPathData);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const reload = useCallback(async () => {
    const next = await learningPathService.load();
    setData(next);
    setError('');
    return next;
  },[]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData(emptyPathData);
    learningPathService.load().then(next => { if (active) { setData(next); setError(''); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load roadmaps.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[userId]);
  return { data,loading,error,reload };
}
