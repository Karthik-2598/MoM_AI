import React, {useState} from 'react';
import './App.css';

function App() {
  const [meetingNotes, setMeetingNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('input');

  const API_URL = 'http://localhost:5000';

  const handleFileUpload = (e) =>{
    const file = e.target.files[0];
    if(file){
      const reader = new FileReader();
      reader.onload = (event)=> {
        setMeetingNotes(event.target.result);
      };
      reader.readAsText(file);
    }
  };

  //handle text change
  const handleTextChange = (e) =>{
    setMeetingNotes(e.target.value);
  };

  //generate minutes of meeting
  const generateMOM = async()=>{
    if(!meetingNotes.trim()){
      setError('Please enter or upload notes...');
      return;
    }
    setLoading(true);
    setError('');
    setData(null);

    try{
      //get the JSON analysis
      const response = await fetch(`${API_URL}/api/analyze-meeting-json`,{
        method:'POST',
        headers:{
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({meetingNotes})
      });

      if(!response.ok){
        throw new Error(`Server error: ${response.statusText}`);
      }
      const data = await response.json();
      setData(data);
      setActiveTab('preview');
    }catch(err){
      setError(`Error: ${err.message}`);
      console.error(err);
    }finally{
      setLoading(false);
    }
  };



  //Download as DOCX
  const downloadDOC = async()=>{
    if(!meetingNotes.trim()) return;
    setLoading(true);
    try{
      const response = await fetch(`${API_URL}/api/analyze-meeting`, {
        method: 'POST',
        headers:{
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({meetingNotes, includeFormat:'docx'})
      });
      if(!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Minutes_of_meeting.docx';
      a.click();
      window.URL.revokeObjectURL(url);
    }catch(err){
      setError(`Download error: ${err.message}`);
    }finally{
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="container">
         <h1>📋 Minutes of Meeting Generator</h1>
          <p>Transform meeting notes into organized action plans</p>       
          </div>
      </header>

      <main className="main">
        <div className="container">
          <div className="tabs">
            <button
            className={`tab ${activeTab === 'input' ? 'active' : ''}`}
              onClick={() => setActiveTab('input')}>
                Input

            </button>
            <button
            className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
              disabled={!data}
            >
              Preview
            </button>
          </div>
          {/* INPUT TAB */}
          {activeTab === 'input' && (
            <div className="tab-content">
              <div className="input-section">
                 <h2>Step 1: Enter Your Meeting Notes</h2>
                <p>Paste raw bullet points, transcripts, or notes from your meeting</p>

                <div className="input-methods">
                  <div className="input-area">
                    <label htmlFor="notes"> Meeting Notes</label>
                    <textarea
                      id="notes"
                      value={meetingNotes}
                      onChange={handleTextChange}
                      placeholder={`Paste your meeting notes here. Example:
- Project X timeline moved to Q3
- Need to hire 2 more engineers
- Budget approved: $50K
- Team to submit design mockups by Friday
- Risk: API changes from vendor could delay integration`}
                      rows={12}
                    />
                  </div>

                  <div className="upload-area">
                    <h3>Or Upload a File</h3>
                    <input
                      type="file"
                      accept=".txt,.md,.pdf"
                      onChange={handleFileUpload}
                      id="file-input"
                    />
                    <label htmlFor="file-input" className="file-label">
                      📁 Click to upload or drag file
                    </label>
                    <p>Supported: .txt, .md</p>
                  </div>
                </div>
                 {error && <div className="error-message">{error}</div>}
                 <div
                 className="button-group">
                  <button
                  className="btn btn-primary"
                  onClick={generateMOM}
                  disabled={loading || !meetingNotes.trim()}>
                    {loading ? '⏳ Analyzing...' : '✨ Analyze Meeting'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={downloadDOC}
                    disabled={loading || !meetingNotes.trim()}
                  >
                    {loading ? '⏳ Generating...' : '📥 Download DOCX'}
                  </button>
                 </div>
              </div>
              <div className="features">
                <h3>What this tool does:</h3>
                <ul>
                  <li>✅ Extracts action items and assigns them to teams</li>
                  <li>✅ Identifies decisions made and their reasoning</li>
                  <li>✅ Predicts potential challenges and risks</li>
                  <li>✅ Estimates effort and suggests deadlines</li>
                  <li>✅ Creates professional, organized documents</li>
                  <li>✅ Maps task dependencies and blockers</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'preview' && data && (
            <div className="tab-content">
              <div className="preview-section">
                <div className="preview-header">
                  <h2>{data.meetingTitle || 'Meeting Record'}</h2>
                  {data.date && <p>📅 {data.date}</p>}
                </div>
 
                {data.participants && (
                  <div className="preview-card">
                    <h3>👥 Participants</h3>
                    <p>{data.participants.join(', ')}</p>
                  </div>
                )}
                {data.decisions && data.decisions.length> 0 &&(
                  <div className="preview-card">
                    <h3>🎯 Decisions Made</h3>
                    {data.decisions.map((decision)=> (
                      <div key={decision.id} className="item">
                        <div className="item-header">
                          <strong>{decision.id} - {decision.title}</strong>
                          <span className={`badge impact-${decision.impact.toLowerCase()}`}>
                            {decision.impact}
                          </span>
                        </div>
                         <p>{decision.description}</p>
                        <p className="owner">👤 Owner: {decision.owner}</p>
                        </div>
                    ))}
                    </div>
                )}


                {data.actionItems && data.actionItems.length > 0 && (
                  <div className="preview-card">
                     <h3>✓ Action Items ({data.actionItems.length})</h3>
                     <div className="actions-table">
                      <table>
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Task</th>
                            <th>Owner</th>
                            <th>Priority</th>
                            <th>Due Date</th>
                            <th>Effort</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.actionItems.map((item)=>(
                            <tr key={item.id}>
                              <td className="id">{item.id}</td>
                              <td className="task">{item.title}</td>
                              <td>{item.assignedTo}</td>
                               <td>
                                <span className={`badge priority-${item.priority.toLowerCase()}`}>
                                  {item.priority}
                                </span>
                              </td>
                              <td>{item.dueDate}</td>
                              <td>{item.estimatedEffort}</td>
                            </tr>
                          ))}
                        </tbody>
                        </table>
                     </div>

                     <div className="team-breakdown">
                      {Object.entries(
                        data.actionItems.reduce((acc,item)=>{
                          const team = item.assignedTo || 'Unassigned';
                          if(!acc[team]) acc[team] = [];
                          acc[team].push(item);
                          return acc;
                        }, {})
                      ).map(([team,items])=>(
                        <div key={team} className="team-selection">
                            <h4>👥 Team: {team}</h4>
                          {items.map((item) => (
                            <div key={item.id} className="item">
                              <div className="item-header">
                                <strong>{item.id} - {item.title}</strong>
                              </div>
                              <p>{item.description}</p>
                              <div className="item-meta">
                                <span>⏱️ {item.estimatedEffort}</span>
                                <span>📅 {item.dueDate}</span>
                                {item.dependencies && item.dependencies.length > 0 && (
                                  <span>🔗 Depends on: {item.dependencies.join(', ')}</span>
                                )}
                                </div>
                                {item.acceptance_criteria && item.acceptance_criteria.length > 0 && (
                                  <div className="acceptance">
                                    <strong> Acceptance Criteria :</strong>
                                    <ul>
                                      {item.acceptance_criteria.map((criteria, index)=> (
                                        <li key={index}>{criteria}</li>
                                      ))}
                                    </ul>
                                    </div>
                                )}
                                </div>
                      ))}
                     </div>
                ))}
        </div>
        </div>
      )}

      {data.potentialChallenges && data.potentialChallenges.length > 0 && (
        <div className="preview-card">
          <h3>⚠️ Potential Challenges & Risks</h3>
          {data.potentialChallenges.map((challenge)=>(
            <div key={challenge.id} className="item warning">
                        <div className="item-header">
                          <strong>{challenge.id} - {challenge.challenge}</strong>
                        </div>
                        <p><strong>Impact:</strong> {challenge.impact}</p>
                        <p><strong>Affected Team:</strong> {challenge.team_affected}</p>
                        <p><strong>Mitigation:</strong> {challenge.mitigation}</p>
                      </div>
          ))}
        </div>
      )}

      {data.followup_items && data.followup_items.length > 0 && (
                  <div className="preview-card">
                    <h3>📌 Follow-up Items</h3>
                    <ul>
                      {data.followup_items.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.next_meeting && (
                  <div className="preview-card highlight">
                    <h3>📅 Next Meeting</h3>
                    <p>{data.next_meeting}</p>
                  </div>
                )}
                <div className="button-group">
                  <button className="btn btn-primary" onClick={downloadDOC}>
                    📥 Download as DOCX
                  </button>
                  <button className="btn btn-secondary" onClick={() => setActiveTab('input')}>
                    ← Back to Input
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
       <footer className="footer">
        <p>Built by KSK | Transform meetings into action 🚀</p>
      </footer>
      
    </div>
  )
}

export default App;
