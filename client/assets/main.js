const screens = {
  home: document.getElementById("home-screen"),
  game: document.getElementById("game-screen"),
};
const playerNameInput = document.getElementById("player-name");
const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomBtn = document.getElementById("join-room-btn");
const playCpuBtn = document.getElementById("play-cpu-btn");
const backToMenuBtn = document.getElementById("back-to-menu-btn");
const roomCodeInput = document.getElementById("room-code-input");
const errorMessageDiv = document.getElementById("error-message");
const roomCodeDisplayWrapper = document.getElementById(
  "room-code-display-wrapper"
);
const roomCodeDisplay = document.getElementById("room-code-display");
const resultDisplay = document.getElementById("result-display");
const gameModeDisplay = document.getElementById("game-mode-display");
const choiceBtns = document.querySelectorAll(".choice-btn");
const chatForm = document.getElementById("chat-input-form");
const chatInput = document.getElementById("chat-input");
const chatMessages = document.getElementById("chat-messages");
const avatarUploadInput = document.getElementById("avatar-upload-input");
const timerDisplay = document.getElementById("timer-display"); // Lấy phần tử đồng hồ

const playerElements = {
  p1: {
    card: document.getElementById("player1-card"),
    avatar: document.getElementById("p1-avatar"),
    name: document.getElementById("p1-name"),
    streak: document.getElementById("p1-streak"),
    choice: document.getElementById("p1-choice"),
    status: document.querySelector("#p1-choice .player-status"),
  },
  p2: {
    card: document.getElementById("player2-card"),
    avatar: document.getElementById("p2-avatar"),
    name: document.getElementById("p2-name"),
    streak: document.getElementById("p2-streak"),
    choice: document.getElementById("p2-choice"),
    status: document.querySelector("#p2-choice .player-status"),
  },
};
const sounds = {
  win: document.getElementById("sound-win"),
  lose: document.getElementById("sound-lose"),
  draw: document.getElementById("sound-draw"),
  chat: document.getElementById("sound-chat"),
  choice: document.getElementById("sound-choice"),
  background: document.getElementById("sound-background"),
};

let ws,
  localPlayerInfo = { name: "", avatar: "😀" },
  roomState = {},
  backgroundMusicStarted = false,
  gameMode = "online",
  customAvatarData = null;

// Hệ thống thống kê và thành tích
let gameStats = {
  wins: 0,
  losses: 0,
  draws: 0,
  totalGames: 0,
  winStreak: 0,
  bestWinStreak: 0,
  points: 0,
  level: 1,
};

let achievements = [
  {
    id: "first_win",
    name: "Chiến thắng đầu tiên",
    icon: "🎉",
    unlocked: false,
    description: "Thắng ván đầu tiên",
  },
  {
    id: "win_streak_5",
    name: "Chuỗi thắng 5",
    icon: "🔥",
    unlocked: false,
    description: "Thắng liên tiếp 5 ván",
  },
  {
    id: "win_streak_10",
    name: "Chuỗi thắng 10",
    icon: "💥",
    unlocked: false,
    description: "Thắng liên tiếp 10 ván",
  },
  {
    id: "play_50",
    name: "Người chơi chuyên nghiệp",
    icon: "🏆",
    unlocked: false,
    description: "Chơi 50 ván",
  },
  {
    id: "play_100",
    name: "Bậc thầy",
    icon: "👑",
    unlocked: false,
    description: "Chơi 100 ván",
  },
  {
    id: "perfect_win",
    name: "Chiến thắng hoàn hảo",
    icon: "⭐",
    unlocked: false,
    description: "Thắng 10 ván liên tiếp không thua",
  },
];

let powerups = {
  "double-points": { cost: 100, active: false, duration: 0 },
  "extra-time": { cost: 50, active: false, duration: 0 },
  hint: { cost: 75, active: false, duration: 0 },
};

// Hệ thống chế độ chơi
let gameModes = {
  classic: {
    name: "Cổ điển",
    timer: 30,
    description: "Kéo Búa Bao truyền thống",
  },
  speed: { name: "Tốc độ", timer: 5, description: "5 giây mỗi lượt" },
};

let currentGameMode = "classic";
let currentTheme = "neon";

let afkCountdownInterval = null; // Biến cho interval
let roundStartTime = null; // Thời gian bắt đầu vòng từ server
let roundTimerDuration = 30; // Thời gian countdown từ server

