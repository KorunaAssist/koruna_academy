import { isSupabaseConfigured,supabase } from '../lib/supabase';

export interface Skill { id: string; name: string; description: string; archived: boolean }
export interface SkillRequirement { skill_id: string; course_id: string; lesson_id: string; lesson_title: string }
export interface SkillProgress { skill_id: string; user_id: string; required_lessons: number; completed_lessons: number; progress_percent: number; started: boolean }

function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '23505') throw new Error('A skill with that name already exists.');
  if (['42P01','42703','PGRST200','PGRST204','PGRST205'].includes(error.code || '')) {
    throw new Error('Skills are not set up in this database yet. Apply the skills dashboard migration, then retry.');
  }
  throw new Error(error.message);
}
function configured() {
  if (!isSupabaseConfigured()) throw new Error('Connect Supabase to manage and track skills.');
}
export const skillsService = {
  async catalogue(): Promise<Skill[]> {
    configured();
    const { data,error } = await supabase.from('skills').select('*').order('name');
    check(error); return (data || []) as Skill[];
  },
  async create(name: string,description: string) {
    configured();
    const { error } = await supabase.from('skills').insert({ name: name.trim(),description: description.trim() });
    check(error);
  },
  async update(id: string,changes: Partial<Pick<Skill,'name' | 'description' | 'archived'>>) {
    configured();
    const { data,error } = await supabase.from('skills').update(changes).eq('id',id).select('id').single();
    check(error); if (!data) throw new Error('The skill update was not confirmed.');
  },
  async dashboard() {
    configured();
    const results = await Promise.allSettled([
      this.catalogue(),supabase.from('skill_lesson_requirements').select('*'),supabase.from('skill_progress').select('*'),
    ] as const);
    const [catalogue,requirements,progress] = results;
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    if (catalogue.status !== 'fulfilled' || requirements.status !== 'fulfilled' || progress.status !== 'fulfilled') throw new Error('Unable to load skills.');
    check(requirements.value.error); check(progress.value.error);
    return { skills: catalogue.value,requirements: (requirements.value.data || []) as SkillRequirement[],progress: (progress.value.data || []) as SkillProgress[] };
  },
};
