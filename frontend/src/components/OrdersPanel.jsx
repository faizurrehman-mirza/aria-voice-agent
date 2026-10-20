// The Test Orders Helper: the three demo orders the evaluator can ask about.
// The data comes from the real API (/api/orders/) - nothing is hardcoded here.

export default function OrdersPanel({ orders }) {
  return (
    <section className="panel">
      <h2>Test Orders Helper</h2>

      {orders.length === 0 ? (
        <p className="muted">Loading orders…</p>
      ) : (
        <ul className="orders">
          {orders.map((order) => (
            <li key={order.order_id}>
              <div className="row">
                <strong>{order.order_id}</strong>
                <span className={`pill ${order.status.replace(/\s+/g, "-")}`}>
                  {order.status}
                </span>
              </div>
              <div className="muted">{order.customer_name}</div>
              <div className="muted">
                {order.product} · ₹{order.amount}
              </div>
              <div className="muted small">{order.eta}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