function startAfkCountdown() {
  stopAfkCountdown(); // Dừng timer cũ trước khi bắt đầu timer mới

  // Lấy thông tin timer từ server nếu có (để đồng bộ) - chỉ cho online mode
  if (
    gameMode === "online" &&
    roomState.round_start_time &&
    roomState.round_timer_duration
  ) {
    roundStartTime = roomState.round_start_time;
    roundTimerDuration = roomState.round_timer_duration;
  } else {
    // Fallback: dùng game mode - cho cả CPU và online mode
    roundStartTime = Date.now() / 1000; // Chuyển từ milliseconds sang seconds
    roundTimerDuration = gameModes[currentGameMode].timer;
  }

  // Hàm tính toán và cập nhật timer
  function updateTimer() {
    if (!roundStartTime) return;

    const currentTime = Date.now() / 1000; // Thời gian hiện tại (seconds)
    const elapsed = currentTime - roundStartTime; // Thời gian đã trôi qua
    const timeLeft = Math.max(0, Math.ceil(roundTimerDuration - elapsed)); // Làm tròn lên và đảm bảo >= 0

    timerDisplay.textContent = timeLeft;
    timerDisplay.classList.add("visible");

    // Chế độ Tốc độ: Tự động chọn khi hết giờ
    if (timeLeft <= 0) {
      stopAfkCountdown();

      if (currentGameMode === "speed") {
        // Chế độ online
        if (gameMode === "online" && roomState.game_state === "playing") {
          // Kiểm tra xem người chơi đã chọn chưa
          const me = roomState.players?.find(
            (p) => p.name === localPlayerInfo.name
          );
          if (
            me &&
            (!roomState.player_made_choice ||
              roomState.player_made_choice !== localPlayerInfo.name)
          ) {
            // Tự động chọn ngẫu nhiên
            const choices = ["rock", "paper", "scissors"];
            const randomChoice =
              choices[Math.floor(Math.random() * choices.length)];

            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(createMessage("player_choice", { choice: randomChoice }));
              resultDisplay.textContent = "Tự động chọn! (Hết giờ)";
              playerElements.p1.status.textContent = "✓";
              playerElements.p1.status.classList.add("chosen");
            }
          }
        }
        // Chế độ CPU - tự động chọn cho người chơi
        else if (gameMode === "cpu") {
          enableChoiceButtons(false);
          const choices = ["rock", "paper", "scissors"];
          const randomChoice =
            choices[Math.floor(Math.random() * choices.length)];
          handleCPUGame(randomChoice);
        }
      }
    }
  }

  // Cập nhật ngay lập tức
  updateTimer();

  // Cập nhật mỗi 100ms để đồng bộ tốt hơn
  afkCountdownInterval = setInterval(updateTimer, 100);
}
function stopAfkCountdown() {
  if (afkCountdownInterval) {
    clearInterval(afkCountdownInterval);
  }
  timerDisplay.classList.remove("visible");
}

function enableChoiceButtons(enabled) {
  choiceBtns.forEach((btn) => (btn.disabled = !enabled));
}

choiceBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    playSound("choice");
    const choice = btn.dataset.choice;
    enableChoiceButtons(false);
    stopAfkCountdown(); // Dừng timer khi đã chọn

    if (gameMode === "online") {
      ws.send(createMessage("player_choice", { choice }));
      resultDisplay.textContent = "Đã chọn! Chờ đối thủ...";
      playerElements.p1.status.textContent = "✓";
      playerElements.p1.status.classList.add("chosen");
    } else {
      // CPU mode
      resultDisplay.textContent = "Máy đang chọn...";
      setTimeout(() => handleCPUGame(choice), 500);
    }
  });
});

function showScreen(screenName) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[screenName].classList.add("active");
}
function displayError(message) {
  errorMessageDiv.textContent = message;
  setTimeout(() => (errorMessageDiv.textContent = ""), 3000);
}

// ===== HỆ THỐNG THỐNG KÊ VÀ THÀNH TÍCH =====
function updateStats() {
  document.getElementById("wins-count").textContent = gameStats.wins;
  document.getElementById("losses-count").textContent = gameStats.losses;
  document.getElementById("draws-count").textContent = gameStats.draws;

  const winRate =
    gameStats.totalGames > 0
      ? Math.round((gameStats.wins / gameStats.totalGames) * 100)
      : 0;
  document.getElementById("win-rate").textContent = winRate + "%";

  // Cập nhật điểm số
  updatePointsDisplay();
}

function updatePointsDisplay() {
  // Hiển thị điểm số ở đâu đó (có thể thêm vào header)
  const pointsDisplay = document.getElementById("points-display");
  if (pointsDisplay) {
    pointsDisplay.textContent = `💰 ${gameStats.points}`;
  }
}

function addPoints(amount) {
  const multiplier = powerups["double-points"].active ? 2 : 1;
  gameStats.points += amount * multiplier;
  updatePointsDisplay();
}

function checkAchievements() {
  achievements.forEach((achievement) => {
    if (achievement.unlocked) return;

    let shouldUnlock = false;

    switch (achievement.id) {
      case "first_win":
        shouldUnlock = gameStats.wins >= 1;
        break;
      case "win_streak_5":
        shouldUnlock = gameStats.winStreak >= 5;
        break;
      case "win_streak_10":
        shouldUnlock = gameStats.winStreak >= 10;
        break;
      case "play_50":
        shouldUnlock = gameStats.totalGames >= 50;
        break;
      case "play_100":
        shouldUnlock = gameStats.totalGames >= 100;
        break;
      case "perfect_win":
        shouldUnlock = gameStats.bestWinStreak >= 10;
        break;
    }

    if (shouldUnlock) {
      unlockAchievement(achievement);
    }
  });
}

