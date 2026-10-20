// The post-call report: the summary the backend builds when the call ends.
//
// The other half of the report is the transcript, which is the Call Log panel
// above - that list already is the conversation in order, so we do not show it
// twice.

// Pairs every JSON key from the backend with the label a human should read.
// Adding a field to the summary means adding one line here, and nothing else.
const FIELDS = [
  ["Customer intent", "customer_intent"],
  ["Order", "order_id"],
  ["Resolution", "resolution_status"],
  ["Summary", "call_summary"],
];

export default function CallSummary({ summary, pending }) {
  // The backend has to ask the AI, so this takes a moment. Show that we are
  // working rather than an empty panel.
  if (pending) {
    return (
      <section className="panel">
        <h2>Call Summary</h2>
        <p className="muted">Writing up the call…</p>
      </section>
    );
  }

  // No call has ended yet, so there is nothing to report.
  if (!summary) return null;

  return (
    <section className="panel">
      <h2>Call Summary</h2>

      <ul className="summary">
        {FIELDS.map(([label, key]) => (
          <li key={key}>
            <span className="label">{label}</span>
            {/* `??` means "use the right side only if the left is null or
                undefined" - so an order the customer never mentioned reads as
                "Not mentioned" instead of the word "null". */}
            <span className="value">{summary[key] ?? "Not mentioned"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
