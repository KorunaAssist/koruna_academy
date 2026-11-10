import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Award, BookOpen, Building2, CheckCircle2, Mail, Save, ShieldCheck, Target, UserRound } from 'lucide-react';
import type { UserSessionData } from '../services/auth';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/db';
import './profile.css';

export function ProfileView({ userSession, onProfileUpdated, onNavigate }: {
  userSession: UserSessionData;
  onProfileUpdated: (user: UserSessionData) => void;
  onNavigate: (tab: string) => void;
}) {
  const [name, setName] = useState(userSession.name);
  const [department, setDepartment] = useState(userSession.department || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = name.trim() !== userSession.name || department.trim() !== (userSession.department || '');
  const role = userSession.role.replaceAll('_', ' ');
  const initials = userSession.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(''); setNotice('');
    const fullName = name.trim();
    const team = department.trim();
    if (!fullName || fullName.length > 100 || team.length > 100) {
      setError('Enter your name. Name and department must each be 100 characters or fewer.');
      return;
    }
    setBusy(true);
    try {
      let savedName = fullName;
      let savedDepartment = team;
      if (isSupabaseConfigured()) {
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user || auth.user.id !== userSession.id) throw new Error('Your session could not be verified. Please sign in again.');
        const { data, error: saveError } = await supabase.from('profiles')
          .update({ full_name: fullName, department: team })
          .eq('id', auth.user.id).select('full_name, department').single();
        if (saveError || !data) throw new Error(saveError?.message || 'Your profile could not be saved. Please try again.');
        savedName = data.full_name;
        savedDepartment = data.department || '';
      } else {
        const users = await dbService.getUsers();
        const existing = users.find(user => user.id === userSession.id && user.email.toLowerCase() === userSession.email.toLowerCase());
        if (!existing) throw new Error('Your profile could not be found. Please sign in again.');
        await dbService.saveUser({ ...existing, name: fullName, department: team });
      }
      onProfileUpdated({ ...userSession, name: savedName, department: savedDepartment });
      setName(savedName); setDepartment(savedDepartment);
      setNotice('Your profile has been updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save your profile. Please try again.');
    } finally { setBusy(false); }
  }

  return <section className="pf-page" aria-labelledby="profile-title">
    <header className="pf-heading"><span className="pf-eyebrow">YOUR PERSONAL SPACE</span><h1 id="profile-title">My Profile</h1><p>A little about you. Everything you need to keep growing.</p></header>
    <div className="pf-banner"><div className="pf-avatar" aria-hidden="true">{initials || 'U'}</div><div className="pf-identity"><span className="pf-eyebrow">WELCOME TO YOUR PROFILE</span><h2>{userSession.name}</h2><p>{userSession.email}</p></div><span className="pf-role"><ShieldCheck size={15}/>{role}</span></div>
    <div className="pf-layout">
      <form className="pf-card" onSubmit={save} aria-busy={busy}>
        <div className="pf-card-heading"><span className="pf-icon"><UserRound size={21}/></span><div><h2>Personal information</h2><p>Keep your details up to date.</p></div></div>
        {error && <p className="pf-alert" role="alert">{error}</p>}
        {notice && <p className="pf-notice" role="status"><CheckCircle2 size={17}/>{notice}</p>}
        <fieldset disabled={busy}>
          <label>Full name <span>*</span><input autoComplete="name" required maxLength={100} value={name} onChange={e => {setName(e.target.value);setNotice('');}}/></label>
          <label>Department<input autoComplete="organization-title" maxLength={100} placeholder="Add your department" value={department} onChange={e => {setDepartment(e.target.value);setNotice('');}}/></label>
          <label>Email address<div className="pf-readonly"><Mail size={17}/><input type="email" value={userSession.email} readOnly autoComplete="email"/></div><small>Your sign-in email is managed by your organisation.</small></label>
          <label>Account role<div className="pf-readonly"><ShieldCheck size={17}/><input className="pf-role-input" value={role} readOnly/></div><small>Contact your administrator to change your account access.</small></label>
        </fieldset>
        <footer className="pf-form-footer"><span>{dirty ? 'You have unsaved changes' : 'Your details are up to date'}</span><div><button type="button" className="pf-secondary" disabled={busy || !dirty} onClick={() => {setName(userSession.name);setDepartment(userSession.department || '');setError('');setNotice('');}}>Cancel</button><button type="submit" className="pf-primary" disabled={busy || !dirty}><Save size={16}/>{busy ? 'Saving...' : 'Save changes'}</button></div></footer>
      </form>
      <aside className="pf-side">
        <div className="pf-card"><span className="pf-eyebrow">KEEP MOVING FORWARD</span><h2>Your learning journey</h2><p>Pick up where you left off.</p>
          {[{tab:'progress',title:'My Progress',text:'See how far you have come',Icon:BookOpen},{tab:'certificates',title:'My Certificates',text:'Celebrate your achievements',Icon:Award},{tab:'career_path',title:'My Career',text:'Plan your next chapter',Icon:Target}].map(({tab,title,text,Icon}) => <button type="button" className="pf-link" key={tab} onClick={() => onNavigate(tab)}><span className="pf-icon"><Icon size={20}/></span><span><strong>{title}</strong><small>{text}</small></span><ArrowUpRight size={17}/></button>)}
        </div>
        <div className="pf-help"><Building2 size={22}/><h3>Part of something bigger</h3><p>{userSession.department ? `You are part of ${userSession.department}.` : 'Add your department to complete your profile.'} For account or access changes, reach out to your administrator.</p></div>
      </aside>
    </div>
  </section>;
}