function unlockAchievement(achievement) {
  achievement.unlocked = true;
  showAchievementNotification(achievement);
  playSound("achievement");
  renderAchievements();
}

function showAchievementNotification(achievement) {
  const notification = document.createElement("div");
  notification.className = "achievement-notification";
  notification.innerHTML = `
      <div class="achievement-popup">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-text">
          <h4>Thành tích mới!</h4>
          <p>${achievement.name}</p>
        </div>
      </div>
    `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("show");
  }, 100);

  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

function renderAchievements() {
  const container = document.getElementById("achievements-grid");
  container.innerHTML = "";

  achievements.forEach((achievement) => {
    const item = document.createElement("div");
    item.className = `achievement-item ${
      achievement.unlocked ? "unlocked" : "locked"
    }`;
    item.innerHTML = `
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-name">${achievement.name}</div>
      `;
    item.title = achievement.description;
    container.appendChild(item);
  });
}

// ===== HỆ THỐNG POWER-UPS =====
function updatePowerups() {
  Object.keys(powerups).forEach((powerupId) => {
    const btn = document.querySelector(`[data-powerup="${powerupId}"]`);
    const powerup = powerups[powerupId];

    if (btn) {
      btn.disabled = gameStats.points < powerup.cost || powerup.active;
      btn.classList.toggle("active", powerup.active);
    }
  });
}

function usePowerup(powerupId) {
  const powerup = powerups[powerupId];
  if (!powerup || powerup.active || gameStats.points < powerup.cost) return;

  gameStats.points -= powerup.cost;
  powerup.active = true;
  powerup.duration = 10; // 10 giây

  playSound("powerup");
  updatePowerups();
  updatePointsDisplay();

  // Hiệu ứng visual
  showPowerupEffect(powerupId);

  // Tự động tắt sau duration
  setTimeout(() => {
    powerup.active = false;
    powerup.duration = 0;
    updatePowerups();
  }, powerup.duration * 1000);
}

function showPowerupEffect(powerupId) {
  const effects = {
    "double-points": "💎 Điểm x2 kích hoạt!",
    "extra-time": "⏰ +5 giây!",
    hint: "💡 Gợi ý: Chọn ngẫu nhiên!",
  };

  const message = effects[powerupId];
  if (message) {
    displayChatMessage({
      sender_name: "Hệ thống",
      sender_avatar: "system",
      text: message,
    });
  }
}

function playSound(soundId) {
  const sound = document.getElementById(`sound-${soundId}`);
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch((e) => console.log("Lỗi phát âm thanh:", e));
  }
}
function getPlayerInfoFromDOM() {
  const name = playerNameInput.value.trim();
  if (!name) {
    displayError("Vui lòng nhập tên của bạn.");
    return null;
  }
  const selectedAvatarEl = document.querySelector(".selected");
  if (!selectedAvatarEl) {
    displayError("Vui lòng chọn avatar.");
    return null;
  }
  if (selectedAvatarEl.id === "custom-avatar-preview" && customAvatarData) {
    return { name, avatar: customAvatarData };
  }
  const avatar =
    selectedAvatarEl.dataset.avatar || selectedAvatarEl.textContent || "😀";
  return { name, avatar };
}

function createMessage(type, payload) {
  return JSON.stringify({ type, payload });
}

function playBackgroundMusic() {
  if (!backgroundMusicStarted) {
    if (sounds.background) {
      sounds.background.volume = 0.1;
      sounds.background
        .play()
        .catch((e) => console.log("Lỗi khi phát nhạc nền:", e));
    }
    backgroundMusicStarted = true;
  }
}

function connectWebSocket(onOpenCallback) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      onOpenCallback();
      return;
    }

    // Đóng kết nối cũ nếu có
    if (
      ws &&
      (ws.readyState === WebSocket.CLOSING ||
        ws.readyState === WebSocket.CLOSED)
    ) {
      ws = null;
    }

    const serverUrl = `ws://localhost:8080`;
    let connectionOpened = false; // Đánh dấu xem đã kết nối thành công chưa

    ws = new WebSocket(serverUrl);

    // Timeout nếu không kết nối được sau 5 giây
    const timeout = setTimeout(() => {
      if (!connectionOpened && ws && ws.readyState !== WebSocket.OPEN) {
        ws.close();
        if (gameMode === "online") {
          displayError(
            "Không thể kết nối đến server. Vui lòng:\n1. Kiểm tra server có đang chạy không\n2. Chạy file start_game.bat hoặc python server/run_server.py"
          );
        }
      }
    }, 5000);

    ws.onopen = () => {
      console.log("✅ Connected to server");
      connectionOpened = true;
      clearTimeout(timeout);
      if (onOpenCallback) {
        onOpenCallback();
      }
    };

    ws.onclose = (event) => {
      console.log("❌ Disconnected from server", event.code);
      clearTimeout(timeout);
      // Chỉ hiển thị "Mất kết nối" nếu đã kết nối thành công trước đó
      if (connectionOpened && gameMode === "online") {
        displayError("Mất kết nối với máy chủ.");
        showScreen("home");
      }
    };

    ws.onerror = (error) => {
      console.error("❌ WebSocket Error:", error);
      clearTimeout(timeout);
      // Không hiển thị lỗi ở đây vì onclose sẽ được gọi sau
      // và sẽ hiển thị lỗi phù hợp hơn
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (e) {
        console.error("Lỗi parse message:", e);
      }
    };
  } catch (error) {
    console.error("Lỗi khi tạo WebSocket:", error);
    displayError(
      "Không thể tạo kết nối WebSocket. Vui lòng kiểm tra server có đang chạy không."
    );
  }
}

