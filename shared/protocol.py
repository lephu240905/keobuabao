"""
Định nghĩa cấu trúc dữ liệu và các loại tin nhắn
được sử dụng để giao tiếp giữa Client và Server.
"""

# Các lựa chọn trong game
ROCK = "rock"
PAPER = "paper"
SCISSORS = "scissors"
CHOICES = [ROCK, PAPER, SCISSORS]

# Các loại tin nhắn (Message Types)
MSG_CREATE_ROOM = "create_room"
MSG_JOIN_ROOM = "join_room"
MSG_PLAYER_CHOICE = "player_choice"
MSG_CHAT = "chat_message"

MSG_ROOM_CREATED = "room_created"
MSG_JOIN_SUCCESS = "join_success"
MSG_PLAYER_JOINED = "player_joined"
MSG_PLAYER_LEFT = "player_left"
MSG_GAME_START = "game_start"
MSG_GAME_UPDATE = "game_update"
MSG_ROUND_RESULT = "round_result"
MSG_CHAT_BROADCAST = "chat_broadcast"
MSG_ERROR = "error"

def create_message(msg_type, payload=None):
    """Tạo một tin nhắn chuẩn dưới dạng dictionary."""
    message = {"type": msg_type}
    if payload is not None:
        message["payload"] = payload
    return message