require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow,VerticalAlign, HeadingLevel, AlignmentType } = require('docx');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const FormData = require('form-data');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const bcrypt = require('bcrypt');
const Meeting = require('./models/Meeting');
const Groq = require('groq-sdk');
const nodemailer = require('nodemailer');

//Ksk@#2504

mongoose.connect(process.env.MONGO_URI);
const app = express();
app.use(cors());
app.use(express.json({limit: '10mb'}));
const KEY = process.env.API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

const groq = new Groq({ apiKey: GROQ_KEY });


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + Date.now() + ext);
  }
});
const upload = multer({ storage: storage });

if(!KEY){
    console.error('ERROR: API_KEY is not set');
}

const authenticateToken = (req,res,next)=>{
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if(!token) return res.status(401).json({error: "Access denied. Please login"});
  jwt.verify(token, JWT_SECRET, (err,user)=>{
    if(err) return res.status(403).json({error: "session expired. Pleaser login again"});
    req.user = user;
    next();
  });
};


//Register
app.post('/api/auth/register', async(req,res)=> {
  try{
    const {email, password} = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({email, password: hashedPassword});
    await user.save();
    res.json({success: true, message: "user created!!!"});
  }catch(error){
    res.status(400).json({error:"Email already exists"});
  }
});

//Login
app.post('/api/auth/login', async(req,res)=>{
  const {email, password} = req.body;
  const user = await User.findOne({email});
  if(!user || !(await bcrypt.compare(password, user.password))){
    return res.status(401).json({error: "Invalid credentials"});
  }
  const token = jwt.sign({userId: user._id, email: user.email}, JWT_SECRET, {expiresIn:'1d'});
  res.json({token, email: user.email});
});


//prompt for meeting

const TEMPLATE_PERSONAS = {
    General: "a professional business analyst. Focus on general project progress and clear administrative action items.",
    Technical: "a Senior Software Architect. Focus heavily on technical blockers, architectural decisions, API dependencies, and engineering tasks.",
    Board: "a formal Corporate Secretary. Use high-level executive language. Focus on strategic milestones, governance, and voting results.",
    Sales: "a Sales Director. Focus on client pain points, budget mentions, follow-up touchpoints, and conversion blockers."
};

const getTemplatePrompt = (notes, templateType='General')=>{
  const persona = TEMPLATE_PERSONAS[templateType] || TEMPLATE_PERSONAS.General;
   return `You are ${persona} Analyze the provided meeting notes and extract structured information.
 
MEETING NOTES:
${notes}
 
Please extract and structure the following information as JSON:
{
  "meetingTitle": "string",
  "date": "string",
  "participants": ["string"],
  "decisions": [{"id": "D1", "title": "string", "description": "string", "impact": "HIGH/MEDIUM/LOW", "owner": "string"}],
  "actionItems": [{"id": "A1", "title": "string", "description": "string", "assignedTo": "string", "priority": "HIGH/MEDIUM/LOW", "estimatedEffort": "string", "dueDate": "string"}],
  "potentialChallenges": [{"id": "C1", "challenge": "string", "impact": "string", "team_affected": "string", "mitigation": "string"}],
  "decisions_log": [{"decision": "string", "reasoning": "string", "alternatives_considered": "string"}],
  "followup_items": ["string"],
  "next_meeting": "string"
}
 
IMPORTANT: Return ONLY valid JSON. Suggetions for deadlines and effort should reflect a ${templateType} context.`;
  
};



//call the API

async function callAPI(userMessage){
try{
console.log('Calling Groq API MODEL (llama-3.3-70b-versatile)....');

if (userMessage.length > 30000) {
  console.warn(`Meeting notes too long (${userMessage.length} chars). Truncating to 30000 characters to fit Groq free tier TPM limits.`);
  userMessage = userMessage.substring(0, 30000) + "\n\n...[Content truncated due to AI token limits]";
}

const response = await groq.chat.completions.create({
  model: "llama-3.3-70b-versatile",
  messages: [
    {
      role: "user",
      content: userMessage
    }
  ],
  temperature: 0.60,
  max_tokens: 3000,
  top_p: 0.95,
  response_format: { type: "json_object" }
});

console.log('API response received');

const responseText = response.choices[0].message.content;
return responseText;

}catch(error){
console.error('API ERROR:', error.message);
if(error.response){
console.error('Status:', error.response.status);
console.error('Data:', error.response.data);
}
// Throw a more readable error if it's a size/rate limit issue
if (error.message && (error.message.includes('413') || error.message.includes('rate_limit_exceeded'))) {
  throw new Error("Meeting audio is too long for the current AI plan's token limit. Please use a shorter meeting or upgrade the AI tier.");
}
throw error;
}
}


