"""
REST API for the Aura Skincare voice agent.

The order endpoints power the "Test Orders Helper" panel in the UI. The chat
endpoint is the AI: the browser posts the conversation so far and gets Aria's
next spoken reply back.
"""

from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .brand import GREETING
from .llm import run_conversation, summarize_call, transcribe_audio
from .orders import ORDERS, find_order, find_order_in_history


def _api_key_error():
    """A 500 response when the Groq key is missing, otherwise None."""
    if settings.GROQ_API_KEY:
        return None
    return Response(
        {"detail": "GROQ_API_KEY is not set. Add it to backend/.env."},
        status=500,
    )


def _conversation(request):
    """
    Pull the conversation out of a POST body and check it is usable.

    /api/chat/ and /api/summary/ take the exact same body, so the check lives
    here once. A bad body is raised, not returned, because DRF already turns a
    raised exception into the matching HTTP response - so this function always
    gives the caller a real conversation to work with, never a maybe.
    """
    messages = request.data.get("messages")
    if not isinstance(messages, list) or not messages:
        # Wrapped in a dict so this error looks like every other one in this
        # API: {"detail": "..."}. Raised bare, DRF would send a JSON array
        # instead, and the frontend reads errors the same way everywhere.
        raise ValidationError({"detail": "messages must be a non-empty list"})
    return messages


@api_view(["GET"])
def list_orders(request):
    """GET /api/orders/ - all demo orders, for the Test Orders Helper panel."""
    return Response(list(ORDERS.values()))


@api_view(["GET"])
def order_detail(request, order_id):
    """GET /api/orders/<order_id>/ - one order, or 404 when the ID is unknown."""
    order = find_order(order_id)
    if order is None:
        return Response({"detail": f"Order {order_id} not found"}, status=404)
    return Response(order)


@api_view(["POST"])
def chat(request):
    """
    POST /api/chat/ - body: {"messages": [{"role": "...", "content": "..."}]}
    Returns {"reply": "<Aria's spoken reply>"}.

    The server is stateless: the browser sends the whole conversation each
    turn, so we keep no session or database.
    """
    key_error = _api_key_error()
    if key_error:
        return key_error

    # A bad body raises, and DRF turns that into the 400 response for us.
    messages = _conversation(request)

    return Response({"reply": run_conversation(messages)})


@api_view(["POST"])
def summary(request):
    """
    POST /api/summary/ - body: {"messages": [...]}, the finished call.
    Returns {"transcript": [...], "summary": {...}}.

    The two halves of the post-call report the assessment asks for: what was
    said, in order, and the structured JSON describing it. The browser calls
    this once, when the evaluator presses End Call.
    """
    key_error = _api_key_error()
    if key_error:
        return key_error

    # A bad body raises, and DRF turns that into the 400 response for us.
    messages = _conversation(request)

    result = summarize_call(messages)

    # The AI writes the prose, but our own database decides the order ID: it
    # may write "101" where we store "ORD-101", or name an order that does not
    # exist. A summary is only worth anything if its facts are true.
    result["order_id"] = find_order_in_history(messages)

    transcript = [
        {"role": turn.get("role"), "content": turn.get("content")}
        for turn in messages
    ]
    return Response({"transcript": transcript, "summary": result})


@api_view(["GET"])
def greeting(request):
    """GET /api/greeting/ - Aria's opening line, built from brand.py."""
    return Response({"greeting": GREETING})


@api_view(["POST"])
def transcribe(request):
    """
    POST /api/transcribe/ - multipart body with an "audio" file.
    Returns {"text": "<what the customer said>"}.

    This is the microphone fallback. Chrome's built-in speech recognition has
    to reach Google's servers, and on some networks it cannot (the browser
    reports the error "network"). So the browser records the clip itself and
    posts it here, and we transcribe it with Groq Whisper instead.
    """
    key_error = _api_key_error()
    if key_error:
        return key_error

    audio = request.FILES.get("audio")
    if audio is None:
        return Response({"detail": "No audio file was uploaded."}, status=400)

    # The Groq SDK wants bytes or a (filename, bytes, content_type) tuple. A
    # Django UploadedFile is neither, so we hand it the raw clip in that shape.
    clip = (audio.name, audio.read(), audio.content_type or "audio/webm")
    return Response({"text": transcribe_audio(clip)})

