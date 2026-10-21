# Aria: AI Voice CX Agent for Aura Skincare

A browser-based AI voice assistant built for the Aura Skincare D2C brand. Aria is a friendly, professional, and concise Indian customer support specialist capable of handling order tracking, return queries, and general policy information.

## 🚀 Live Demo
- **Frontend**: https://aria-voice-agent-f.vercel.app
- **Backend**: https://aria-voice-agent-eta.vercel.app

## 🛠️ Technical Stack
- **Frontend**: React + Vite (SPA)
- **Backend**: Django + Django REST Framework
- **AI Services**: 
  - **Groq LLM**: Llama-3 (70B/8B) for intelligent conversation.
  - **Groq Whisper**: `whisper-large-v3` for high-accuracy Hinglish speech-to-text.
  - **Browser Web Speech API**: For low-latency text-to-speech.
- **Voice Pipeline**: Custom VAD (Voice Activity Detection) using Web Audio API for seamless barge-in support.


### 1. Why did I choose this architecture?
I chose a **Django + React** architecture to maintain a clear separation of concerns. Django provides a robust, secure environment for handling AI logic, tool calling, and brand data, while keeping the API keys safe on the server. React allows for a highly responsive "Voice UI" that can handle real-time audio processing (VAD, pre-roll recording, and barge-in) directly in the browser, providing a low-latency experience without the complexity of telephony.

### 2. What was the hardest part of the project?
The most challenging part was implementing **reliable "Barge-in" logic** and handling **Hinglish recognition**. Browser-based voice agents often suffer from "Aria talking over the user." I solved this by building a custom VAD (Voice Activity Detection) system using `AnalyserNode` that tracks volume levels in real-time. To handle Hinglish, I used Groq's Whisper model with specific Hinglish prompt engineering to ensure it transcribes romanized Hindi (e.g., "Mera order kahan hai") rather than Devanagari script.

### 3. If I had one more week, what would I add?
- **Persistent Database**: Currently, the system is stateless. I would add PostgreSQL to store real conversation logs and actual order statuses.
- **Human Handoff**: A dashboard for human agents to take over a call if Aria detects frustration or complex issues.
- **Proactive Notifications**: Ability for Aria to "call" the user (via browser notification) when an order status changes.
- **Advanced TTS**: Replace the browser's native TTS with a more natural, brand-specific Indian voice (like ElevenLabs).

### 4. How would I scale this to handle 1000 concurrent conversations?
To scale to 1000 concurrent users:
1. **Asynchronous Processing**: Move from a stateless POST-based flow to **WebSockets** (Django Channels) to reduce overhead and latency.
2. **Task Queues**: Use **Redis + Celery** to handle LLM processing and tool calling, ensuring the main server threads aren't blocked.
3. **Load Balancing**: Deploy multiple instances of the Django container behind an Nginx load balancer.
4. **Caching**: Cache common policy answers and brand data in Redis to reduce LLM calls for repetitive questions.

## ⚙️ Setup Instructions

### Backend
1. `cd backend`
2. `python -m venv venv`
3. `.\venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Mac/Linux)
4. `pip install -r requirements.txt`
5. Create `.env` with `GROQ_API_KEY`.
6. `python manage.py runserver`

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev`
