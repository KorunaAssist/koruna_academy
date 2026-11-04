import { isSupabaseConfigured,supabase } from '../lib/supabase';
import { learningPathService } from './learningPaths';
import { skillsService } from './skills';

export interface CareerStage {
  id: string; title: string; description: string;
  course_ids: string[]; roadmap_version_ids: string[];
  skills: { skill_id: string; target_percent: number }[];
}
export interface CareerPath {
  id: string; name: string; description: string; stages: CareerStage[];
  status: 'draft' | 'published' | 'archived'; created_by: string | null; created_at: string;
}
export interface CareerGoal { user_id: string; path_id: string; selected_at: string }

function configured() {
  if (!isSupabaseConfigured()) throw new Error('Connect Supabase to create and track career paths.');
}
function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (['42P01','42883','PGRST202','PGRST205'].includes(error.code || '')) {
    throw new Error('Career Paths are not set up yet. Apply 202611030001_career_paths.sql, then retry.');
  }
  throw new Error(error.message);
}
export const careerPathService = {
  async load() {
    configured();
    const results = await Promise.allSettled([
      supabase.from('career_paths').select('*').order('created_at',{ascending:false}),
      supabase.from('career_goals').select('*'),
    ]);
    const data = results.map(result => {
      if (result.status === 'rejected') throw result.reason;
      check(result.value.error); return result.value.data || [];
    });
    return { paths: data[0] as CareerPath[],goals: data[1] as CareerGoal[] };
  },
  async save(input: { name: string; description: string; stages: CareerStage[]; id?: string; publish: boolean }) {
    configured();
    const {data,error} = await supabase.rpc('save_career_path',{
      p_name:input.name,p_description:input.description,p_stages:input.stages,p_path_id:input.id || null,p_publish:input.publish,
    });
    check(error); if (!data) throw new Error('The career path save was not confirmed.');
    return data as string;
  },
  async archive(id: string) {
    configured(); const {error} = await supabase.rpc('archive_career_path',{p_path_id:id}); check(error);
  },
  async setGoal(id: string | null) {
    configured(); const {error} = await supabase.rpc('set_career_goal',{p_path_id:id}); check(error);
  },
};

export async function loadCareerWorkspace() {
  const results = await Promise.allSettled([
    careerPathService.load(),learningPathService.load(),skillsService.dashboard(),
  ] as const);
  for (const result of results) if (result.status==='rejected') throw result.reason;
  const [career,roadmaps,skills] = results;
  if (career.status!=='fulfilled' || roadmaps.status!=='fulfilled' || skills.status!=='fulfilled') throw new Error('Unable to load career paths.');
  return {...career.value,roadmaps:roadmaps.value,...skills.value};
}
export type CareerWorkspace = Awaited<ReturnType<typeof loadCareerWorkspace>>;