app.post('/api/transcribe', upload.single('audio'), async(req,res)=>{
  try{
    if(!req.file){
      return res.status(400).json({error:'Audio file not provided'});
    }
    console.log('Transcribing audio with Groq SDK...');

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: "whisper-large-v3",
      temperature: 0,
      response_format: "json",
      language: "en"
    });

    fs.unlinkSync(req.file.path);
    console.log('Transcription successful');
    res.json({text: transcription.text});
}catch(error){
  if (req.file) fs.unlinkSync(req.file.path);
        console.error('Transcription Error:', error.response?.data || error.message);
        if (error.message && error.message.includes('429')) {
            return res.status(429).json({ error: "Audio rate limit reached (max 2 hours of audio per hour on free tier). Please wait a few minutes and try again." });
        }
        res.status(500).json({ error: 'Failed to transcribe audio' });
}
});
//API-END POINTS
app.post('/api/analyze-meeting', async(req, res)=>{
    try{
        const {meetingNotes, includeFormat = 'docx', editedData, templateType} = req.body;
        let data;

        //if user sent editedData from frontend, use it. Otherwise call AI to generate it.
        if(editedData){
          console.log('Using edited data for DOCX generation');
          data = editedData;
        }else{
        if(!meetingNotes || meetingNotes.trim().length === 0){
            return res.status(400).json({error: 'Meeting notes are required'});
        }

            const prompt = getTemplatePrompt(meetingNotes, templateType);
            const responseText = await callAPI(prompt);
            data = JSON.parse(responseText);
        }

        //docx generated
        if(includeFormat === 'docx' || includeFormat === 'both'){
            const docBuffer = await generateMOMDocument(data);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', 'attachment; filename="Minutes_of_Meeting.docx"');
            return res.send(docBuffer);
        } else if(includeFormat === 'pdf'){
            const pdfBuffer = await generateMOMPdf(data);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename="Minutes_of_Meeting.pdf"');
            return res.send(pdfBuffer);
        }
        res.json(data);
    }catch(error){
        console.error('Error in analyzing:', error);
        res.status(500).json({
            error:'Failed to anlalyze meeting',
            details: error.message
        });
    }
});

//return json for further process

app.post('/api/analyze-meeting-json', async(req,res)=>{
    try{
        const {meetingNotes, templateType} = req.body;
        if(!meetingNotes || meetingNotes.trim().length === 0){
            return res.status(400).json({error: 'Meeting notes required'});
        }
        console.log('Meeting notes(JSON response)...');

        const prompt = getTemplatePrompt(meetingNotes, templateType);
         const responseText = await callAPI(prompt);
         const analysisData = JSON.parse(responseText);
    res.json(analysisData);
    }catch(error){
        console.error('Error: ', error);
        res.status(500).json({error: error.message});
    }
});

app.post('/api/save-meeting', authenticateToken, async(req,res)=>{
  try{
    const {title,date,rawNotes,analysis,templateType} = req.body;
    const newMeeting = new Meeting({
      title, date, rawNotes, analysis, templateType,userId: req.user.userId
    });
    await newMeeting.save();
    res.json({success: true, id: newMeeting._id});
  }catch(error){
    res.status(500).json({error: error.message});
  }
});

app.get('/api/history', authenticateToken, async(req,res)=>{
  try{
    const meeting = await Meeting.find({userId:req.user.userId}).sort({createdAt: -1});
    res.json(meeting);
  }catch(error){
    res.status(500).json({error: error.message});
  }
});

app.delete('/api/history/:id', authenticateToken, async(req,res)=>{
  try{
    const deletedMeeting = await Meeting.findOneAndDelete({_id: req.params.id, userId: req.user.userId});
    if(!deletedMeeting) return res.status(404).json({error: "Meeting not found"});
    res.json({success: true, message: "Meeting deleted successfully"});
  }catch(error){
    res.status(500).json({error: error.message});
  }
});