function handleServerMessage({ type, payload }) {
  if (gameMode !== "online") return;
  switch (type) {
    case "room_created":
      roomCodeDisplay.textContent = payload.room_code;
      // Đồng bộ game_mode từ server khi tạo phòng
      if (payload.game_mode && gameModes[payload.game_mode]) {
        currentGameMode = payload.game_mode;
        updateGameModeDisplay();
      }
      showScreen("game");
      break;
    case "join_success":
    case "player_joined":
    case "player_left":
    case "game_start":
      roomState = payload;

      // Đồng bộ game_mode từ server (người vào sau phải dùng game_mode của phòng)
      if (payload.game_mode && gameModes[payload.game_mode]) {
        currentGameMode = payload.game_mode;
        // Cập nhật UI để hiển thị game mode đúng
        document.querySelectorAll(".mode-btn").forEach((btn) => {
          btn.classList.remove("active");
        });
        const activeModeBtn = document.querySelector(
          `[data-mode="${currentGameMode}"]`
        );
        if (activeModeBtn) {
          activeModeBtn.classList.add("active");
        }
        updateGameModeDisplay();
      }

      updateUI();
      showScreen("game");
      // Cập nhật thông tin timer từ server để đồng bộ
      if (payload.round_start_time && payload.round_timer_duration) {
        roundStartTime = payload.round_start_time;
        roundTimerDuration = payload.round_timer_duration;
      }
      if (roomState.game_state === "playing") {
        startAfkCountdown();
      }
      break;
    case "game_update":
      roomState = payload;

      // Đồng bộ game_mode từ server
      if (payload.game_mode && gameModes[payload.game_mode]) {
        currentGameMode = payload.game_mode;
        // Cập nhật UI để hiển thị game mode đúng
        document.querySelectorAll(".mode-btn").forEach((btn) => {
          btn.classList.remove("active");
        });
        const activeModeBtn = document.querySelector(
          `[data-mode="${currentGameMode}"]`
        );
        if (activeModeBtn) {
          activeModeBtn.classList.add("active");
        }
        updateGameModeDisplay();
      }

      updateUI();
      showScreen("game");

      if (roomState.game_state === "playing") {
        // Cập nhật thông tin timer từ server để đồng bộ
        if (payload.round_start_time && payload.round_timer_duration) {
          roundStartTime = payload.round_start_time;
          roundTimerDuration = payload.round_timer_duration;
        }
        startAfkCountdown();
      } else {
        stopAfkCountdown();
      }
      break;
    case "round_result":
      roomState.game_state = "result";
      stopAfkCountdown();
      displayRoundResult(payload);
      break;
    case "chat_broadcast":
      displayChatMessage(payload);
      break;
    case "error":
      displayError(payload.message);
      break;
  }
}

if (createRoomBtn) {
  createRoomBtn.addEventListener("click", () => {
    try {
      gameMode = "online";
      playBackgroundMusic();
      const info = getPlayerInfoFromDOM();
      if (info) {
        // Lưu stats của người chơi cũ nếu có
        if (
          localPlayerInfo &&
          localPlayerInfo.name &&
          localPlayerInfo.name !== info.name
        ) {
          saveGameData();
        }
        localPlayerInfo = info;
        // Load thống kê của người chơi này
        loadPlayerStats(localPlayerInfo.name);
        if (roomCodeDisplayWrapper) {
          roomCodeDisplayWrapper.style.visibility = "visible";
        }
        connectWebSocket(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(
                createMessage("create_room", {
                  ...localPlayerInfo,
                  game_mode: currentGameMode,
                })
              );
            } catch (err) {
              console.error("Lỗi khi gửi tin nhắn:", err);
              displayError("Không thể gửi yêu cầu tạo phòng.");
            }
          } else {
            displayError(
              "Chưa kết nối đến server. Vui lòng kiểm tra server có đang chạy không."
            );
          }
        });
      }
    } catch (error) {
      console.error("Lỗi khi tạo phòng:", error);
      displayError("Có lỗi xảy ra. Vui lòng thử lại.");
    }
  });
} else {
  console.error("Không tìm thấy nút create-room-btn!");
}

