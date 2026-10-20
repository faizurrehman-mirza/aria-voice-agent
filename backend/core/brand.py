"""
Aura Skincare - the agent's knowledge base.

"""

BRAND = {
    "name": "Aura Skincare",
    "description": (
        "A premium organic Indian skincare brand focused on simple, effective "
        "products made with thoughtfully selected ingredients."
    ),
    "agent": {
        "name": "Aria",
        "role": "customer support specialist",
        "tone": "friendly, professional and concise",
        "accent": "Indian English",
    },
}

POLICIES = {
    "shipping": (
        "Free delivery on orders above Rs.499. Orders below Rs.499 have a "
        "Rs.50 shipping fee. Standard delivery takes 3-5 business days."
    ),
    "returns": (
        "Returns are accepted within 7 days of delivery for unopened, unused "
        "products in original packaging. Damaged or defective products must be "
        "reported within 48 hours of delivery with photos for replacement."
    ),
    "cancellation": (
        "Orders can be cancelled only while their status is Processing. Once an "
        "order is Shipped or Out for Delivery, it cannot be cancelled; the "
        "customer may refuse delivery at the doorstep instead."
    ),
    "cod": (
        "Cash on Delivery is available for orders up to Rs.2,500. Customers can "
        "pay by cash or UPI at the doorstep."
    ),
}

# The first thing Aria says when the evaluator clicks Start Call. Built from
# BRAND so the agent's name is written only once.
GREETING = (
    f"Namaste! This is {BRAND['agent']['name']} from {BRAND['name']}. "
    "How can I help you today?"
)
