import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface LearningPath { id: string; name: string; description: string; created_by: string | null }
export interface PathVersion {
  id: string; path_id: string; version_number: number; name: string; description: string;
  status: 'draft' | 'published' | 'archived';
}
export interface PathCourse { version_id: string; course_id: string; position: number; required: boolean }
export interface Prerequisite { course_id: string; prerequisite_course_id: string }
export interface PathEnrolment {
  id: string; path_id: string; version_id: string; user_id: string;
  source: 'self' | 'automatic' | 'assigned'; due_at: string | null;
}
export interface PathProgress {
  enrolment_id: string; path_id: string; version_id: string; user_id: string;
  progress_percent: number; completed_courses: number; required_courses: number;
}
export interface PathData {
  paths: LearningPath[]; versions: PathVersion[]; courses: PathCourse[];
  prerequisites: Prerequisite[]; enrolments: PathEnrolment[]; progress: PathProgress[];
}
export const emptyPathData: PathData = { paths: [], versions: [], courses: [], prerequisites: [], enrolments: [], progress: [] };

function configured() {
  if (!isSupabaseConfigured()) throw new Error('Connect Supabase to create and join learning roadmaps.');
}
function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
export const learningPathService = {
  async prerequisites(): Promise<Prerequisite[]> {
    if (!isSupabaseConfigured()) return [];
    const { data,error } = await supabase.from('course_prerequisites').select('*');
    check(error);
    return (data || []) as Prerequisite[];
  },
  async load(): Promise<PathData> {
    configured();
    const tables = ['learning_paths','learning_path_versions','learning_path_courses','course_prerequisites','learning_path_enrolments','learning_path_progress'];
    const results = await Promise.allSettled(tables.map(table => supabase.from(table).select('*')));
    const data = results.map(result => {
      if (result.status === 'rejected') throw new Error('Unable to load learning paths. Please retry.');
      check(result.value.error);
      return result.value.data || [];
    });
    return { paths: data[0], versions: data[1], courses: data[2], prerequisites: data[3], enrolments: data[4], progress: data[5] } as PathData;
  },
  async saveDraft(input: { name: string; description: string; versionId: string | null;
    courses: { course_id: string; required: boolean }[];
    prerequisites: { course_id: string; prerequisite_course_ids: string[] }[] }): Promise<string> {
    configured();
    const { data, error } = await supabase.rpc('save_learning_path_draft', {
      p_name: input.name, p_description: input.description, p_courses: input.courses,
      p_version_id: input.versionId, p_prerequisites: input.prerequisites,
    });
    check(error);
    if (!data) throw new Error('The roadmap save was not confirmed.');
    return data as string;
  },
  async setStatus(versionId: string, status: 'published' | 'archived') {
    configured();
    const { data, error } = await supabase.from('learning_path_versions').update({ status }).eq('id',versionId).select('id').single();
    check(error);
    if (!data) throw new Error('The roadmap status could not be changed.');
  },
  async clone(versionId: string): Promise<string> {
    configured();
    const { data, error } = await supabase.rpc('clone_learning_path_version', { p_version_id: versionId });
    check(error);
    if (!data) throw new Error('The new draft could not be created.');
    return data as string;
  },
  async enrol(pathId: string, userId?: string, dueAt?: string) {
    configured();
    const { error } = await supabase.rpc('enrol_learning_path', {
      p_path_id: pathId, ...(userId ? { p_user_id: userId } : {}), ...(dueAt ? { p_due_at: dueAt } : {}),
    });
    check(error);
  },
  async setAssignment(pathId: string,userId: string,dueAt?: string,remove = false) {
    configured();
    const { error } = await supabase.rpc('set_learning_path_assignment', {
      p_path_id:pathId,p_user_id:userId,p_due_at:dueAt || null,p_remove:remove,
    });
    check(error);
  },
  async moveLearnerToLatestVersion(pathId: string,userId: string) {
    configured();
    const { error } = await supabase.rpc('move_learning_path_learner_to_latest_version', { p_path_id:pathId,p_user_id:userId });
    check(error);
  },
  async restoreVersion(versionId: string) {
    configured();
    const { error } = await supabase.rpc('restore_learning_path_version', { p_version_id:versionId });
    check(error);
  },
  async deleteArchivedVersion(versionId: string) {
    configured();
    const { error } = await supabase.rpc('delete_archived_learning_path_version', { p_version_id:versionId });
    check(error);
  },
};
