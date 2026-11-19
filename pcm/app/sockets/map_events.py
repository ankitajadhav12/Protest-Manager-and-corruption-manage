from flask import session
from flask_socketio import join_room
from app import socketio


@socketio.on("connect")
def handle_connect():
    uid = session.get("user_id")
    if uid:
        join_room(f"user:{uid}")
    socketio.emit("connection:ready", {"connected": True})


def broadcast_map_event(event_name: str, payload: dict):
    socketio.emit(event_name, payload)
    socketio.emit("analytics:updated", {"refresh": True})
