# Notula AI (MoM_AI)

Notula AI is a professional, production-ready SaaS application designed to transform meeting minutes into structured, actionable items. It features a premium dark/light-mode UI with glassmorphism aesthetics and an auth-first user experience. The powerful backend utilizes the Groq SDK and Llama 3.3 models to transcribe audio and analyze text, generating intelligent meeting summaries in both DOCX and PDF formats.

## Key Features

- **Audio Transcription**: Upload audio files (MP3, WAV, M4A) to automatically transcribe meetings using Groq's `whisper-large-v3` model.
- **Smart Analysis**: Leverage the `llama-3.3-70b-versatile` model to extract participants, key decisions, action items, potential challenges, follow-ups, and next meeting schedules.
- **Multiple Personas**: Analyze your meetings from different perspectives: General, Technical, Board, or Sales.
- **Document Export**: Instantly generate and download professional, formatted meeting minutes in **DOCX** and **PDF** formats.
- **Email Integration**: Email the structured meeting minutes directly to participants.
- **Meeting History**: Save analyzed meetings to your account history for easy retrieval and editing.
- **Analytics Dashboard**: View insights and metrics on your past meetings based on the template type.
- **Authentication**: Secure user registration and login utilizing JWT and bcrypt.
- **Premium UI**: A responsive, beautifully designed React frontend featuring glassmorphism and modern micro-animations.

## Technical Stack

### Frontend
- **React.js**: Component-based UI.
- **Recharts**: For the analytics dashboard.
- **Vanilla CSS**: Custom design system featuring dark/light themes.

### Backend
- **Node.js & Express**: REST API development.
- **MongoDB & Mongoose**: Database for storing user accounts and meeting history.
- **Groq SDK**: For lightning-fast AI transcription (`whisper-large-v3`) and analysis (`llama-3.3-70b-versatile`).
- **Nodemailer**: Email functionality for distributing minutes.
- **PDFKit & Docx**: Server-side document generation for PDF and DOCX.
- **Multer**: Handling audio file uploads.
- **JWT & Bcrypt**: Secure authentication flow.

## Getting Started

### Prerequisites
- Node.js installed
- MongoDB URI
- Groq API Key
- (Optional) Gmail App Password for SMTP delivery

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/Karthik-2598/MoM_AI.git
   ```

2. Install backend dependencies
   ```bash
   cd backend
   npm install
   ```

3. Configure environment variables (`backend/.env`)
   ```env
   PORT=5000
   MONGO_URI=your_mongodb_uri
   JWT_SECRET=your_secret_key
   GROQ_API_KEY=your_groq_api_key
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_gmail_app_password
   ```

4. Install frontend dependencies
   ```bash
   cd ../frontend
   npm install
   ```

5. Start the development servers
   - **Backend**: `cd backend && npm start` (or `node index.js`)
   - **Frontend**: `cd frontend && npm start`

## Deployment
To make this project live:
1. **Frontend**: Can be easily deployed to **Vercel** or **Netlify**. Ensure the `API_URL` in `src/App.js` points to your deployed backend URL.
2. **Backend**: Can be deployed to **Render**, **Railway**, or **Heroku**. Ensure environment variables are configured in your hosting provider's dashboard.
