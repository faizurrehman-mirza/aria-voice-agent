import { useEffect, useRef, useState } from "react";
import { fetchGreeting, fetchOrders, fetchSummary, sendChat, transcribeAudio } from "./api";
import { micSupported, speak, startMicrophone, stopSpeaking } from "./speech";
import CallLog from "./components/CallLog";
import CallSummary from "./components/CallSummary";
import OrdersPanel from "./components/OrdersPanel";
import "./App.css";

// The four live states the assessment asks us to display.
const STATE = {
  IDLE: "idle",
  LISTENING: "listening",
  THINKING: "thinking",
  SPEAKING: "speaking",
};

const STATE_LABEL = {
  [STATE.IDLE]: "Idle",
  [STATE.LISTENING]: "Listening",
  [STATE.THINKING]: "Thinking",
  [STATE.SPEAKING]: "Speaking",
};

export default function App() {
  const [status, setStatus] = useState(STATE.IDLE);
  const [inCall, setInCall] = useState(false);
  const [messages, setMessages] = useState([]); // {role, content} pairs
  const [orders, setOrders] = useState([]);
  const [greeting, setGreeting] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null); // the post-call report
  const [summaryPending, setSummaryPending] = useState(false);

  // The microphone callbacks are created once, when the call starts, so they
  // would only ever see the state from that first render. Refs hold the live
  // values instead.
  const inCallRef = useRef(false);
  const historyRef = useRef([]); // the conversation we send to the backend
  const micRef = useRef(null); // the open microphone, if any
  // Each reply gets a number. When the customer interrupts Aria we bump it, so
  // the reply's "I have finished speaking" callback knows it is out of date.
  const speechTokenRef = useRef(0);

  useEffect(() => {
    fetchOrders().then(setOrders).catch((err) => setError(err.message));
    fetchGreeting()
      .then(setGreeting)
      .catch(() => {});
  }, []);

  function addTurn(turn) {
    historyRef.current = [...historyRef.current, turn];
    setMessages(historyRef.current);
  }

  // Say one reply out loud, while the microphone stays alert for an interrupt.
  function say(text) {
    const token = ++speechTokenRef.current;

    setStatus(STATE.SPEAKING);
    micRef.current?.setMode("guarded");

    speak(text, () => {
      // A newer reply, or an interruption, has taken over: ignore this one.
      if (token !== speechTokenRef.current) return;
      micRef.current?.setMode("listening");
      setStatus(inCallRef.current && micRef.current ? STATE.LISTENING : STATE.IDLE);
    });
  }

  // Send one customer turn to the brain, then speak the answer. Both the
  // microphone and the typed input come through here.
  function ask(text) {
    const clean = text.trim();
    if (!clean) return;

    micRef.current?.setMode("off"); // nothing to listen for while Aria works
    addTurn({ role: "user", content: clean });
    setDraft("");
    setStatus(STATE.THINKING);

    sendChat(historyRef.current)
      .then((reply) => {
        addTurn({ role: "assistant", content: reply });
        say(reply);
      })
      .catch((err) => {
        setError(err.message);
        micRef.current?.setMode("listening");
        setStatus(STATE.IDLE);
      });
  }

  // The customer has started a sentence.
  function onSpeechStart() {
    if (!inCallRef.current) return;

    // If Aria is mid-sentence this is an interruption (barge-in): cut her off.
    speechTokenRef.current += 1; // the "finished speaking" callback is stale now
    stopSpeaking();
    micRef.current?.setMode("off"); // we are capturing this sentence ourselves
    setStatus(STATE.LISTENING);
  }

  // The customer has finished a sentence: transcribe it, then answer.
  async function onUtterance(clip) {
    if (!inCallRef.current) return;
    setStatus(STATE.THINKING);

    try {
      const text = (await transcribeAudio(clip)).trim();
      if (!inCallRef.current) return; // the call ended while we were waiting

      if (!text) {
        micRef.current?.setMode("listening");
        setStatus(STATE.IDLE);
        return;
      }
      ask(text);
    } catch (err) {
      setError(err.message);
      micRef.current?.setMode("listening");
      setStatus(STATE.IDLE);
    }
  }

  async function startCall() {
    historyRef.current = [];
    setMessages([]);
    setSummary(null); // last call's report belongs to the last call
    setError("");
    inCallRef.current = true;
    setInCall(true);
    setStatus(STATE.THINKING); // asking for the microphone takes a moment

    const mic = await startMicrophone({
      onSpeechStart,
      onUtterance,
      onError: (message) => setError(message),
    });

    if (!inCallRef.current) {
      // The customer pressed End Call while the browser was asking permission.
      mic?.close();
      return;
    }
    micRef.current = mic;

    if (greeting) {
      // Record the greeting before speaking it. Otherwise the Call Log and the
      // post-call summary start with the customer's first sentence, as if Aria
      // had said nothing - which is not what the call looked like.
      addTurn({ role: "assistant", content: greeting });
      say(greeting);
    } else {
      mic?.setMode("listening");
      setStatus(STATE.LISTENING);
    }
  }

  // Ask the backend to write up the call we just had. This is the only thing
  // that happens after the call ends: the browser sends the conversation one
  // last time, and gets the report back. Nothing is stored anywhere.
  function writeSummary(history) {
    setSummaryPending(true);
    fetchSummary(history)
      .then(setSummary)
      .catch((err) => setError(err.message))
      .finally(() => setSummaryPending(false));
  }

  function endCall() {
    inCallRef.current = false;
    speechTokenRef.current += 1; // stop caring about any pending speech callback
    stopSpeaking();
    micRef.current?.close(); // release the microphone
    micRef.current = null;
    setInCall(false);
    setStatus(STATE.IDLE);
    writeSummary(historyRef.current);
  }

  return (
    <div className="app">
      <header>
        <h1>Aura Skincare</h1>
        <p className="muted">AI Voice CX Agent · Aria</p>
      </header>

      <section className="controls">
        <button className="start" onClick={startCall} disabled={inCall}>
          Start Call
        </button>
        <button className="end" onClick={endCall} disabled={!inCall}>
          End Call
        </button>

        <div className={`status ${status}`}>
          <span className="dot" />
          {STATE_LABEL[status]}
        </div>
      </section>

      {!micSupported && (
        <p className="notice">
          This browser cannot record audio. Use Chrome, Edge or Brave for the
          voice call, or type below.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <main>
        <CallLog messages={messages} />
        <OrdersPanel orders={orders} />
      </main>

      <CallSummary summary={summary} pending={summaryPending} />

      {/* Typing stays available in case the microphone cannot be used. */}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          ask(draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={inCall ? "Or type what the customer says…" : "Press Start Call first"}
          disabled={!inCall || status === STATE.THINKING}
        />
        <button type="submit" disabled={!inCall || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
