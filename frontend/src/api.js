// Every call to the Django backend lives in this one file, so components never
// build URLs themselves. If the API location changes, we edit it here only.
//
// VITE_API_BASE comes from an env var so the deployed build can point at the
// deployed backend. Locally it falls back to our dev server.

const BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000/api";

export async function fetchOrders() {
  const res = await fetch(`${BASE}/orders/`);
  if (!res.ok) throw new Error("Could not load the test orders.");
  return res.json();
}

export async function sendChat(messages) {
  const res = await fetch(`${BASE}/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "The agent could not reply.");
  return data.reply;
}

// Asks the backend for the post-call report. Called once, when the call ends.
// We return only the summary: the transcript half of the report is the
// conversation the app already holds and shows in the Call Log.
export async function fetchSummary(messages) {
  const res = await fetch(`${BASE}/summary/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Could not write the call summary.");
  return data.summary;
}

export async function fetchGreeting() {
  const res = await fetch(`${BASE}/greeting/`);
  if (!res.ok) throw new Error("Could not load the greeting.");
  const data = await res.json();
  return data.greeting;
}

// Sends a recorded clip to the backend for Whisper transcription. We do NOT
// set a Content-Type header here: the browser adds it along with the multipart
// boundary it invents, and setting it by hand would break the upload.
export async function transcribeAudio(blob) {
  const form = new FormData();
  form.append("audio", blob, "speech.webm");

  const res = await fetch(`${BASE}/transcribe/`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Could not transcribe the audio.");
  return data.text;
}