app.post('/api/email-mom', authenticateToken, async (req, res) => {
    try {
        const { email, momData } = req.body;
        if (!email || !momData) return res.status(400).json({error: 'Email and MoM data required'});

        // Format the email nicely
        const htmlContent = `
            <h2>${momData.meetingTitle || 'Minutes of Meeting'}</h2>
            <p><strong>Date:</strong> ${momData.date || 'N/A'}</p>
            <h3>Decisions</h3>
            <ul>${(momData.decisions || []).map(d => `<li>${typeof d === 'string' ? d : `<strong>${d.title || 'Decision'}</strong>: ${d.description || ''}`}</li>`).join('')}</ul>
            <h3>Action Items</h3>
            <ul>${(momData.actionItems || []).map(a => `<li><strong>${a.assignedTo || 'Unassigned'}:</strong> ${a.title || ''} (Due: ${a.dueDate || 'N/A'})</li>`).join('')}</ul>
            <p><i>Sent from Notula AI</i></p>
        `;

        // Create test account if env vars are missing
        let transporter;
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            transporter = nodemailer.createTransport({
                service: 'gmail', 
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            });
        } else {
            console.log('No SMTP credentials found. Creating Ethereal test account...');
            const testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false, 
                auth: { user: testAccount.user, pass: testAccount.pass }
            });
        }

        const info = await transporter.sendMail({
            from: '"Notula AI" <noreply@notula.ai>',
            to: email,
            subject: `Minutes of Meeting: ${momData.meetingTitle || 'Summary'}`,
            html: htmlContent,
        });

        // If using Ethereal, log the preview URL
        let previewUrl = null;
        if (!process.env.SMTP_USER) {
            previewUrl = nodemailer.getTestMessageUrl(info);
            console.log("Email sent via Ethereal! Preview URL: %s", previewUrl);
        } else {
            console.log("Email sent successfully to", email);
        }
        
        res.json({ success: true, message: 'Email sent successfully', previewUrl });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

//generate professional DOCX document from analyzed data.

