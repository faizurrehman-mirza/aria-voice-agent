"""
The AI brain: sends the conversation to Groq and runs the tool-calling loop.

The model can ask us to run a tool (e.g. get_order_details). We run it, feed
the result back, and let the model write the final spoken reply. This loop is
generic - it reads the TOOLS registry, so adding a tool needs no change here.
"""

import json
import os

from groq import Groq

from .prompt import build_summary_prompt, build_system_prompt
from .tools import TOOLS, run_tool

# Safety valve: stop the loop if the model keeps requesting tools forever.
MAX_TOOL_ROUNDS = 4

# The model that both the conversation and the post-call summary use. The env
# var lets us swap models without touching the code.
MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")

# Settings every Groq call in this file starts from. Callers override any of
# them (the summary lowers the temperature and asks for JSON).
_CHAT_DEFAULTS = {"temperature": 0.3, "max_completion_tokens": 400}

_client = None


def _get_client():
    """Create the Groq client once and reuse it."""
    global _client
    if _client is None:
        _client = Groq(api_key=os.environ["GROQ_API_KEY"])
    return _client


def _tool_schemas():
    """The JSON descriptions the model needs in order to know our tools exist."""
    return [tool["schema"] for tool in TOOLS.values()]


def _to_message_dict(message):
    """Convert the SDK's message object into a plain dict the API accepts."""
    return {
        "role": "assistant",
        "content": message.content,
        "tool_calls": [
            {
                "id": call.id,
                "type": "function",
                "function": {
                    "name": call.function.name,
                    "arguments": call.function.arguments,
                },
            }
            for call in message.tool_calls
        ],
    }


def _ask(messages, model, **options):
    """
    One call to Groq - the single place in the project that talks to it.

    `options` adds to, or overrides, the defaults below: the chat loop passes
    tools and tool_choice, the summary passes a JSON response format. Keeping
    one function means the request shape is described once.
    """
    response = _get_client().chat.completions.create(
        model=model,
        messages=messages,
        **{**_CHAT_DEFAULTS, **options},
    )
    return response.choices[0].message


def run_conversation(history):
    """
    history: list of {"role": "user"/"assistant", "content": "..."} dicts.
    Returns the assistant's final spoken reply as a plain string.
    """
    messages = [{"role": "system", "content": build_system_prompt()}]
    messages.extend(history)

    for _ in range(MAX_TOOL_ROUNDS):
        message = _ask(messages, MODEL, tools=_tool_schemas(), tool_choice="auto")

        # No tool needed: this is the final spoken answer.
        if not message.tool_calls:
            return message.content

        # The model wants tool results, so record its request...
        messages.append(_to_message_dict(message))

        # ...run every tool it asked for, and feed each result back.
        for call in message.tool_calls:
            arguments = json.loads(call.function.arguments)
            result = run_tool(call.function.name, arguments)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(result),
                }
            )

    # Safety valve reached: ask once more, without offering tools.
    return _ask(messages, MODEL).content


def summarize_call(history):
    """
    Turn a finished conversation into the summary dict the assessment asks for.

    `history` is the same list of turns the browser has been sending all along,
    so no extra data has to be collected or stored for this - we simply read it
    one more time after the call has ended.

    We ask for a JSON object ("json_object" mode), which makes Groq guarantee
    the reply parses as JSON. Without it the model might wrap the object in
    "Here is the summary:" or a markdown fence, and we would have to pick the
    JSON back out of the text by hand.
    """
    message = _ask(
        [{"role": "system", "content": build_summary_prompt()}, *history],
        MODEL,
        temperature=0,  # describe the call as it happened, do not embellish
        response_format={"type": "json_object"},
        # The spoken replies only need the small default budget, but this model
        # thinks before it writes and the thinking is billed from the same
        # allowance. At the default it can spend the lot on thinking and hand
        # back an empty answer, which Groq rejects as invalid JSON. The summary
        # is the one job big enough to need its own ceiling.
        max_completion_tokens=1024,
    )
    return json.loads(message.content)


# --- Speech to text --------------------------------------------------------

# Groq's Whisper model. There are two, both free. The "turbo" one is a
# distilled - deliberately shrunk - copy that trades accuracy for speed. We
# measured them on our own Hinglish clip and the FULL model was both more
# accurate ("kahan hai" instead of "kahan hi") and no slower, and it copes far
# better with Indian English, so that is what we use.
WHISPER_MODEL = "whisper-large-v3"

# Whisper decides both the spelling AND the alphabet from how the clip sounds.
# Left alone it will answer Hindi in Devanagari script (कहाँ है) or Urdu script
# (کہاں ہے), and our transcript then shows the customer talking in a language
# they never used. We want Hinglish - Hindi written in English letters.
#
# The trick is this prompt. Whisper copies the STYLE of whatever text you hand
# it, so showing it a few Hinglish sentences is what keeps it in English
# letters. We measured it on our own clip: with a plain English prompt the same
# words came back as "Mara order Cahen hi"; with the examples below they came
# back as "Mera order kahan hai". Costs nothing, no second API call.
WHISPER_HINT = (
    "Customer support call for Aura Skincare, an Indian skincare brand. The "
    "customer speaks Hinglish, which is Hindi written in English letters. They "
    "say things like 'mera order kahan hai', 'mera order kab aayega', 'kitne ka "
    "hai', 'paise wapas kar do', 'mujhe return karna hai', 'bhai order 101 kahan "
    "hai'. Always write what the customer says in English letters, never in "
    "Devanagari or Urdu script. Words that may come up: order 101, order 102, "
    "order 103, ORD-101, ORD-102, ORD-103, delivery, BlueDart, Delhivery, "
    "tracking, refund, return, replacement, Cash on Delivery, UPI, Vitamin C "
    "Serum, Hydrating Sunscreen, Green Tea Face Wash, toner, rupees."
)


def transcribe_audio(clip):
    """
    Turn recorded microphone audio into text with Groq Whisper.

    `clip` must be something the Groq SDK accepts for a file: raw bytes, or a
    (filename, bytes, content_type) tuple. The caller (our view) builds that
    from the upload.

    Why we need this at all: Chrome's built-in speech recognition uploads the
    audio to Google, and some networks block that (it reports the error
    "network"). When that happens the browser records the clip itself and
    posts it here, so speech still works with no dependency on Google.
    """
    transcription = _get_client().audio.transcriptions.create(
        model=WHISPER_MODEL,
        file=clip,
        # Pinning the language to English guarantees English letters: Hindi in
        # Devanagari or Urdu would look wrong in the transcript, and the
        # English alphabet is the one thing Whisper cannot leave. The prompt
        # above is what keeps the Hindi words themselves coming out correctly.
        language="en",
        prompt=WHISPER_HINT,
        temperature=0,  # take the likeliest words, do not improvise
    )
    return transcription.text
