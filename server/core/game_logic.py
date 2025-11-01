import random
import time
from shared.protocol import ROCK, PAPER, SCISSORS, CHOICES

class Player:
    def __init__(self, websocket, name, avatar):
        self.websocket = websocket
        self.name = name
        self.avatar = avatar
        self.choice = None
        self.win_streak = 0
        self.stats = {"played": 0, "won": 0, "lost": 0, "draw": 0}

    def to_dict(self):
        return {
            "name": self.name,
            "avatar": self.avatar,
            "win_streak": self.win_streak,
            "stats": self.stats
        }

class GameRoom:
    def __init__(self, room_code, game_mode="classic"):
        self.room_code = room_code
        self.players = []
        self.game_state = "waiting"
        self.round_choices = {}
        self.afk_timer_task = None # Biến để theo dõi tác vụ đếm giờ AFK
        self.game_mode = game_mode  # "classic", "speed"
        self.round_start_time = None  # Timestamp khi bắt đầu vòng chơi
        self.round_timer_duration = 30  # Thời gian đếm ngược (giây)

    def add_player(self, player):
        if len(self.players) < 2:
            self.players.append(player)
            return True
        return False

    def remove_player(self, websocket):
        player_to_remove = self.get_player(websocket)
        if player_to_remove:
            self.players.remove(player_to_remove)
        return not self.players

    def get_player(self, websocket):
        for p in self.players:
            if p.websocket == websocket:
                return p
        return None

    def make_choice(self, player, choice):
        if self.game_state != "playing" or choice not in CHOICES: return False
        if player.name not in self.round_choices:
            self.round_choices[player.name] = choice
            return True
        return False

    def check_round_end(self):
        return len(self.players) == 2 and len(self.round_choices) == len(self.players)

    def determine_winner(self):
        if len(self.players) != 2: return {"result": "error"}
        p1, p2 = self.players[0], self.players[1]
        c1, c2 = self.round_choices.get(p1.name), self.round_choices.get(p2.name)
        if c1 is None or c2 is None: return {"result": "error"}

        p1.stats["played"] += 1
        p2.stats["played"] += 1
        
        winner = None
        if c1 == c2:
            result = "draw"
            p1.win_streak = p2.win_streak = 0
            p1.stats["draw"] += 1
            p2.stats["draw"] += 1
        elif (c1, c2) in [(ROCK, SCISSORS), (SCISSORS, PAPER), (PAPER, ROCK)]:
            result, winner = "win", p1
            p1.win_streak += 1
            p2.win_streak = 0
            p1.stats["won"] += 1
            p2.stats["lost"] += 1
        else:
            result, winner = "win", p2
            p2.win_streak += 1
            p1.win_streak = 0
            p2.stats["won"] += 1
            p1.stats["lost"] += 1
            
        self.game_state = "result"
        
        return {
            "result": result,
            "winner_name": winner.name if winner else None,
            "choices": {p1.name: c1, p2.name: c2}
        }

    def reset_for_new_round(self):
        self.game_state = "playing"
        self.round_choices.clear()
        for p in self.players: p.choice = None
        
        # Thiết lập timer cho vòng mới
        # Thời gian theo game mode
        timer_durations = {
            "classic": 30,
            "speed": 5
        }
        self.round_timer_duration = timer_durations.get(self.game_mode, 30)
        self.round_start_time = time.time()  # Lưu thời gian bắt đầu vòng

    def get_state(self):
        state = {
            "room_code": self.room_code,
            "game_state": self.game_state,
            "players": [p.to_dict() for p in self.players],
            "game_mode": self.game_mode  # Gửi game_mode về client để đồng bộ
        }
        # Thêm thông tin timer để đồng bộ
        if self.round_start_time is not None:
            state["round_start_time"] = self.round_start_time
            state["round_timer_duration"] = self.round_timer_duration
        return state
    