async function generateMOMDocument(data){
    const sections = [];

    //header
    sections.push(
        new Paragraph({
      text: 'MINUTES OF MEETING',
      heading: HeadingLevel.HEADING_1,
      bold: true,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }),
     new Paragraph({
      text: data.meetingTitle || 'Meeting Record',
      heading: HeadingLevel.HEADING_2,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    })
    );


    //meeting info
    if (data.date) {
    sections.push(
      new Paragraph({
        text: `Date: ${data.date}`,
        spacing: { after: 100 }
      })
    );
  }
 
  if (data.participants && data.participants.length > 0) {
    sections.push(
      new Paragraph({
        text: `Participants: ${data.participants.join(', ')}`,
        spacing: { after: 300 }
      })
    );
  }

  //decisions section

  if(data.decisions && data.decisions.length > 0){
     sections.push(
        new Paragraph({
            text: '1.DECISIONS MADE',
            heading: HeadingLevel.HEADING_2,
            spacing: {before: 200, after:100}
        })
     );
     data.decisions.forEach(decision => {
      sections.push(
        new Paragraph({
          text: `${decision.id} - ${decision.title}`,
          bold: true,
          spacing: { before: 100}
        }),
        new Paragraph({
          text: decision.description,
          indent: { left: 720 }
        }),
        new Paragraph({
          text: `Owner: ${decision.owner} | Impact: ${decision.impact}`,
          italics: true,
          indent: { left: 720 }
        })
      );
    });
  }

  //action items section
  if(data.actionItems && data.actionItems.length> 0){
    sections.push(
        new Paragraph({
            text: '2. ACTION ITEMS',
            heading: HeadingLevel.HEADING_2,
            spacing: {before: 200, after: 100}
        })
    );
  
    //table for action items
    const tableRows = [
        new TableRow({
            children: [
          createTableHeader('Task'),
          createTableHeader('Owner'),
          createTableHeader('Priority'),
          createTableHeader('Due Date'),
          createTableHeader('Effort')
        ],
        })
    ];

    data.actionItems.forEach(item => {
      tableRows.push(
        new TableRow({
          children: [
            createTableCell(item.title),
            createTableCell(item.assignedTo),
            createTableCell(item.priority),
            createTableCell(item.dueDate),
            createTableCell(item.estimatedEffort),
          ]
        })
      );
    });

    sections.push(
        new Table({
            rows: tableRows,
            width: {size: 100, type: 'pct'}
        }),
    );

}

if(data.potentialChallenges && data.potentialChallenges.length > 0){
    sections.push(
        new Paragraph({
        text: '3. POTENTIAL CHALLENGES & RISKS',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );

    data.potentialChallenges.forEach(challenge => {
        sections.push(
            new Paragraph({
          text: `${challenge.id} - ${challenge.challenge}`,
          bold: true,
        }),
        new Paragraph({
          text: `Mitigation: ${challenge.mitigation}`,
          spacing: { after: 100 },
          indent: { left: 720 },
          italics: true
        })
        )
    });
}

if(data.followup_items && data.followup_items.length > 0){
    sections.push(
        new Paragraph({
        text: '4. FOLLOW-UP ITEMS',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );

    data.followup_items.forEach(item => {
        sections.push(
            new Paragraph({
          text: `• ${item}`,
          spacing: { after: 100 },
          indent: { left: 720 }
        })
        )
    });
}

if(data.next_meeting){
    sections.push(
        new Paragraph({
        text: '5. NEXT MEETING',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      }),
      new Paragraph({
          text: data.next_meeting,
          spacing: { after: 100 }
      })
    );
}

  //create and save doc

  const doc = new Document ({
    sections: [
        {
            children: sections
        }
    ]
  });
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

// generate PDF document from analyzed data
async function generateMOMPdf(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('MINUTES OF MEETING', { align: 'center', underline: true });
      doc.moveDown();
      doc.fontSize(16).text(data.meetingTitle || 'Meeting Record', { align: 'center' });
      doc.moveDown();

      // Info
      if (data.date) {
        doc.fontSize(12).text(`Date: ${data.date}`);
      }
      if (data.participants && data.participants.length > 0) {
        doc.text(`Participants: ${data.participants.join(', ')}`);
      }
      doc.moveDown();

      // Decisions
      if (data.decisions && data.decisions.length > 0) {
        doc.fontSize(14).text('1. DECISIONS MADE', { underline: true });
        doc.moveDown(0.5);
        data.decisions.forEach(d => {
          doc.fontSize(12).font('Helvetica-Bold').text(`${d.id} - ${d.title}`);
          doc.font('Helvetica').text(d.description, { indent: 20 });
          doc.font('Helvetica-Oblique').text(`Owner: ${d.owner} | Impact: ${d.impact}`, { indent: 20 });
          doc.moveDown(0.5);
        });
      }

      // Action Items
      if (data.actionItems && data.actionItems.length > 0) {
        doc.fontSize(14).font('Helvetica').text('2. ACTION ITEMS', { underline: true });
        doc.moveDown(0.5);
        data.actionItems.forEach(a => {
          doc.fontSize(12).font('Helvetica-Bold').text(`Task: ${a.title}`);
          doc.font('Helvetica').text(`Owner: ${a.assignedTo} | Priority: ${a.priority} | Due: ${a.dueDate}`, { indent: 20 });
          if (a.estimatedEffort) {
            doc.text(`Effort: ${a.estimatedEffort}`, { indent: 20 });
          }
          doc.moveDown(0.5);
        });
      }

      // Challenges
      if (data.potentialChallenges && data.potentialChallenges.length > 0) {
        doc.fontSize(14).font('Helvetica').text('3. POTENTIAL CHALLENGES & RISKS', { underline: true });
        doc.moveDown(0.5);
        data.potentialChallenges.forEach(c => {
          doc.fontSize(12).font('Helvetica-Bold').text(`${c.id} - ${c.challenge}`);
          doc.font('Helvetica-Oblique').text(`Mitigation: ${c.mitigation}`, { indent: 20 });
          doc.moveDown(0.5);
        });
      }

      // Follow-up Items
      if (data.followup_items && data.followup_items.length > 0) {
        doc.fontSize(14).font('Helvetica').text('4. FOLLOW-UP ITEMS', { underline: true });
        doc.moveDown(0.5);
        data.followup_items.forEach(item => {
          doc.fontSize(12).font('Helvetica').text(`• ${item}`, { indent: 20 });
          doc.moveDown(0.5);
        });
      }

      // Next Meeting
      if (data.next_meeting) {
        doc.fontSize(14).font('Helvetica').text('5. NEXT MEETING', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica').text(data.next_meeting, { indent: 20 });
        doc.moveDown(0.5);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

  function createTableHeader(text){
    return new TableCell({
        children: [
            new Paragraph({
                text: text,
                bold: true,
                color: 'FFFFFF'
            })
        ],
    shading: { type: 'clear', fill: '4472C4' },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 100, bottom: 100, left: 100, right: 100 }   
 });
}

function createTableCell(text) {
  return new TableCell({
    children: [
      new Paragraph({
        text: text || 'N/A'
      })
    ],
    margins: { top: 50, bottom: 50, left: 50, right: 50 }
  });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n✅ Minutes of Meeting Generator running on http://localhost:${PORT}`);
  
  if (!KEY) {
    console.warn('⚠️  WARNING: API_KEY not set. API calls will fail.');
    console.warn('Set your API key in .env: API_KEY=your_key\n');
  }
});

module.export = app;