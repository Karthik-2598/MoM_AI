import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Icons } from './Icons';
import './App.css';

const API_URL = 'https://mom-ai.onrender.com';
const TEMPLATES = [
  { key: 'General', icon: '📊', label: 'General' },
  { key: 'Technical', icon: '⚙️', label: 'Technical' },
  { key: 'Board', icon: '🏛️', label: 'Board' },
  { key: 'Sales', icon: '💼', label: 'Sales' },
];

function App() {
  /* ===== STATE ===== */
  const [theme, setTheme] = useState(localStorage.getItem('notula_theme') || 'dark');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('mom_user')) || null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('input');
  const [history, setHistory] = useState([]);
  const [template, setTemplate] = useState('General');
  const [toasts, setToasts] = useState([]);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');

  /* ===== THEME ===== */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('notula_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  /* ===== TOAST SYSTEM ===== */
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  /* ===== AUTH ===== */
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm),
      });
      const result = await res.json();
      if (result.error) { setAuthError(result.error); return; }
      if (authMode === 'login') {
        localStorage.setItem('mom_user', JSON.stringify(result));
        setUser(result);
        setActiveTab('input');
        showToast('Welcome back! 👋');
      } else {
        showToast('Account created! Please login.', 'success');
        setAuthMode('login');
      }
    } catch {
      setAuthError('Connection failed. Is the server running?');
    }
  };

  const logout = () => {
    localStorage.removeItem('mom_user');
    setUser(null);
    setHistory([]);
    setData(null);
    setMeetingNotes('');
    showToast('Logged out successfully', 'info');
  };

  /* ===== HISTORY ===== */
  const fetchHistory = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/api/history`, {
        headers: { 'Authorization': `Bearer ${user.token}` },
      });
      const result = await res.json();
      setHistory(result);
    } catch {
      console.error('Failed to fetch history');
    }
  }, [user]);

  const saveMeetingToDB = async () => {
    if (!data || !user) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/save-meeting`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${user.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: data.meetingTitle, date: data.date, rawNotes: meetingNotes, analysis: data, templateType: template }),
      });
      if (res.ok) { showToast('Meeting saved to history!'); fetchHistory(); }
    } catch { showToast('Failed to save meeting', 'error'); }
    finally { setLoading(false); }
  };

  const deleteMeeting = async (id, e) => {
    e.stopPropagation(); // Prevent card click
    if (!window.confirm('Are you sure you want to delete this meeting?')) return;
    try {
      const res = await fetch(`${API_URL}/api/history/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${user.token}` },
      });
      if (res.ok) {
        showToast('Meeting deleted successfully', 'success');
        fetchHistory();
      } else {
        showToast('Failed to delete meeting', 'error');
      }
    } catch {
      showToast('Error connecting to server', 'error');
    }
  };

  /* ===== MEETING LOGIC ===== */
  const clearNotes = () => { setMeetingNotes(''); setData(null); setError(''); showToast('Notes cleared', 'info'); };

  const copyToClipboard = () => {
    if (!meetingNotes) return;
    navigator.clipboard.writeText(meetingNotes);
    showToast('Copied to clipboard!');
  };

  const handleActionItemChange = (id, field, value) => {
    const updated = data.actionItems.map(item => item.id === id ? { ...item, [field]: value } : item);
    setData({ ...data, actionItems: updated });
  };

  const handleGeneralInfoChange = (field, value) => setData({ ...data, [field]: value });

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => { setMeetingNotes(ev.target.result); showToast('File loaded!'); };
      reader.readAsText(file);
    }
  };

  const handleAudioUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setError('Audio file too large (max 25MB)'); return; }
    setTranscribing(true); setError('');
    const formData = new FormData();
    formData.append('audio', file);
    try {
      const res = await fetch(`${API_URL}/api/transcribe`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Transcription failed');
      const result = await res.json();
      
      // Clear previous analysis data
      setData(null);
      // Replace previous notes instead of appending
      setMeetingNotes(result.text);
      
      showToast('Audio transcribed successfully!');
    } catch (err) { setError(`Audio Error: ${err.message}`); }
    finally { setTranscribing(false); }
  };

  const generateMOM = async () => {
    if (!meetingNotes.trim()) { setError('Please enter or upload notes...'); return; }
    setLoading(true); setError(''); setData(null);
    try {
      const res = await fetch(`${API_URL}/api/analyze-meeting-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingNotes, templateType: template }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.statusText}`);
      const result = await res.json();
      setData(result);
      setActiveTab('preview');
      showToast('Analysis complete! ✨');
    } catch (err) { setError(`Error: ${err.message}`); }
    finally { setLoading(false); }
  };

  const downloadDOC = async () => {
    if (!meetingNotes.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/analyze-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingNotes, includeFormat: 'docx', editedData: data }),
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Minutes_of_Meeting.docx'; a.click();
      window.URL.revokeObjectURL(url);
      showToast('DOCX downloaded!');
    } catch (err) { setError(`Download error: ${err.message}`); }
    finally { setLoading(false); }
  };

  const downloadPDF = async () => {
    if (!meetingNotes.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/analyze-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingNotes, includeFormat: 'pdf', editedData: data }),
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Minutes_of_Meeting.pdf'; a.click();
      window.URL.revokeObjectURL(url);
      showToast('PDF downloaded!');
    } catch (err) { setError(`Download error: ${err.message}`); }
    finally { setLoading(false); }
  };

  const sendEmail = async (e) => {
    e.preventDefault();
    if (!emailAddress || !data || !user) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/email-mom`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({ email: emailAddress, momData: data })
      });
      const result = await res.json();
      if (res.ok) {
        showToast('Email sent successfully!');
        setEmailModalOpen(false);
        setEmailAddress('');
        if (result.previewUrl) {
          console.log("Ethereal Preview URL: ", result.previewUrl);
          showToast('Check console for test email link!', 'info');
        }
      } else {
        throw new Error(result.error || 'Failed to send');
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const calculateAnalytics = () => {
    if (!history.length) return [];
    const templateCounts = history.reduce((acc, curr) => {
      acc[curr.templateType] = (acc[curr.templateType] || 0) + 1;
      return acc;
    }, {});
    return Object.keys(templateCounts).map(key => ({ name: key, meetings: templateCounts[key] }));
  };

  const wordCount = meetingNotes.trim() ? meetingNotes.trim().split(/\s+/).length : 0;

  /* ===== RENDER ===== */
  return (
    <div className="app" data-theme={theme}>
      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
            {t.message}
            <button className="toast-close" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>

      {/* AUTH SCREEN */}
      {!user ? (
        <div className="auth-screen">
          <div className="auth-card">
            <div className="auth-brand">
              <h1>Notula</h1>
              <p>Transform meetings into action</p>
            </div>
            {authError && <div className="auth-error">{authError}</div>}
            <form className="auth-form" onSubmit={handleAuth}>
              <div className="auth-input-group">
                <input type="email" placeholder="Email address" value={authForm.email}
                  onChange={e => setAuthForm({ ...authForm, email: e.target.value })} required />
                <span className="input-icon">{Icons.mail(16)}</span>
              </div>
              <div className="auth-input-group">
                <input type="password" placeholder="Password" value={authForm.password}
                  onChange={e => setAuthForm({ ...authForm, password: e.target.value })} required />
                <span className="input-icon">{Icons.lock(16)}</span>
              </div>
              <button type="submit" className="auth-submit">
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
            <p className="auth-toggle">
              {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <span onClick={() => { setAuthMode(m => m === 'login' ? 'register' : 'login'); setAuthError(''); }}>
                {authMode === 'login' ? 'Sign up' : 'Sign in'}
              </span>
            </p>
          </div>
        </div>
      ) : (
        /* ===== MAIN APP ===== */
        <div className="app-shell">
          {/* SIDEBAR */}
          <aside className="sidebar">
            <div className="sidebar-brand">
              <h2>Notula</h2>
              <span>AI Meeting Minutes</span>
            </div>
            <nav className="sidebar-nav">
              <button className={`nav-item ${activeTab === 'input' ? 'active' : ''}`} onClick={() => setActiveTab('input')}>
                {Icons.plus(18)} <span>New Meeting</span>
              </button>
              <button className={`nav-item ${activeTab === 'preview' ? 'active' : ''}`}
                onClick={() => setActiveTab('preview')} disabled={!data}>
                {Icons.eye(18)} <span>Preview & Edit</span>
              </button>
              <button className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
                onClick={() => { setActiveTab('history'); fetchHistory(); }}>
                {Icons.clock(18)} <span>History</span>
              </button>
              <button className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
                onClick={() => { setActiveTab('analytics'); fetchHistory(); }}>
                {Icons.barChart(18)} <span>Analytics</span>
              </button>
            </nav>
            <div className="sidebar-footer">
              <button className="theme-toggle" onClick={toggleTheme}>
                {theme === 'dark' ? Icons.sun(16) : Icons.moon(16)}
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
              <div className="user-section">
                <div className="user-avatar">{user.email?.[0]?.toUpperCase()}</div>
                <div className="user-info">
                  <p>{user.email}</p>
                </div>
                <button className="logout-btn" onClick={logout}>{Icons.logout(14)}</button>
              </div>
            </div>
          </aside>

          {/* CONTENT */}
          <main className="content-area">
            <div className="content-animated" key={activeTab}>

              {/* === INPUT TAB === */}
              {activeTab === 'input' && (
                <>
                  <div className="page-header">
                    <h1>New Meeting</h1>
                    <p>Paste notes, upload a file, or transcribe audio</p>
                  </div>

                  {/* Template Pills */}
                  <div className="template-pills">
                    {TEMPLATES.map(t => (
                      <button key={t.key} className={`template-pill ${template === t.key ? 'active' : ''}`}
                        onClick={() => setTemplate(t.key)}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Toolbar */}
                  <div className="toolbar">
                    <button className="btn-sm" onClick={copyToClipboard} disabled={!meetingNotes}>
                      {Icons.copy(14)} Copy
                    </button>
                    <button className="btn-sm btn-danger" onClick={clearNotes} disabled={!meetingNotes}>
                      {Icons.trash(14)} Clear
                    </button>
                  </div>

                  {/* Input Layout */}
                  <div className="input-layout">
                    <div>
                      <textarea className="notes-textarea" value={meetingNotes}
                        onChange={e => setMeetingNotes(e.target.value)}
                        placeholder="Paste your meeting notes here, or use the upload options →" rows={14} />
                      <div className="word-count">{wordCount} words</div>
                    </div>
                    <div className="upload-stack">
                      <div className="upload-card">
                        <h3>{Icons.mic(22)} Audio Upload</h3>
                        <p>MP3, WAV, M4A — up to 25MB</p>
                        <input type="file" accept="audio/*" onChange={handleAudioUpload} id="audio-input" hidden />
                        <label htmlFor="audio-input" className={`upload-label ${transcribing ? 'loading' : ''}`}>
                          {transcribing ? '⏳ Transcribing...' : 'Choose Audio File'}
                        </label>
                      </div>
                      <div className="upload-card">
                        <h3>{Icons.fileText(22)} Text File</h3>
                        <p>.txt or .md files</p>
                        <input type="file" accept=".txt,.md" onChange={handleFileUpload} id="file-input" hidden />
                        <label htmlFor="file-input" className="upload-label">Choose File</label>
                      </div>
                    </div>
                  </div>

                  {error && <div className="error-banner">{error}</div>}

                  <div className="btn-group">
                    <button className="btn btn-primary" onClick={generateMOM}
                      disabled={loading || transcribing || !meetingNotes.trim()}>
                      {loading ? <><span className="spinner" style={{width:18,height:18,borderWidth:2}}/> Analyzing...</>
                        : <>{Icons.zap(18)} Analyze Meeting</>}
                    </button>
                  </div>
                </>
              )}

              {/* === PREVIEW TAB === */}
              {activeTab === 'preview' && data && (
                <>
                  <div className="page-header">
                    <h1>Preview & Edit</h1>
                    <p>Review and correct the AI-generated analysis before exporting</p>
                  </div>

                  <div id="preview-content-for-pdf" style={{ padding: '20px 0' }}>
                  {/* Meeting Info */}
                  <div className="preview-header-card">
                    <input type="text" className="edit-title" value={data.meetingTitle}
                      onChange={e => handleGeneralInfoChange('meetingTitle', e.target.value)} />
                    <input type="text" className="edit-date" value={data.date}
                      onChange={e => handleGeneralInfoChange('date', e.target.value)} />
                    {data.participants?.length > 0 && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>
                        👥 {data.participants.join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Action Items */}
                  {data.actionItems?.length > 0 && (
                    <div className="glass-card" style={{ marginBottom: 20 }}>
                      <div className="section-title">{Icons.check(20)} Action Items</div>
                      <p className="hint-text">Click any cell to edit before downloading.</p>
                      <div className="table-wrapper">
                        <table>
                          <thead>
                            <tr><th>Task</th><th>Owner</th><th>Priority</th><th>Due Date</th><th>Effort</th></tr>
                          </thead>
                          <tbody>
                            {data.actionItems.map(item => (
                              <tr key={item.id}>
                                <td><input value={item.title} onChange={e => handleActionItemChange(item.id, 'title', e.target.value)} /></td>
                                <td><input value={item.assignedTo} onChange={e => handleActionItemChange(item.id, 'assignedTo', e.target.value)} /></td>
                                <td>
                                  <select value={item.priority} onChange={e => handleActionItemChange(item.id, 'priority', e.target.value)}>
                                    <option value="HIGH">HIGH</option><option value="MEDIUM">MEDIUM</option><option value="LOW">LOW</option>
                                  </select>
                                </td>
                                <td><input value={item.dueDate} onChange={e => handleActionItemChange(item.id, 'dueDate', e.target.value)} /></td>
                                <td><input value={item.estimatedEffort} onChange={e => handleActionItemChange(item.id, 'estimatedEffort', e.target.value)} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Decisions */}
                  {data.decisions?.length > 0 && (
                    <div className="glass-card" style={{ marginBottom: 20 }}>
                      <div className="section-title">{Icons.zap(20)} Key Decisions</div>
                      <div className="decisions-grid">
                        {data.decisions.map(d => (
                          <div key={d.id} className="decision-card">
                            <h4>{d.id} — {d.title}</h4>
                            <p>{d.description}</p>
                            <div className="decision-meta">
                              <span className={`badge badge-${d.impact?.toLowerCase()}`}>{d.impact}</span>
                              {d.owner && <span className="badge badge-template">{d.owner}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Challenges */}
                  {data.potentialChallenges?.length > 0 && (
                    <div className="glass-card" style={{ marginBottom: 20 }}>
                      <div className="section-title">{Icons.warning(20)} Potential Challenges</div>
                      {data.potentialChallenges.map(c => (
                        <div key={c.id} className="challenge-card">
                          <h4>{c.id} — {c.challenge}</h4>
                          <p><strong>Impact:</strong> {c.impact}</p>
                          {c.team_affected && <p><strong>Team:</strong> {c.team_affected}</p>}
                          <p><strong>Mitigation:</strong> {c.mitigation}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Follow-ups */}
                  {data.followup_items?.length > 0 && (
                    <div className="glass-card" style={{ marginBottom: 20 }}>
                      <div className="section-title">{Icons.clock(20)} Follow-up Items</div>
                      <ul className="followup-list">
                        {data.followup_items.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  )}

                  {data.next_meeting && (
                    <div className="glass-card" style={{ marginBottom: 20 }}>
                      <div className="section-title">📅 Next Meeting</div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{data.next_meeting}</p>
                    </div>
                  )}
                  </div>

                  {/* Action Buttons */}
                  <div className="btn-group">
                    <button className="btn btn-primary" onClick={downloadDOC} disabled={loading}>
                      {loading ? <><span className="spinner" style={{width:18,height:18,borderWidth:2}}/> Generating...</>
                        : <>{Icons.download(18)} DOCX</>}
                    </button>
                    <button className="btn btn-primary" onClick={downloadPDF} style={{background: 'var(--primary-dark)'}}>
                      {Icons.download(18)} PDF
                    </button>
                    <button className="btn btn-primary" onClick={() => setEmailModalOpen(true)} style={{background: 'var(--accent)'}}>
                      {Icons.mail(18)} Email
                    </button>
                    <button className="btn btn-secondary" onClick={saveMeetingToDB}>
                      {Icons.save(18)} Save
                    </button>
                    <button className="btn btn-secondary" onClick={() => setActiveTab('input')}>
                      {Icons.back(18)} Back
                    </button>
                  </div>
                </>
              )}

              {/* === PREVIEW LOADING === */}
              {activeTab === 'preview' && !data && (
                <div className="empty-state">
                  <div className="empty-icon">👁️</div>
                  <p>No analysis yet. Go to <strong>New Meeting</strong> and analyze your notes first.</p>
                </div>
              )}

              {/* === HISTORY TAB === */}
              {activeTab === 'history' && (
                <>
                  <div className="page-header">
                    <h1>Meeting History</h1>
                    <p>Your previously saved meeting analyses</p>
                  </div>
                  {history.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">📂</div>
                      <p>No meetings saved yet. Analyze a meeting and save it to see it here.</p>
                    </div>
                  ) : (
                    <div className="history-grid">
                      {history.map(m => (
                        <div key={m._id} className="history-card" onClick={() => {
                          setData(m.analysis); setMeetingNotes(m.rawNotes);
                          setTemplate(m.templateType); setActiveTab('preview');
                        }}>
                          <div>
                            <h4>{m.title}</h4>
                            <span className="date">📅 {m.date || new Date(m.createdAt).toLocaleDateString()}</span>
                            <span className="badge badge-template" style={{ marginLeft: 8 }}>{m.templateType}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <span style={{ color: 'var(--accent)' }}>{Icons.folder(18)}</span>
                            <button 
                              onClick={(e) => deleteMeeting(m._id, e)} 
                              style={{ background: 'transparent', border: 'none', color: '#ff4d4f', cursor: 'pointer', padding: '4px' }}
                              title="Delete Meeting"
                            >
                              {Icons.trash(16)}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* === ANALYTICS TAB === */}
              {activeTab === 'analytics' && (
                <>
                  <div className="page-header">
                    <h1>Analytics Dashboard</h1>
                    <p>Insights across all your saved meetings</p>
                  </div>
                  {history.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">📊</div>
                      <p>No meetings saved yet. Build up your history to see analytics.</p>
                    </div>
                  ) : (
                    <div className="glass-card" style={{ height: 400, padding: '2rem' }}>
                      <div className="section-title">Meetings by Template Type</div>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={calculateAnalytics()}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="name" stroke="var(--text-secondary)" />
                          <YAxis stroke="var(--text-secondary)" allowDecimals={false} />
                          <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', borderRadius: '8px'}} />
                          <Bar dataKey="meetings" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}

            </div>

            {/* === EMAIL MODAL === */}
            {emailModalOpen && (
              <div className="modal-overlay">
                <div className="modal-content glass-card">
                  <h2>Email Meeting Minutes</h2>
                  <p>Send this summary directly to a participant.</p>
                  <form onSubmit={sendEmail}>
                    <input 
                      type="email" 
                      placeholder="participant@company.com" 
                      value={emailAddress} 
                      onChange={e => setEmailAddress(e.target.value)} 
                      required 
                      className="edit-title" 
                      style={{width: '100%', padding: '12px', marginTop: '16px', fontSize: '1rem'}}
                    />
                    <div className="btn-group" style={{marginTop: '24px', justifyContent: 'flex-end'}}>
                      <button type="button" className="btn btn-secondary" onClick={() => setEmailModalOpen(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? 'Sending...' : 'Send Email'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

export default App;
