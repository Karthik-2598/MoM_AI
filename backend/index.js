require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { Document, Packer, Paragraph, TextRun, Table, TableCell, TableRow, BorderStyle, VerticalAlign, HeadingLevel, AlignmentType } = require('docx');

const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({limit: '10mb'}));
const KEY = process.env.API_KEY;
const URL = "https://integrate.api.nvidia.com/v1/chat/completions";

if(!KEY){
    console.error('ERROR: API_KEY is not set');
}


//prompt for meeting

const MEETING_ANALYSIS_PROMPT = `You are an expert meeting analyst. Analyze the provided meeting notes and extract structured information.
 
MEETING NOTES:
{meetingNotes}
 
Please extract and structure the following information as JSON:
 
{
  "meetingTitle": "string - inferred meeting title",
  "date": "string - meeting date if mentioned",
  "participants": ["array of participant names/roles"],
  "decisions": [
    {
      "id": "D1, D2, etc",
      "title": "Decision made",
      "description": "Brief description",
      "impact": "HIGH/MEDIUM/LOW",
      "owner": "Person/Team responsible for implementing"
    }
  ],
  "actionItems": [
    {
      "id": "A1, A2, etc",
      "title": "Task name",
      "description": "What needs to be done",
      "assignedTo": "Team/Person responsible",
      "priority": "HIGH/MEDIUM/LOW",
      "estimatedEffort": "e.g., '2-3 days', '1 week', '4 hours'",
      "dueDate": "Suggested due date (relative or specific)",
      "dependencies": ["reference to other action item IDs if any"],
      "acceptance_criteria": ["What defines done"]
    }
  ],
  "potentialChallenges": [
    {
      "id": "C1, C2, etc",
      "challenge": "Description of potential challenge",
      "impact": "How it could affect the project",
      "team_affected": "Which team/department",
      "mitigation": "Suggested way to prevent or handle this"
    }
  ],
  "decisions_log": [
    {
      "decision": "Key decision",
      "reasoning": "Why this decision was made",
      "alternatives_considered": "Were there other options?"
    }
  ],
  "followup_items": [
    "Topics that need further discussion",
    "Information needed before proceeding",
    "External dependencies"
  ],
  "next_meeting": "When the next check-in should happen"
}
 
IMPORTANT:
- Be thorough in identifying ALL action items, even implicit ones
- Estimate effort based on complexity described
- Identify REALISTIC risks and challenges teams might face
- Group similar tasks together logically
- Suggest realistic deadlines (not everything is due tomorrow)
- Return ONLY valid JSON, no markdown or extra text`;



//call the API

async function callAPI(userMessage){
try{
const headers = {
"Authorization":`Bearer ${KEY}`,
"Accept":"application/json"
};

const payload={
 "model": "qwen/qwen3.5-122b-a10b",
      "messages": [
        {
          "role": "user",
          "content": userMessage
        }
      ],
      "max_tokens": 16384,
      "temperature": 0.60,
      "top_p": 0.95,
      "stream": false
};

console.log('Calling the API MODEL....');

const response = await axios.post(URL, payload,{
headers: headers,
responseType: 'json'
});
console.log('API response received');

const responseText = response.data.choices[0].message.content;
return responseText;

}catch(error){
console.error('API ERROR:', error.message);
if(error.response){
console.error('Status:', error.response.status);
console.error('Data:', error.response.data);
}
throw error;
}
}

