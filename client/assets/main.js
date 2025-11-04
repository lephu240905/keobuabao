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
  