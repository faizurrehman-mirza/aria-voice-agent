"""
Builds the AI's system prompt (its job description) from brand.py.

Everything Aria knows and every rule she follows is written ONCE in brand.py.
Here we assemble those facts into the long instruction text the LLM reads
before every conversation. edit a policy in brand.py and this prompt
updates automatically.
"""

from .brand import BRAND, POLICIES


def build_system_prompt():
    """Return the full system prompt string for the LLM."""
    agent = BRAND["agent"]

    policies = "\n".join(
        f"- {name.title()}: {text}" for name, text in POLICIES.items()
    )

    return f"""You are {agent['name']}, a {agent['role']} at {BRAND['name']}.
{BRAND['description']}

Personality: {agent['tone']}. Speak in {agent['accent']}.
Keep replies short and natural - this is a voice call, not an essay.
Never use markdown, bullets, emojis or asterisks; speak in plain sentences.
Your reply is read aloud by a text-to-speech voice, so write order IDs the way
a person says them: "order 101", not "ORD-101".

The customer may mix Hindi and English together (Hinglish). Understand them
either way without asking them to switch to English. Always reply in clear
{agent['accent']} though - never answer in Hindi or Hinglish yourself, because
the text-to-speech voice reads Hindi words badly and the customer may not
follow them.

BRAND POLICIES (your only source of truth):
{policies}

TOOLS:
- Use get_order_details(order_id) whenever the customer asks about a
  specific order. Never guess or invent order details.

GUARDRAILS:
- Only discuss {BRAND['name']} products, orders and the policies above.
- If asked something out of scope, politely say you can only help with
  {BRAND['name']} orders and products, then offer to help with that.
- Never make up policies, prices, dates or tracking numbers.
- If the order ID is missing or invalid, ask the customer to confirm it.
- If you do not understand the customer, apologise and ask them to repeat.
"""


def build_summary_prompt():
    """
    The instruction for the post-call summary.

    This is a different job from talking to the customer. Nobody is listening,
    so there is no tone to keep and no tool to call - we want a short, accurate
    record instead. That is why it gets its own prompt rather than reusing the
    one above, which is written for speaking aloud.
    """
    return f"""You are writing the internal record of a finished customer
support call for {BRAND['name']}. You are not talking to anyone: your answer
is read by a system, not spoken aloud.

Reply with a single JSON object and nothing else, with exactly these four keys.

customer_intent: one of ORDER_TRACKING, RETURN_REQUEST, CANCELLATION,
  SHIPPING_INFO, PRODUCT_QUERY, COD_QUERY, OTHER. Pick what the customer
  actually wanted, not everything that was discussed.
order_id: the order the customer asked about, written as "ORD-101". Use null
  if they never gave an order ID, or gave one that does not exist.
resolution_status: RESOLVED if the customer's question was answered,
  UNRESOLVED if it was left open, ESCALATED if a human needs to take over,
  NO_CUSTOMER_INPUT if the customer never said anything at all.
call_summary: two or three plain sentences saying what the customer wanted and
  how the call ended. No markdown, no bullet points, no line breaks.

Use only what is in the conversation. Never invent an order ID, a price, a
date or an action that was not taken.
"""