joinRoomBtn.addEventListener("click", () => {
  gameMode = "online";
  playBackgroundMusic();
  const info = getPlayerInfoFromDOM();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    displayError("Vui lòng nhập mã phòng.");
    return;
  }
  if (info) {
    // Lưu stats của người chơi cũ nếu có
    if (
      localPlayerInfo &&
      localPlayerInfo.name &&
      localPlayerInfo.name !== info.name
    ) {
      saveGameData();
    }
    localPlayerInfo = info;
    // Load thống kê của người chơi này
    loadPlayerStats(localPlayerInfo.name);
    roomCodeDisplayWrapper.style.visibility = "visible";
    connectWebSocket(() =>
      ws.send(
        createMessage("join_room", {
          ...localPlayerInfo,
          room_code: code,
          game_mode: currentGameMode,
        })
      )
    );
  }
});
function updateUI() {
  if (gameMode === "cpu") return;
  if (!roomState || !roomState.players) return;
  roomCodeDisplay.textContent = roomState.room_code;
  const me = roomState.players.find((p) => p.name === localPlayerInfo.name);
  const opponent = roomState.players.find(
    (p) => p.name !== localPlayerInfo.name
  );

  updatePlayerCard(playerElements.p1, me, "Bạn");
  updatePlayerCard(playerElements.p2, opponent, "Đang chờ đối thủ...");

  document
    .querySelector(".chat-container")
    .classList.toggle("hidden", !opponent);
  [playerElements.p1, playerElements.p2].forEach((p) => {
    p.status.textContent = "";
    p.status.classList.remove("chosen");
    p.choice.style.fontSize = "2rem";
  });

  if (roomState.game_state === "playing") {
    resultDisplay.textContent = "Hãy đưa ra lựa chọn!";
    enableChoiceButtons(true);
    if (roomState.player_made_choice) {
      const chosenPlayerKey =
        roomState.player_made_choice === localPlayerInfo.name ? "p1" : "p2";
      playerElements[chosenPlayerKey].status.textContent = "✓";
      playerElements[chosenPlayerKey].status.classList.add("chosen");
    }
  } else {
    enableChoiceButtons(false);
    resultDisplay.textContent =
      roomState.game_state === "waiting"
        ? "Đang chờ người chơi thứ 2..."
        : resultDisplay.textContent;
  }
}

function updatePlayerCard(elements, player, defaultName) {
  if (player) {
    if (player.avatar.startsWith("data:image")) {
      elements.avatar.innerHTML = `<img src="${player.avatar}" alt="${player.name}">`;
    } else if (player.avatar.includes(".")) {
      elements.avatar.innerHTML = `<img src="assets/images/avatars/${player.avatar}" alt="${player.name}">`;
    } else {
      elements.avatar.innerHTML = player.avatar;
    }
    elements.name.textContent = player.name;
    elements.streak.textContent =
      player.win_streak > 1 ? `🔥 Chuỗi thắng x${player.win_streak}` : "";
  } else {
    elements.avatar.innerHTML = "?";
    elements.name.textContent = defaultName;
    elements.streak.textContent = "";
  }
}

function displayRoundResult({ winner_name, choices, result: outcome }) {
  enableChoiceButtons(false);
  const me = roomState.players.find((p) => p.name === localPlayerInfo.name);
  const opponent = roomState.players.find(
    (p) => p.name !== localPlayerInfo.name
  );
  const choiceMap = { rock: "✊", paper: "✋", scissors: "✌️" };

  playerElements.p1.status.textContent = choiceMap[choices[me.name]];
  playerElements.p1.choice.style.fontSize = "4rem";
  if (opponent) {
    playerElements.p2.status.textContent = choiceMap[choices[opponent.name]];
    playerElements.p2.choice.style.fontSize = "4rem";
  }

  // Cập nhật thống kê
  gameStats.totalGames++;

  if (outcome === "draw") {
    resultDisplay.textContent = "Hòa!";
    gameStats.draws++;
    addPoints(10); // Điểm cho hòa
    playSound("draw");
  } else if (winner_name === localPlayerInfo.name) {
    resultDisplay.textContent = "Bạn thắng!";
    gameStats.wins++;
    gameStats.winStreak++;
    if (gameStats.winStreak > gameStats.bestWinStreak) {
      gameStats.bestWinStreak = gameStats.winStreak;
    }
    addPoints(50); // Điểm cho thắng
    playSound("win");
  } else {
    resultDisplay.textContent = "Bạn thua!";
    gameStats.losses++;
    gameStats.winStreak = 0;
    addPoints(5); // Điểm cho thua
    playSound("lose");
  }

  // Cập nhật UI
  updateStats();
  checkAchievements();
  updatePowerups();
}