//API-END POINTS
app.post('/api/analyze-meeting', async(req, res)=>{
    try{
        const {meetingNotes, includeFormat = 'docx'} = req.body;
        if(!meetingNotes || meetingNotes.trim().length === 0){
            return res.status(400).json({error: 'Meeting notes are required'});
        }
        console.log('Analyzing meeting notes.....');
        console.log(`Input size: ${meetingNotes.length} characters`);

        //call the AI 
        const prompt = MEETING_ANALYSIS_PROMPT.replace('{meetingNotes}', meetingNotes);
        const responseText = await callAPI(prompt);

        let data;
        try{
           data = JSON.parse(responseText);
           console.log('Successfully parsed');
        }catch(parseError){
            console.error('Failed to parse the JSON response');
            return res.status(500).json({
                error: 'Failed to parse the analysis. Please try again.',
                details: parseError.message,
                rawResponse: responseText.substring(0,500)
            });
        }

        //docx generated
        if(includeFormat === 'docx' || includeFormat === 'both'){
            const docBuffer = await generateMOMDocument(data);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment; filename="Minutes_of_Meeting.docx"');
      return res.send(docBuffer);
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
        const {meetingNotes} = req.body;
        if(!meetingNotes || meetingNotes.trim().length === 0){
            return res.status(400).json({error: 'Meeting notes required'});
        }
        console.log('Meeting notes(JSON response)...');

        const prompt = MEETING_ANALYSIS_PROMPT.replace('{meetingNotes}', meetingNotes);

         const responseText = await callAPI(prompt);
 
    const analysisData = JSON.parse(responseText);
    res.json(analysisData);
    }catch(error){
        console.error('Error: ', error);
        res.status(500).json({error: error.message});
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
      spacing: { after: 100 }
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
          spacing: { before: 100, after: 50 }
        }),
        new Paragraph({
          text: decision.description,
          spacing: { after: 50 },
          indent: { left: 720 }
        }),
        new Paragraph({
          text: `Owner: ${decision.owner} | Impact: ${decision.impact}`,
          italics: true,
          spacing: { after: 100 },
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
    //group by team
    const groupByTeam = {};
    data.actionItems.forEach(item=>{
        const team = item.assignedTo || 'Unassigned';
        if(!groupByTeam[team]){
            groupByTeam[team] = [];
        }
        groupByTeam[team].push(item);
    });

    //table for action items
    const tableRows = [
        new TableRow({
            children: [
          createTableHeader('ID'),
          createTableHeader('Task'),
          createTableHeader('Owner'),
          createTableHeader('Priority'),
          createTableHeader('Due Date'),
          createTableHeader('Status')
        ],
        height: { value: 400, rule: 'atLeast' }
        })
    ];

    data.actionItems.forEach(item => {
      tableRows.push(
        new TableRow({
          children: [
            createTableCell(item.id),
            createTableCell(item.title),
            createTableCell(item.assignedTo),
            createTableCell(item.priority),
            createTableCell(item.dueDate),
            createTableCell('Open')
          ]
        })
      );
    });

    sections.push(
        new Table({
            rows: tableRows,
            width: {size: 100, type: 'pct'}
        }),
        new Paragraph({spacing: {after:100}})
    );

    Object.entries(groupByTeam).forEach(([team, items]) => {
      sections.push(
        new Paragraph({
          text: `Team: ${team}`,
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 150, after: 100 }
        })
      );
      items.forEach(item => {
        sections.push(
          new Paragraph({
            text: `${item.id} - ${item.title}`,
            bold: true,
            spacing: { after: 50 }
          }),
          new Paragraph({
            text: `Description: ${item.description}`,
            spacing: { after: 50 },
            indent: { left: 720 }
          }),
          new Paragraph({
            text: `Estimated Effort: ${item.estimatedEffort}`,
            spacing: { after: 50 },
            indent: { left: 720 }
          }),
          new Paragraph({
            text: `Due: ${item.dueDate}`,
            spacing: { after: 100 },
            indent: { left: 720 }
          })
        );
    });
});
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
          spacing: { after: 50 }
        }),
        new Paragraph({
          text: `Impact: ${challenge.impact}`,
          spacing: { after: 50 },
          indent: { left: 720 }
        }),
        new Paragraph({
          text: `Affected Team: ${challenge.team_affected}`,
          spacing: { after: 50 },
          indent: { left: 720 }
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

//Decision logs

if (data.decisions_log && data.decisions_log.length > 0) {
    sections.push(
      new Paragraph({
        text: '4. DECISION LOG',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );
    data.decisions_log.forEach((log, index) => {
      sections.push(
        new Paragraph({
          text: `Decision ${index + 1}: ${log.decision}`,
          bold: true,
          spacing: { after: 50 }
        }),
        new Paragraph({
          text: `Reasoning: ${log.reasoning}`,
          spacing: { after: 50 },
          indent: { left: 720 }
        }),
        new Paragraph({
          text: `Alternatives: ${log.alternatives_considered}`,
          spacing: { after: 100 },
          indent: { left: 720 }
        })
      );
    });
  }

  //follow-up items

  if (data.followup_items && data.followup_items.length > 0) {
    sections.push(
      new Paragraph({
        text: '5. FOLLOW-UP ITEMS',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 }
      })
    );
 
    data.followup_items.forEach((item, index) => {
      sections.push(
        new Paragraph({
          text: `${index + 1}. ${item}`,
          spacing: { after: 50 }
        })
      );
    });
  }

  //Footer

  sections.push(
    new Paragraph({
      text: '---',
      spacing: { before: 300 }
    }),
    new Paragraph({
      text: 'Generated by Minutes of Meeting AI Assistant',
      italics: true,
      alignment: AlignmentType.CENTER,
      size: 20,
      color: '999999'
    })
  );

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