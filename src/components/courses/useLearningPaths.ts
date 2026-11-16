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
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.visibilityState === 'hidden') return;
      refreshing = true;
      try {
        const next = await learningPathService.load();
        if (active) { setData(next); setError(''); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to refresh learning paths.');
      } finally { refreshing = false; }
    };
    setLoading(true);
    setData(emptyPathData);
    learningPathService.load().then(next => { if (active) { setData(next); setError(''); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load roadmaps.'); })
      .finally(() => { if (active) setLoading(false); });
    const interval = window.setInterval(() => { void refresh(); }, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  },[userId]);
  return { data,loading,error,reload };
}