function startGameVsCPU() {
  gameMode = "cpu";
  const info = getPlayerInfoFromDOM();
  if (!info) return;

  // Lưu stats của người chơi cũ nếu có
  if (
    localPlayerInfo &&
    localPlayerInfo.name &&
    localPlayerInfo.name !== info.name
  ) {
    saveGameData();
  }

  localPlayerInfo = info;
  // Load thống kê của người chơi này
  loadPlayerStats(localPlayerInfo.name);

  playBackgroundMusic();
  showScreen("game");
  roomCodeDisplayWrapper.style.visibility = "hidden";
  document.querySelector(".chat-container").classList.add("hidden");

  updatePlayerCard(playerElements.p1, localPlayerInfo, "Bạn");
  updatePlayerCard(
    playerElements.p2,
    { name: "Máy", avatar: "🤖", win_streak: 0 },
    "Máy"
  );

  // Reset trạng thái
  [playerElements.p1, playerElements.p2].forEach((p) => {
    p.status.textContent = "";
    p.choice.style.fontSize = "2rem";
  });

  resultDisplay.textContent = "Bắt đầu!";
  enableChoiceButtons(true);

  // Cập nhật hiển thị game mode
  updateGameModeDisplay();

  // Bắt đầu timer cho CPU mode
  startAfkCountdown();
}

function handleCPUGame(playerChoice) {
  const choices = ["rock", "paper", "scissors"];
  const cpuChoice = choices[Math.floor(Math.random() * choices.length)];
  const choiceMap = { rock: "✊", paper: "✋", scissors: "✌️" };

  playerElements.p1.status.textContent = choiceMap[playerChoice];
  playerElements.p1.choice.style.fontSize = "4rem";
  playerElements.p2.status.textContent = choiceMap[cpuChoice];
  playerElements.p2.choice.style.fontSize = "4rem";

  // Cập nhật thống kê/điểm giống online
  gameStats.totalGames++;
  let outcome;
  if (playerChoice === cpuChoice) {
    outcome = "draw";
    resultDisplay.textContent = "Hòa!";
    gameStats.draws++;
    addPoints(10);
    playSound("draw");
  } else if (
    (playerChoice === "rock" && cpuChoice === "scissors") ||
    (playerChoice === "scissors" && cpuChoice === "paper") ||
    (playerChoice === "paper" && cpuChoice === "rock")
  ) {
    outcome = "win";
    resultDisplay.textContent = "Bạn thắng!";
    gameStats.wins++;
    gameStats.winStreak++;
    if (gameStats.winStreak > gameStats.bestWinStreak) {
      gameStats.bestWinStreak = gameStats.winStreak;
    }
    addPoints(50);
    playSound("win");
  } else {
    outcome = "lose";
    resultDisplay.textContent = "Bạn thua!";
    gameStats.losses++;
    gameStats.winStreak = 0;
    addPoints(5);
    playSound("lose");
  }

  updateStats();
  checkAchievements();
  updatePowerups();

  setTimeout(() => {
    [playerElements.p1, playerElements.p2].forEach((p) => {
      p.status.textContent = "";
      p.choice.style.fontSize = "2rem";
    });

    // Hiển thị thông báo theo chế độ chơi
    if (currentGameMode === "speed") {
      resultDisplay.textContent = "Chuẩn bị!";
    } else {
      resultDisplay.textContent = "Chơi tiếp nào!";
    }

    enableChoiceButtons(true);

    // Bắt đầu timer mới cho vòng tiếp theo (chỉ nếu vẫn ở CPU mode)
    if (gameMode === "cpu") {
      startAfkCountdown();
    }
  }, 2000);
}

playCpuBtn.addEventListener("click", startGameVsCPU);
// ===== HÀM HIỂN THỊ CHAT ĐÃ ĐƯỢC CẬP NHẬT =====
function displayChatMessage({ sender_name, sender_avatar, text }) {
  const messageEl = document.createElement("div");
  const sanitizedText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Nếu là tin nhắn hệ thống
  if (sender_name === "Hệ thống") {
    messageEl.classList.add("system-message");
    messageEl.textContent = sanitizedText;
  }
  // Nếu là tin nhắn người chơi
  else {
    messageEl.classList.add("chat-message");
    let avatarHTML = "";
    if (sender_avatar.startsWith("data:image")) {
      avatarHTML = `<img class="chat-avatar" src="${sender_avatar}" alt="${sender_name}">`;
    } else if (sender_avatar.includes(".")) {
      avatarHTML = `<img class="chat-avatar" src="assets/images/avatars/${sender_avatar}" alt="${sender_name}">`;
    } else {
      avatarHTML = `<span class="chat-avatar">${sender_avatar}</span>`;
    }
    messageEl.innerHTML = `${avatarHTML}<div><span class="chat-sender">${sender_name}:</span> <span class="chat-text">${sanitizedText}</span></div>`;
  }

  chatMessages.prepend(messageEl);

  // Phát âm thanh cho tin nhắn của người khác và tin nhắn hệ thống
  if (sender_name !== localPlayerInfo.name) {
    playSound("chat");
  }
}

