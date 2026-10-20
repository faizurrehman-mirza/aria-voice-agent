"""
Aura Skincare - mock order database.

"""

import re

ORDERS = {
    "ORD-101": {
        "order_id": "ORD-101",
        "customer_name": "Priya Sharma",
        "product": "Vitamin C Serum (30ml)",
        "amount": 699,
        "status": "Out for Delivery",
        "courier": "BlueDart",
        "tracking_id": "BD-982103",
        "eta": "Expected by 6 PM today",
    },
    "ORD-102": {
        "order_id": "ORD-102",
        "customer_name": "Rahul Verma",
        "product": "Hydrating Sunscreen SPF 50",
        "amount": 499,
        "status": "Delivered",
        "courier": "Delhivery",
        "tracking_id": "DL-441029",
        "eta": "Delivered 14 days ago",
    },
    "ORD-103": {
        "order_id": "ORD-103",
        "customer_name": "Ananya Patel",
        "product": "Green Tea Face Wash + Toner",
        "amount": 850,
        "status": "Processing",
        "courier": None,
        "tracking_id": None,
        "eta": "Ordered 3 hours ago",
    },
}


def find_order(order_id):
    """
    Look up an order by its ID, tolerating how a human or the speech-to-text
    engine might say it.

    Speech recognition often drops the hyphen ("ord 101") or changes the case
    ("ord-101"). We normalise the ID into the canonical "ORD-101" form so the
    caller here does not have to care. Returns None when the order does not
    exist, which lets the AI politely ask the customer to re-check the ID.
    """
    if not order_id:
        return None

    key = order_id.strip().upper().replace(" ", "-").replace("_", "-")
    if key.startswith("ORD") and "-" not in key[3:]:
        key = f"ORD-{key[3:]}"

    return ORDERS.get(key)


# How an order number looks in something a customer said: "ORD-101",
# "ord 101", "order 101" or just "101". Speech-to-text almost never produces
# the hyphen, and people usually drop the "ORD" as well.
ORDER_MENTION = re.compile(r"\b(?:ord(?:er)?[-\s_]*)?(\d{3})\b", re.IGNORECASE)


def find_order_in_history(history):
    """
    Return the canonical ID of the first order the customer actually mentioned,
    or None if they never named one.

    Used by the post-call summary. The AI writes that summary, but we do not
    let it decide the order ID: it might write "101" where our database says
    "ORD-101", or name an order that does not exist. Reading the customer's own
    words through the same tolerant lookup the AI's tool uses keeps the
    recorded ID both correctly formatted and real.
    """
    for turn in history:
        if turn.get("role") != "user":
            continue
        for match in ORDER_MENTION.finditer(turn.get("content") or ""):
            order = find_order(f"ORD-{match.group(1)}")
            if order is not None:
                return order["order_id"]
    return None
