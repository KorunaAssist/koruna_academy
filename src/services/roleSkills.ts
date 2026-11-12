import { supabase,isSupabaseConfigured } from '../lib/supabase';

export interface SkillRole { id: string; name: string; skillIds: string[] }
function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
export const roleSkillsService = {
  async load(): Promise<SkillRole[]> {
    if (!isSupabaseConfigured()) throw new Error('Connect Supabase to manage role skills.');
    const { data,error } = await supabase.from('skill_roles').select('id,name,role_skills(skill_id)').order('name');
    check(error);
    return (data || []).map(role => ({ id:role.id,name:role.name,skillIds:role.role_skills.map(link => link.skill_id) }));
  },
  async save(id: string | undefined,name: string,skillIds: string[]) {
    const { error } = await supabase.rpc('save_skill_role',{ p_id:id || null,p_name:name.trim(),p_skill_ids:skillIds });
    check(error);
  },
};
