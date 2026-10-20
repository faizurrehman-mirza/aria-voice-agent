// The chronological call log: every customer turn and every Aria turn, in order.

import { useEffect, useRef } from "react";

export default function CallLog({ messages }) {
  // A ref is React's way of holding on to a real DOM element, so we can reach
  // it and call methods on it. Here it marks the very bottom of the list: an
  // empty list item we never show, used only as a target to scroll to.
  const bottomRef = useRef(null);

  // Run this after every render in which `messages` changed, i.e. after every
  // new turn arrives. We scroll the invisible marker into view, which drags
  // the whole list down to the newest bubble.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <section className="panel">
      <h2>Call Log</h2>

      {messages.length === 0 ? (
        <p className="muted">Start the call and speak to Aria.</p>
      ) : (
        <ul className="log">
          {messages.map((message, index) => (
            <li key={index} className={`bubble ${message.role}`}>
              <span className="who">
                {message.role === "user" ? "Customer" : "Aria"}
              </span>
              <span className="what">{message.content}</span>
            </li>
          ))}
          {/* Zero-height marker at the end of the list. */}
          <li ref={bottomRef} aria-hidden="true" />
        </ul>
      )}
    </section>
  );
}
