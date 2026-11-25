import React, { useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import type { DatabaseUser, Department } from '../../services/db';
import type { UserRole } from '../../services/auth';
import { getTrainerSignature, readSignatureFile, saveTrainerSignature } from '../../services/trainerSignatures';

function SignatureEditor({ user }: { user: DatabaseUser }) {
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  React.useEffect(() => {
    let cancelled = false;
    getTrainerSignature(user.id).then(value => { if (!cancelled) setImage(value); })
      .catch(error => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [user.id]);
  const save = async (file: File | null) => {
    setBusy(true);
    setMessage('');
    try {
      const next = file ? await readSignatureFile(file) : null;
      await saveTrainerSignature(user.id, next);
      setImage(next);
      setMessage(next ? 'Signature saved. Linked to certificates for courses created by this trainer.' : 'Signature removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save signature.');
    } finally { setBusy(false); }
  };
  return <div style={{ maxWidth: 260 }}>
    {image && <img src={image} alt={`Signature for ${user.name}`} style={{ display: 'block', width: 140, height: 50, objectFit: 'contain', background: 'white', marginBottom: 8 }} />}
    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
      aria-label={`${image ? 'Replace' : 'Upload'} signature for ${user.name}`}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void save(file); }} />
    <div className="as-cell-sub">PNG, JPEG or WebP, up to 500 KB. Near-white backgrounds are removed from PNG and JPEG signatures.</div>
    {image && <button type="button" className="as-btn" disabled={busy} onClick={() => void save(null)}>Remove signature</button>}
    <div role="status" className="as-cell-sub">{busy ? 'Saving signature…' : message}</div>
  </div>;
}

interface UserDirectoryViewProps {
  users: DatabaseUser[];
  departments: Department[];
  handleUpdateUserRole: (email: string, role: UserRole) => Promise<void>;
  handleUpdateUserDept: (email: string, department: string) => Promise<void>;
  handleDeleteUser: (email: string) => Promise<void>;
}

export const UserDirectoryView: React.FC<UserDirectoryViewProps> = ({
  users,
  departments,
  handleUpdateUserRole,
  handleUpdateUserDept,
  handleDeleteUser,
}) => {
  const [userSearchQuery, setUserSearchQuery] = useState('');

  const q = (s: string) => s.toLowerCase();
  const filteredUsers = users.filter(u => {
    const term = q(userSearchQuery);
    return q(u.name).includes(term) || q(u.email).includes(term) || q(u.department || '').includes(term) || q(u.role).includes(term);
  });

  return (
    <div className="as-card">
      <div className="as-card-head">
        <h3 className="as-card-title">All users ({users.length})</h3>
        <div className="as-search">
          <Search size={15} />
          <input
            type="text"
            className="as-input"
            placeholder="Search by name, email, or role"
            aria-label="Search by name, email, or role"
            value={userSearchQuery}
            onChange={(e) => setUserSearchQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="as-table-wrap">
        <table className="as-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Department</th>
              <th>Trainer signature</th>
              <th className="as-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(u => (
              <tr key={u.email}>
                <td>
                  <div className="as-cell-name">{u.name}</div>
                  <div className="as-cell-sub">{u.email}</div>
                </td>
                <td>
                  <select
                    className="as-select as-select--inline"
                    aria-label={`Role for ${u.name}`}
                    value={u.role}
                    onChange={(e) => handleUpdateUserRole(u.email, e.target.value as UserRole)}
                  >
                    <option value="employee">Employee</option>
                    <option value="team_leader">Team Leader</option>
                    <option value="trainer">Trainer</option>
                    <option value="admin">Administrator</option>
                  </select>
                </td>
                <td>
                  <select
                    className="as-select as-select--inline"
                    aria-label={`Department for ${u.name}`}
                    value={u.department || ''}
                    onChange={(e) => handleUpdateUserDept(u.email, e.target.value)}
                  >
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </td>
                <td>{u.role === 'trainer' || u.role === 'admin' ? <SignatureEditor user={u} /> : <span className="as-cell-sub">Trainers only</span>}</td>
                <td className="as-right">
                  <button
                    type="button"
                    className="as-icon-btn as-icon-btn--danger"
                    onClick={() => handleDeleteUser(u.email)}
                    title="Delete user"
                    aria-label={`Delete ${u.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr><td colSpan={5} className="as-center as-cell-sub" style={{ padding: '2rem' }}>No users match “{userSearchQuery}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
