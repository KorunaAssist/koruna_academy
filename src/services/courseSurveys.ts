import { isSupabaseConfigured,supabase } from '../lib/supabase';

export type SurveyQuestionKind = 'rating' | 'choice' | 'text';
export interface SurveyQuestion { id:string; question:string; kind:SurveyQuestionKind; options:string[]; required:boolean }
export interface CourseSurvey { enabled:boolean; requiredForCertificate:boolean; allowSkip:boolean; anonymous:boolean; questions:SurveyQuestion[] }
export interface SurveyStatus { enabled:boolean; required_for_certificate:boolean; anonymous:boolean; submitted:boolean }
export interface SurveyResultAnswer { value:string; respondent:string|null }
export interface SurveyResultQuestion { id:string; question:string; kind:SurveyQuestionKind; responses:number; average:number|null; answers:SurveyResultAnswer[]; comments:{text:string;respondent:string|null}[] }
export interface CourseSurveyResults { responses:number; questions:SurveyResultQuestion[] }
const inactive: CourseSurvey = { enabled:false,requiredForCertificate:false,allowSkip:true,anonymous:false,questions:[] };
const check=(error:{message:string}|null)=>{if(error) throw new Error(error.message);};
export const courseSurveyService={
  async load(courseId:string):Promise<CourseSurvey>{ if(!isSupabaseConfigured()) return inactive; const [survey,questions]=await Promise.all([supabase.from('course_surveys').select('*').eq('course_id',courseId).maybeSingle(),supabase.from('course_survey_questions').select('*').eq('course_id',courseId).order('position')]); check(survey.error);check(questions.error); return survey.data?{enabled:survey.data.enabled,requiredForCertificate:survey.data.required_for_certificate,allowSkip:survey.data.allow_skip ?? !survey.data.required_for_certificate,anonymous:survey.data.anonymous,questions:(questions.data||[]).map((q:any)=>({id:q.id,question:q.question,kind:q.kind,options:q.options||[],required:q.required}))}:inactive; },
  async save(courseId:string,survey:CourseSurvey){if(!isSupabaseConfigured()) return; const {error}=await supabase.rpc('save_course_survey_settings',{p_course_id:courseId,p_enabled:survey.enabled,p_required:survey.requiredForCertificate,p_anonymous:survey.anonymous,p_questions:survey.questions,p_allow_skip:survey.allowSkip});check(error);},
  async status(courseId:string):Promise<SurveyStatus>{const {data,error}=await supabase.rpc('get_course_survey_status',{p_course_id:courseId});check(error);return data as SurveyStatus;},
  async submit(courseId:string,answers:Record<string,string|number>,anonymous:boolean){const {error}=await supabase.rpc('submit_course_survey',{p_course_id:courseId,p_answers:answers,p_anonymous:anonymous});check(error);},
  async results(courseId:string){const {data,error}=await supabase.rpc('get_course_survey_results',{p_course_id:courseId});check(error);return data as CourseSurveyResults | null;}
};
