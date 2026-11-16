import type { UserSessionData } from '../../services/auth';
import { useLearningPaths } from './useLearningPaths';
import './learningPaths.css';

export function AssignedLearningPaths({ userSession, onOpen }: { userSession: UserSessionData; onOpen: () => void }) {
  const { data, loading, error, reload } = useLearningPaths(userSession.id);
  const assignments = data.enrolments.filter(e => e.user_id === userSession.id && e.source === 'assigned');
  return <section className="lp-stack" aria-label="Assigned learning paths" style={{ marginBottom: '1.5rem' }}>
    <div className="lp-toolbar"><h2>Assigned learning paths</h2><button className="lp-button" onClick={onOpen}>View learning paths</button></div>
    {loading && <p role="status">Loading assigned learning paths...</p>}
    {error && <div className="lp-alert" role="alert">{error}<button className="lp-button" onClick={() => { void reload().catch(() => {}); }}>Retry</button></div>}
    {!loading && !error && !assignments.length && <p className="lp-muted">Learning paths assigned by your admin will appear here.</p>}
    <div className="lp-card-grid">{assignments.map(enrolment => {
      const version = data.versions.find(v => v.id === enrolment.version_id);
      const progress = data.progress.find(p => p.enrolment_id === enrolment.id)?.progress_percent || 0;
      return <button className="lp-roadmap-card" key={enrolment.id} onClick={onOpen}>
        <span className="lp-badge">Assigned</span>
        <h3>{version?.name || data.paths.find(p => p.id === enrolment.path_id)?.name || 'Assigned learning path'}</h3>
        {version?.description && <p>{version.description}</p>}
        {enrolment.due_at && <small>Due {new Date(enrolment.due_at).toLocaleDateString()}</small>}
        <progress aria-label={`${version?.name || 'Learning path'} progress`} max={100} value={progress}/>
        <strong>{progress}% complete</strong><span className="lp-card-link">View learning path</span>
      </button>;
    })}</div>
  </section>;
}