document.querySelector(".player-info").addEventListener("click", (e) => {
  if (
    e.target.classList.contains("avatar") ||
    e.target.classList.contains("avatar-image")
  ) {
    const currentSelected = document.querySelector(".selected");
    if (currentSelected) {
      currentSelected.classList.remove("selected");
    }
    e.target.classList.add("selected");
  }
});

avatarUploadInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file && file.type.startsWith("image/")) {
    const reader = new FileReader();

    reader.onload = (e) => {
      customAvatarData = e.target.result;

      let preview = document.getElementById("custom-avatar-preview");
      if (!preview) {
        preview = document.createElement("img");
        preview.id = "custom-avatar-preview";
        preview.classList.add("avatar-image");
        document.querySelector(".image-avatar-selector").appendChild(preview);
      }
      preview.src = customAvatarData;

      const currentSelected = document.querySelector(".selected");
      if (currentSelected) currentSelected.classList.remove("selected");
      preview.classList.add("selected");
    };

    reader.readAsDataURL(file);
  }
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (text) {
    ws.send(createMessage("chat_message", { text }));
    chatInput.value = "";
  }
});

roomCodeDisplay.addEventListener("click", () => {
  navigator.clipboard
    .writeText(roomCodeDisplay.textContent)
    .then(() => alert("Đã sao chép mã phòng!"));
});

backToMenuBtn.addEventListener("click", () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  stopAfkCountdown(); // Dừng timer khi quay về menu
  showScreen("home");
  roomState = {};
  localPlayerInfo = getPlayerInfoFromDOM() || { name: "", avatar: "😀" };
});
// ===== EVENT LISTENERS CHO POWER-UPS =====
document.addEventListener("click", (e) => {
  if (e.target.closest(".powerup-btn")) {
    const btn = e.target.closest(".powerup-btn");
    const powerupId = btn.dataset.powerup;
    if (powerupId && !btn.disabled) {
      usePowerup(powerupId);
    }
  }
});

// ===== KHỞI TẠO HỆ THỐNG =====
function initializeGame() {
  // Load theme đã lưu
  const savedTheme = localStorage.getItem("selectedTheme");
  if (savedTheme && ["neon", "ocean", "fire", "forest"].includes(savedTheme)) {
    setTheme(savedTheme);
  } else {
    setTheme("neon"); // Default theme
  }

  // Load game mode đã lưu
  const savedGameMode = localStorage.getItem("selectedGameMode");
  if (
    savedGameMode &&
    gameModes[savedGameMode] &&
    savedGameMode !== "tournament"
  ) {
    setGameMode(savedGameMode);
  }

  // Khởi tạo UI với stats mặc định (chưa có tên)
  updateStats();
  renderAchievements();
  updatePowerups();

  // Load thống kê nếu đã có tên trong input
  const currentName = playerNameInput.value.trim();
  if (currentName) {
    loadPlayerStats(currentName);
  }

  // Lắng nghe thay đổi tên để tự động load stats
  playerNameInput.addEventListener("change", () => {
    const name = playerNameInput.value.trim();
    if (name && localPlayerInfo && localPlayerInfo.name !== name) {
      // Lưu stats của người chơi cũ trước
      if (localPlayerInfo.name) {
        saveGameData();
      }
      // Load stats của người chơi mới
      localPlayerInfo.name = name;
      loadPlayerStats(name);
    }
  });

  // Lắng nghe blur (khi rời khỏi ô input) để load stats
  playerNameInput.addEventListener("blur", () => {
    const name = playerNameInput.value.trim();
    if (name) {
      if (localPlayerInfo.name && localPlayerInfo.name !== name) {
        // Lưu stats của người chơi cũ
        saveGameData();
      }
      localPlayerInfo.name = name;
      loadPlayerStats(name);
    }
  });
}

// Lưu dữ liệu vào localStorage theo tên người chơi
function saveGameData() {
  if (localPlayerInfo && localPlayerInfo.name) {
    const playerName = localPlayerInfo.name.trim();
    if (playerName) {
      localStorage.setItem(
        `gameStats_${playerName}`,
        JSON.stringify(gameStats)
      );
      localStorage.setItem(
        `achievements_${playerName}`,
        JSON.stringify(achievements)
      );
    }
  }
}

