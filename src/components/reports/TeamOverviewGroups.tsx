import type { ReactNode } from 'react';
import type { TeamOverviewGroup } from '../../services/teamReportMetrics';
import type { ReportLearner } from '../../services/teamReports';

export function TeamOverviewGroups({ groups,renderMember }: {
  groups: TeamOverviewGroup<ReportLearner>[]; renderMember: (member: ReportLearner) => ReactNode;
}) {
  return <div className="lp-stack">
    {!groups.length && <p className="lp-empty">No team leaders to display. Add a Team Leader in User Directory to get started.</p>}
    {groups.map(group => <section className="lp-panel lp-stack tr-team-group" key={group.leader.id} aria-label={`${group.leader.name} team`}>
      <div className="lp-toolbar"><h2>Team leader — {group.leader.name}</h2><span className="lp-badge">{group.totalMembers} {group.totalMembers===1 ? 'member' : 'members'}</span></div>
      {group.members.length ? <ul className="tr-team-members">{group.members.map(member => <li key={member.id}>
        <details><summary><strong>{member.name}</strong><span className="lp-muted">{member.department || 'No department'}</span></summary>
          {renderMember(member)}
        </details>
      </li>)}</ul> : <p className="lp-muted">{group.totalMembers===0 ? 'No members assigned yet.' : 'No members match the selected filters.'}</p>}
    </section>)}
  </div>;
}
