"""
URL routes for the core app. The project urls.py mounts these under /api/.
"""

from django.urls import path

from . import views

urlpatterns = [
    path("orders/", views.list_orders, name="list_orders"),
    path("orders/<str:order_id>/", views.order_detail, name="order_detail"),
    path("chat/", views.chat, name="chat"),
    path("summary/", views.summary, name="summary"),
    path("greeting/", views.greeting, name="greeting"),
    path("transcribe/", views.transcribe, name="transcribe"),
]
