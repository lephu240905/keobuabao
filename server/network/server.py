import asyncio
import json
import random
import string
import websockets
from server.core.game_logic import GameRoom, Player
from shared.protocol import *

# --- Trạng thái toàn cục của Server ---
CONNECTED_CLIENTS = set()
rooms = {}
AFK_TIMEOUT = 30  # Thời gian chờ (giây) trước khi kick

# --- Các hàm tiện ích ---
def generate_room_code(length=4):
    """Tạo mã phòng ngẫu nhiên và duy nhất."""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))
        if code not in rooms:
            return code

async def send_message(websocket, msg_type, payload=None):
    """Gửi một tin nhắn đến một client cụ thể.
    Không kiểm tra attribute cụ thể (như .closed/.open) vì object có thể khác kiểu.
    Thay vào đó cố gắng gửi và bỏ qua lỗi khi kết nối đã đóng."""
    try:
        await websocket.send(json.dumps(create_message(msg_type, payload)))
    except (websockets.exceptions.ConnectionClosed, AttributeError):
        # Nếu websocket không hỗ trợ .send hoặc đã đóng => bỏ qua
        return
    except Exception as e:
        # Bắt lỗi chung để không làm sập server
        print(f"[send_message] Lỗi gửi đến client: {e}")

async def broadcast_to_room(room, msg_type, payload=None):
    """Gửi một tin nhắn đến tất cả người chơi trong phòng."""
    if not room.players:
        return

    message = json.dumps(create_message(msg_type, payload))
    coros = []
    for p in list(room.players):
        ws = getattr(p, "websocket", None)
        if ws is None:
            continue
        # Thực hiện gửi trong try/except để một client lỗi không ảnh hưởng tới toàn bộ
        async def _safe_send(w, m):
            try:
                await w.send(m)
            except (websockets.exceptions.ConnectionClosed, AttributeError):
                # Nếu send lỗi, bỏ qua
                return
            except Exception as e:
                print(f"[broadcast_to_room] Lỗi khi gửi tới {getattr(p,'name', 'unknown')}: {e}")

        coros.append(_safe_send(ws, message))

    if coros:
        # return_exceptions=True để tiếp tục gửi cho các client còn lại khi có lỗi
        await asyncio.gather(*coros, return_exceptions=True)

# --- Logic xử lý AFK (Không hoạt động) ---
async def afk_check_task(room_code):
    """Tác vụ chạy ngầm để đếm giờ và kick người chơi AFK."""
    try:
        await asyncio.sleep(AFK_TIMEOUT)
    except asyncio.CancelledError:
        # Nếu task bị huỷ thì chỉ dừng im lặng
        return

    # Nếu phòng đã bị xóa thì dừng
    room = rooms.get(room_code)
    if not room:
        return

    try:
        if room.game_state == 'playing' and not room.check_round_end():
            print(f"[AFK] Thời gian chờ của phòng {room_code} đã hết. Đang kiểm tra...")

            player_choices = room.round_choices.keys()
            afk_players = [p for p in room.players if p.name not in player_choices]

            for player in afk_players:
                print(f"[AFK] Kick người chơi {player.name} khỏi phòng {room_code}.")
                try:
                    await send_message(player.websocket, MSG_ERROR, {"message": "Bạn đã bị kick vì không hoạt động."})
                    try:
                        await player.websocket.close(code=1000, reason="AFK")
                    except Exception:
                        pass
                except Exception:
                    pass
    except Exception as e:
        print(f"[AFK] Lỗi khi kiểm tra AFK cho phòng {room_code}: {e}")

async def start_new_round(room):
    """Bắt đầu một vòng chơi mới và khởi động bộ đếm giờ AFK."""
    if len(room.players) != 2:
        return

    room.reset_for_new_round()

    # Huỷ task cũ nếu còn chạy (không raise nếu đã huỷ)
    if getattr(room, "afk_timer_task", None) and not room.afk_timer_task.done():
        room.afk_timer_task.cancel()

    room.afk_timer_task = asyncio.create_task(afk_check_task(room.room_code))

    await broadcast_to_room(room, MSG_GAME_UPDATE, room.get_state())

