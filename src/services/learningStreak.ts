import { supabase } from '../lib/supabase';

export function calculateLearningStreak(days:string[], now = new Date()):number {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const dates = new Set(days);
  let current = Date.parse(`${today}T00:00:00Z`);
  const date = () => new Date(current).toISOString().slice(0,10);
  if (!dates.has(date())) current -= 86400000;
  let streak = 0;
  while (dates.has(date())) { streak++; current -= 86400000; }
  return streak;
}

export async function loadLearningStreak():Promise<number> {
  const {data,error} = await supabase.from('learning_activity_days').select('activity_date').order('activity_date',{ascending:false});
  if (error) throw error;
  return calculateLearningStreak((data || []).map(row => row.activity_date));
}