// Load thống kê theo tên người chơi
function loadPlayerStats(playerName) {
  if (!playerName || !playerName.trim()) return;

  const playerKey = playerName.trim();

  // Reset về mặc định
  gameStats = {
    wins: 0,
    losses: 0,
    draws: 0,
    totalGames: 0,
    winStreak: 0,
    bestWinStreak: 0,
    points: 0,
    level: 1,
  };

  achievements = [
    {
      id: "first_win",
      name: "Chiến thắng đầu tiên",
      icon: "🎉",
      unlocked: false,
      description: "Thắng ván đầu tiên",
    },
    {
      id: "win_streak_5",
      name: "Chuỗi thắng 5",
      icon: "🔥",
      unlocked: false,
      description: "Thắng liên tiếp 5 ván",
    },
    {
      id: "win_streak_10",
      name: "Chuỗi thắng 10",
      icon: "💥",
      unlocked: false,
      description: "Thắng liên tiếp 10 ván",
    },
    {
      id: "play_50",
      name: "Người chơi chuyên nghiệp",
      icon: "🏆",
      unlocked: false,
      description: "Chơi 50 ván",
    },
    {
      id: "play_100",
      name: "Bậc thầy",
      icon: "👑",
      unlocked: false,
      description: "Chơi 100 ván",
    },
    {
      id: "perfect_win",
      name: "Chiến thắng hoàn hảo",
      icon: "⭐",
      unlocked: false,
      description: "Thắng 10 ván liên tiếp không thua",
    },
  ];

  // Load thống kê
  const savedStats = localStorage.getItem(`gameStats_${playerKey}`);
  if (savedStats) {
    try {
      const parsed = JSON.parse(savedStats);
      gameStats = { ...gameStats, ...parsed };
    } catch (e) {
      console.error("Lỗi khi load thống kê:", e);
    }
  }

  // Load thành tích
  const savedAchievements = localStorage.getItem(`achievements_${playerKey}`);
  if (savedAchievements) {
    try {
      const saved = JSON.parse(savedAchievements);
      achievements.forEach((achievement) => {
        const savedAchievement = saved.find((a) => a.id === achievement.id);
        if (savedAchievement) {
          achievement.unlocked = savedAchievement.unlocked;
        }
      });
    } catch (e) {
      console.error("Lỗi khi load thành tích:", e);
    }
  }

  // Cập nhật UI
  updateStats();
  renderAchievements();
  updatePowerups();
}

// Khởi tạo khi trang load
document.addEventListener("DOMContentLoaded", initializeGame);

// Lưu dữ liệu khi trang đóng
window.addEventListener("beforeunload", saveGameData);

// ===== HỆ THỐNG GAME MODES =====
function setGameMode(mode) {
  currentGameMode = mode;

  // Cập nhật UI
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-mode="${mode}"]`).classList.add("active");

  // Cập nhật hiển thị game mode trong game screen
  updateGameModeDisplay();

  // Hiệu ứng chuyển đổi
  playSound("choice");

  // Cập nhật mô tả
  const modeInfo = gameModes[mode];
  console.log(`Chế độ chơi: ${modeInfo.name} - ${modeInfo.description}`);
}

// Hàm cập nhật hiển thị game mode
function updateGameModeDisplay() {
  if (gameModeDisplay && gameModes[currentGameMode]) {
    const modeInfo = gameModes[currentGameMode];
    const icons = {
      classic: "⚔️",
      speed: "⚡",
    };
    gameModeDisplay.textContent = `${icons[currentGameMode] || "🎮"} ${
      modeInfo.name
    }`;
  }
}

// ===== HỆ THỐNG THEME =====
function setTheme(theme) {
  currentTheme = theme;

  // Xóa class theme cũ
  document.documentElement.classList.remove("neon", "ocean", "fire", "forest");

  // Thêm class theme mới
  document.documentElement.classList.add(theme);

  // Cập nhật UI
  document.querySelectorAll(".theme-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelector(`[data-theme="${theme}"]`).classList.add("active");

  // Hiệu ứng chuyển đổi
  playSound("special");

  // Lưu theme
  localStorage.setItem("selectedTheme", theme);
}

// ===== CHẾ ĐỘ CHƠI ĐẶC BIỆT =====
function handleSpecialGameMode() {
  switch (currentGameMode) {
    case "speed":
      // Chế độ tốc độ - thêm áp lực thời gian
      addSpeedModeEffects();
      break;
  }
}

function addSpeedModeEffects() {
  // Thay đổi màu timer
  timerDisplay.style.background = "#ff4500";
}

// ===== EVENT LISTENERS CHO GAME MODES VÀ THEMES =====
document.addEventListener("click", (e) => {
  // Game mode selection
  if (e.target.closest(".mode-btn")) {
    const btn = e.target.closest(".mode-btn");
    const mode = btn.dataset.mode;
    if (mode) {
      setGameMode(mode);
      handleSpecialGameMode();
    }
  }

  // Theme selection
  if (e.target.closest(".theme-btn")) {
    const btn = e.target.closest(".theme-btn");
    const theme = btn.dataset.theme;
    if (theme) {
      setTheme(theme);
    }
  }

  // Power-up selection
  if (e.target.closest(".powerup-btn")) {
    const btn = e.target.closest(".powerup-btn");
    const powerupId = btn.dataset.powerup;
    if (powerupId && !btn.disabled) {
      usePowerup(powerupId);
    }
  }
});