# --- Hàm xử lý chính ---
async def handle_message(websocket, message_json):
    """Xử lý các tin nhắn nhận được từ client."""
    try:
        message = json.loads(message_json)
        msg_type = message.get("type")
        payload = message.get("payload", {})

        player = next((p for r in rooms.values() for p in r.players if getattr(p, "websocket", None) == websocket), None)
        room = next((r for r in rooms.values() if player in r.players), None) if player else None

        if msg_type == MSG_CREATE_ROOM:
            room_code = generate_room_code()
            game_mode = payload.get("game_mode", "classic")
            new_room = GameRoom(room_code, game_mode)
            new_player = Player(websocket, payload.get("name", "Player"), payload.get("avatar", "😀"))
            new_room.add_player(new_player)
            rooms[room_code] = new_room
            # Gửi game_mode về client khi tạo phòng
            await send_message(websocket, MSG_ROOM_CREATED, {"room_code": room_code, "game_mode": game_mode})
            await send_message(websocket, MSG_GAME_UPDATE, new_room.get_state())

        elif msg_type == MSG_JOIN_ROOM:
            room_code = payload.get("room_code")
            target_room = rooms.get(room_code)
            if target_room and len(target_room.players) < 2:
                # Người vào sau PHẢI dùng game_mode của phòng (không thay đổi)
                # Game mode đã được thiết lập bởi người tạo phòng
                
                new_player = Player(websocket, payload.get("name", "Player"), payload.get("avatar", "😀"))
                target_room.add_player(new_player)

                await send_message(websocket, MSG_JOIN_SUCCESS, target_room.get_state())

                if len(target_room.players) == 2:
                    await start_new_round(target_room)
                else:
                    await broadcast_to_room(target_room, MSG_GAME_UPDATE, target_room.get_state())
            else:
                error_msg = "Phòng đã đầy." if target_room else "Không tìm thấy phòng."
                await send_message(websocket, MSG_ERROR, {"message": error_msg})

        elif msg_type == MSG_PLAYER_CHOICE and player and room and room.game_state == 'playing':
            if room.make_choice(player, payload.get("choice")):
                update_payload = room.get_state()
                update_payload["player_made_choice"] = player.name
                await broadcast_to_room(room, MSG_GAME_UPDATE, update_payload)

            if room.check_round_end():
                if getattr(room, "afk_timer_task", None) and not room.afk_timer_task.done():
                    room.afk_timer_task.cancel()

                result = room.determine_winner()
                await broadcast_to_room(room, MSG_ROUND_RESULT, result)

                system_message_text = ""
                
                if result.get("result") == "draw":
                    system_message_text = "Ván đấu kết thúc với kết quả HÒA!"
                elif result.get("winner_name"):
                    winner, loser = (room.players[0], room.players[1]) if result["winner_name"] == room.players[0].name else (room.players[1], room.players[0])
                    choice_map = { "rock": "✊", "paper": "🖐️", "scissors": "✌️" }
                    system_message_text = (
                        f"🔥 {winner.name} thắng! "
                        f"({choice_map.get(result['choices'][winner.name])} thắng {choice_map.get(result['choices'][loser.name])})"
                    )

                if system_message_text:
                    await broadcast_to_room(room, MSG_CHAT_BROADCAST, {"sender_name": "Hệ thống", "sender_avatar": "system", "text": system_message_text})

                # Chờ 3s trước khi bắt đầu vòng mới
                await asyncio.sleep(3)
                await start_new_round(room)

        elif msg_type == MSG_CHAT and player and room:
            chat_msg = {"sender_name": player.name, "sender_avatar": player.avatar, "text": payload.get("text")}
            await broadcast_to_room(room, MSG_CHAT_BROADCAST, chat_msg)

    except Exception as e:
        print(f"Lỗi khi xử lý tin nhắn: {e}")

async def cleanup_connection(websocket):
    """Dọn dẹp tài nguyên khi một client ngắt kết nối."""
    player_left, room_left = None, None
    for r_code, r in list(rooms.items()):
        p = r.get_player(websocket)
        if p:
            player_left, room_left = p, r
            break

    if player_left and room_left:
        print(f"[DISCONNECTED] {player_left.name} từ phòng {room_left.room_code}")
        if getattr(room_left, "afk_timer_task", None) and not room_left.afk_timer_task.done():
            room_left.afk_timer_task.cancel()

        # remove_player trả về True nếu phòng trống (theo logic cũ)
        if room_left.remove_player(websocket):
            print(f"[ROOM CLOSED] Phòng {room_left.room_code} trống và đã bị đóng.")
            try:
                del rooms[room_left.room_code]
            except KeyError:
                pass
        else:
            await broadcast_to_room(room_left, MSG_PLAYER_LEFT, {"name": player_left.name})
            await broadcast_to_room(room_left, MSG_GAME_UPDATE, room_left.get_state())
    else:
        # Nếu client rời trước khi vào phòng
        print("[DISCONNECTED] Client rời trước khi vào phòng hoặc không tìm thấy player trong rooms.")

async def handler(websocket):
    """Hàm quản lý vòng đời của mỗi kết nối client."""
    CONNECTED_CLIENTS.add(websocket)
    print(f"[NEW CONNECTION] {websocket.remote_address}, tổng số: {len(CONNECTED_CLIENTS)}")
    try:
        async for message in websocket:
            await handle_message(websocket, message)
    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        print(f"[handler] Lỗi: {e}")
    finally:
        await cleanup_connection(websocket)
        CONNECTED_CLIENTS.discard(websocket)
        print(f"[CONNECTION CLOSED] {websocket.remote_address}, tổng số: {len(CONNECTED_CLIENTS)}")

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8080):
        print("[SERVER STARTED] Listening on ws://0.0.0.0:8080")
        await asyncio.Future()

def start_server():
    asyncio.run(main())
