import { isSupabaseConfigured,supabase } from '../lib/supabase';

export interface ReportOption { id: string; name: string }
export interface ReportPerson extends ReportOption { email: string; department: string }
export interface ReportCourse {
  course_id: string; title: string; code: string; percent: number; assigned: boolean;
  due_at: string | null; overdue: boolean; quiz_score: number | null; can_assign: boolean; last_reminder_at: string | null;
}
export interface ReportPath {
  path_id: string; version_id: string; name: string; version_number: number; source: string;
  due_at: string | null; percent: number; required: number; completed: number; overdue: boolean;
  can_assign: boolean; last_reminder_at: string | null;
}
export interface ReportSkill { skill_id: string; name: string; percent: number; required: number; completed: number }
export interface ReportLearner extends ReportPerson { courses: ReportCourse[]; paths: ReportPath[]; skills: ReportSkill[] }
export interface ReportPractical {
  id: string; user_id: string; user_name: string; course_id: string; course_title: string;
  submission_text: string; status: 'pending' | 'approved' | 'rejected'; date_submitted: string; review_feedback: string | null;
  reviewed_at: string | null; reviewer_name: string | null;
}
export interface TeamReport {
  learners: ReportLearner[]; practicals: ReportPractical[]; assignment_learners: ReportPerson[];
  team_candidates: ReportPerson[];
  assignable_courses: ReportOption[]; assignable_paths: ReportOption[]; managers: ReportOption[];
  team_members: { manager_id: string; member_id: string }[]; generated_at: string;
}
export const emptyTeamReport: TeamReport = { learners: [],practicals: [],assignment_learners: [],team_candidates: [],assignable_courses: [],assignable_paths: [],managers: [],team_members: [],generated_at: '' };

async function rpc(name: string,args?: Record<string,unknown>) {
  if (!isSupabaseConfigured()) throw new Error('Connect Supabase to use Team Reports.');
  const { data,error } = await supabase.rpc(name,args);
  if (error) {
    if (['PGRST202','42883','42P01','42703'].includes(error.code)) throw new Error(`Team Reports needs the ${name==='get_learning_team_directory' ? '202611020002_team_leader_members.sql' : '202611020001_team_reports.sql'} migration. Apply it in Supabase, then retry.`);
    throw new Error(error.message);
  }
  return data;
}
export const teamReportsService = {
  async load(): Promise<TeamReport> {
    const results = await Promise.allSettled([rpc('get_team_learning_report'),rpc('get_learning_team_directory')]);
    for (const result of results) if (result.status==='rejected') throw result.reason;
    const [report,directory] = results.map(result => result.status==='fulfilled' ? result.value : null);
    const result = report;
    if (!result || !directory) throw new Error('The report could not be loaded.');
    return { ...result,team_candidates: directory.candidates,managers: directory.managers,team_members: directory.team_members } as TeamReport;
  },
  async assign(userId: string,kind: 'course' | 'path',itemId: string,dueAt?: string,remove = false) {
    await rpc('assign_team_training',{ p_user_id: userId,p_kind: kind,p_item_id: itemId,p_due_at: dueAt || null,p_remove: remove });
  },
  async remind(userId: string,kind: 'course' | 'path',itemId: string) {
    await rpc('send_training_reminder',{ p_user_id: userId,p_kind: kind,p_item_id: itemId });
  },
  async review(id: string,status: 'approved' | 'rejected',feedback: string) {
    await rpc('review_team_practical',{ p_submission_id: id,p_status: status,p_feedback: feedback });
  },
  async setTeam(managerId: string,memberId: string,remove = false) {
    await rpc('set_learning_team_member',{ p_manager_id: managerId,p_member_id: memberId,p_remove: remove });
  },
};
