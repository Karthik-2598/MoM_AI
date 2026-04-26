/**
 * Quick test script for the transcription endpoint.
 * 
 * Usage:
 *   node test/test-transcribe.js <path-to-audio-file>
 * 
 * Example:
 *   node test/test-transcribe.js test/sample.mp3
 * 
 * If no file is provided, it tests with a sample meeting text via the analyze-meeting-json endpoint instead.
 */

const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:5000';
const audioPath = process.argv[2];

async function testTranscription(filePath) {
  console.log(`\n🎤 Testing transcription with: ${filePath}`);
  console.log(`   File size: ${(fs.statSync(filePath).size / 1024).toFixed(1)} KB\n`);

  const FormData = require('form-data');
  const form = new FormData();
  form.append('audio', fs.createReadStream(filePath));

  const start = Date.now();

  const res = await fetch(`${API_URL}/api/transcribe`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!res.ok) {
    const err = await res.json();
    console.error(`❌ Transcription FAILED (${elapsed}s):`, err);
    return null;
  }

  const data = await res.json();
  console.log(`✅ Transcription SUCCESS (${elapsed}s)`);
  console.log(`📝 Transcribed text (${data.text.length} chars):\n`);
  console.log(`   "${data.text.substring(0, 500)}${data.text.length > 500 ? '...' : ''}"\n`);
  return data.text;
}

async function testAnalysis(meetingText) {
  console.log(`\n🧠 Testing AI analysis...`);
  const start = Date.now();

  const res = await fetch(`${API_URL}/api/analyze-meeting-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meetingNotes: meetingText, templateType: 'General' }),
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!res.ok) {
    const err = await res.json();
    console.error(`❌ Analysis FAILED (${elapsed}s):`, err);
    return;
  }

  const data = await res.json();
  console.log(`✅ Analysis SUCCESS (${elapsed}s)`);
  console.log(`   Title: ${data.meetingTitle}`);
  console.log(`   Decisions: ${data.decisions?.length || 0}`);
  console.log(`   Action Items: ${data.actionItems?.length || 0}`);
  console.log(`   Challenges: ${data.potentialChallenges?.length || 0}`);
  console.log(`   Follow-ups: ${data.followup_items?.length || 0}\n`);
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Notula AI — Transcription Test Suite');
  console.log('═══════════════════════════════════════');

  if (audioPath) {
    if (!fs.existsSync(audioPath)) {
      console.error(`❌ File not found: ${audioPath}`);
      process.exit(1);
    }
    const text = await testTranscription(audioPath);
    if (text) {
      await testAnalysis(text);
    }
  } else {
    console.log('\n⚠️  No audio file provided. Testing analysis with sample text.\n');
    const sampleText = `
      Meeting: Sprint Planning - April 25, 2026
      Attendees: John, Sarah, Mike, Priya
      
      John: We need to finalize the API integration by next Friday.
      Sarah: I'll handle the frontend components. The dashboard needs a complete redesign.
      Mike: There's a blocker with the database migration. We need DBA approval.
      Priya: I can help Mike with the migration scripts. Let's pair on it tomorrow.
      John: Good. Sarah, can you also update the documentation?
      Sarah: Sure, I'll do it after the dashboard is done.
      Mike: One concern — the staging server is running out of disk space.
      John: I'll raise a ticket with DevOps. Let's meet again on Wednesday to check progress.
    `;
    await testAnalysis(sampleText);
  }
}

main().catch(err => {
  console.error('💥 Test failed:', err.message);
  process.exit(1);
});
