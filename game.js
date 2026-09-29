/*
  BASEBALL MANAGER - 게임 코어
  ----------------------------------------
  이 파일 하나에 게임 로직을 모아두었습니다.

  서버 멀티플레이:
  - GitHub Pages는 정적 호스팅이므로 게임 서버를 직접 실행할 수 없습니다.
  - 아래 SERVER_CONFIG의 websocketUrl에 실제 WebSocket 서버 주소를 넣으면
    2인 친선경기 통신을 연결할 수 있도록 구조를 만들어 두었습니다.
*/

const SERVER_CONFIG = {
  websocketUrl: "", // 예: "wss://your-server.example.com"
  reconnect: true
};

const GRADE_DATA = {
  "C": { min: 45, max: 59, weight: 55 },
  "B": { min: 60, max: 69, weight: 30 },
  "A": { min: 70, max: 79, weight: 11 },
  "S": { min: 80, max: 89, weight: 3 },
  "SS": { min: 90, max: 99, weight: 1 }
};

const state = {
  user: {
    name: "PLAYER",
    coins: 10000,
    gems: 100,
    season: 1
  },
  players: [
    { id: 1, name: "김민수", pos: "CF", grade: "A", ovr: 76, level: 1, power: 78, contact: 74, speed: 72 },
    { id: 2, name: "이준호", pos: "SP", grade: "B", ovr: 67, level: 1, power: 61, contact: 50, speed: 55 },
    { id: 3, name: "박현우", pos: "SS", grade: "A", ovr: 73, level: 1, power: 70, contact: 76, speed: 75 },
    { id: 4, name: "최도윤", pos: "1B", grade: "C", ovr: 56, level: 1, power: 65, contact: 48, speed: 42 }
  ],
  league: {
    week: 1,
    wins: 0,
    losses: 0
  },
  derby: {
    pitches: 10,
    homers: 0,
    bestDistance: 0
  },
  recentGames: [],
  room: null,
  socket: null
};

const $ = (id) => document.getElementById(id);

function saveGame() {
  localStorage.setItem("baseball_manager_save", JSON.stringify(state));
}

function loadGame() {
  try {
    const raw = localStorage.getItem("baseball_manager_save");
    if (!raw) return;
    const loaded = JSON.parse(raw);
    Object.assign(state, loaded);
  } catch (e) {
    console.warn("저장 데이터 로드 실패", e);
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedGrade() {
  const entries = Object.entries(GRADE_DATA);
  const total = entries.reduce((s, [, d]) => s + d.weight, 0);
  let r = Math.random() * total;
  for (const [grade, data] of entries) {
    r -= data.weight;
    if (r <= 0) return grade;
  }
  return "C";
}

function randomPlayer() {
  const grade = weightedGrade();
  const d = GRADE_DATA[grade];
  const ovr = randomInt(d.min, d.max);
  const names = ["정우진", "한지훈", "윤서준", "강민재", "오세훈", "임재현", "송도현", "권지호"];
  const positions = ["SP", "RP", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
  return {
    id: Date.now() + Math.random(),
    name: names[randomInt(0, names.length - 1)],
    pos: positions[randomInt(0, positions.length - 1)],
    grade,
    ovr,
    level: 1,
    power: Math.max(40, ovr + randomInt(-7, 7)),
    contact: Math.max(40, ovr + randomInt(-7, 7)),
    speed: Math.max(40, ovr + randomInt(-7, 7))
  };
}

function teamOvr() {
  if (!state.players.length) return 0;
  return Math.round(state.players.reduce((s, p) => s + p.ovr, 0) / state.players.length);
}

function renderAll() {
  $("coin-value").textContent = state.user.coins.toLocaleString();
  $("gem-value").textContent = state.user.gems.toLocaleString();
  $("user-name").textContent = state.user.name;
  $("team-ovr").textContent = teamOvr();
  $("season-text").textContent = `${state.user.season} 시즌`;
  $("rank-text").textContent = `${Math.max(1, 8 - state.league.wins)}위`;

  renderPlayers();
  renderLeague();
  renderUpgrade();
  renderRecentGames();
}

function renderPlayers() {
  $("player-list").innerHTML = state.players.map(p => `
    <div class="player-card">
      <div>
        <strong>${escapeHtml(p.name)}</strong>
        <div>${p.pos} · Lv.${p.level}</div>
      </div>
      <span class="grade">${p.grade}</span>
      <strong>OVR ${p.ovr}</strong>
      <span>파워 ${p.power} / 컨택 ${p.contact} / 주력 ${p.speed}</span>
    </div>
  `).join("");
}

function renderUpgrade() {
  $("upgrade-list").innerHTML = state.players.map(p => `
    <div class="player-card">
      <div>
        <strong>${escapeHtml(p.name)}</strong>
        <div>${p.grade} · OVR ${p.ovr} · Lv.${p.level}</div>
      </div>
      <span>강화 비용 ${upgradeCost(p)}C</span>
      <button onclick="upgradePlayer(${JSON.stringify(p.id)})">강화</button>
    </div>
  `).join("");
}

function upgradeCost(player) {
  return 500 + player.level * 250;
}

window.upgradePlayer = function(id) {
  const p = state.players.find(x => String(x.id) === String(id));
  if (!p) return;
  const cost = upgradeCost(p);
  if (state.user.coins < cost) {
    alert("코인이 부족합니다.");
    return;
  }

  state.user.coins -= cost;
  const successRate = Math.max(0.35, 0.9 - p.level * 0.05);
  if (Math.random() < successRate) {
    p.level++;
    p.ovr++;
    p.power++;
    p.contact++;
    p.speed++;
    addLog(`${p.name} 강화 성공! Lv.${p.level}`);
  } else {
    addLog(`${p.name} 강화 실패. 다음 기회를 노려보세요.`);
  }
  saveGame();
  renderAll();
};

function renderLeague() {
  const teams = [
    ["나의 구단", teamOvr()],
    ["블루스", 69],
    ["타이탄즈", 66],
    ["파이어스", 63],
    ["스타즈", 61],
    ["샤크스", 59],
    ["라이온즈", 57],
    ["폭스", 54]
  ].sort((a,b) => b[1] - a[1]);

  $("league-table").innerHTML = teams.map((t, i) =>
    `<div>${i + 1}위 · ${t[0]} · OVR ${t[1]}</div>`
  ).join("");
}

function renderRecentGames() {
  $("recent-games").innerHTML = state.recentGames.length
    ? state.recentGames.slice(-5).reverse().map(x => `<div>${escapeHtml(x)}</div>`).join("")
    : "아직 경기가 없습니다.";
}

function addLog(message) {
  const box = $("match-log");
  if (box) {
    box.innerHTML += `<div>${escapeHtml(message)}</div>`;
    box.scrollTop = box.scrollHeight;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

/* -------------------------
   페이지 전환
------------------------- */
function showPage(page) {
  document.querySelectorAll(".page").forEach(x => x.classList.add("hidden"));
  $(`page-${page}`).classList.remove("hidden");
}

document.querySelectorAll("#main-nav button").forEach(btn => {
  btn.addEventListener("click", () => showPage(btn.dataset.page));
});

$("start-game-btn").addEventListener("click", () => {
  $("intro-screen").classList.add("hidden");
  $("game-screen").classList.remove("hidden");
  drawStadium();
});

/* -------------------------
   인트로 이미지
------------------------- */
$("intro-image").addEventListener("load", () => {
  $("intro-image").style.display = "block";
  $("intro-fallback").style.display = "none";
});

/* -------------------------
   싱글 리그
------------------------- */
$("play-league-btn").addEventListener("click", () => {
  const my = teamOvr();
  const enemy = randomInt(50, 75);
  const myRuns = Math.max(0, Math.round(3 + (my - enemy) / 10 + randomInt(-3, 3)));
  const enemyRuns = Math.max(0, Math.round(3 + (enemy - my) / 10 + randomInt(-3, 3)));

  if (myRuns > enemyRuns) {
    state.league.wins++;
    state.user.coins += 800;
    state.recentGames.push(`리그 승리 ${myRuns}-${enemyRuns} · +800C`);
  } else {
    state.league.losses++;
    state.user.coins += 250;
    state.recentGames.push(`리그 패배 ${myRuns}-${enemyRuns} · +250C`);
  }

  state.league.week++;
  if (state.league.week > 20) {
    state.user.season++;
    state.league.week = 1;
    state.league.wins = 0;
    state.league.losses = 0;
  }
  saveGame();
  renderAll();
});

/* -------------------------
   뽑기 시스템
------------------------- */
function drawOne() {
  const cost = 1000;
  if (state.user.coins < cost) {
    alert("코인이 부족합니다.");
    return null;
  }
  state.user.coins -= cost;
  const p = randomPlayer();
  state.players.push(p);
  return p;
}

$("draw-one-btn").addEventListener("click", () => {
  const p = drawOne();
  if (!p) return;
  $("draw-result").innerHTML = `획득! <b>${escapeHtml(p.name)}</b> · ${p.grade} · OVR ${p.ovr}`;
  saveGame();
  renderAll();
});

$("draw-ten-btn").addEventListener("click", () => {
  const cost = 10000;
  if (state.user.coins < cost) {
    alert("코인이 부족합니다.");
    return;
  }
  state.user.coins -= cost;
  const pulls = Array.from({length: 11}, () => randomPlayer());
  state.players.push(...pulls);
  $("draw-result").innerHTML = pulls.map(p =>
    `${escapeHtml(p.name)} · ${p.grade} · OVR ${p.ovr}`
  ).join("<br>");
  saveGame();
  renderAll();
});

/* -------------------------
   홈런더비
------------------------- */
function resetDerby() {
  state.derby = { pitches: 10, homers: 0, bestDistance: 0 };
  $("derby-pitches").textContent = 10;
  $("derby-homers").textContent = 0;
  $("derby-distance").textContent = "0m";
  $("derby-result").textContent = "";
}

$("derby-swing-btn").addEventListener("click", () => {
  if (state.derby.pitches <= 0) {
    $("derby-result").textContent = "홈런더비 종료!";
    return;
  }

  const hitter = [...state.players].sort((a,b) => b.power - a.power)[0];
  const power = hitter ? hitter.power : 60;
  const distance = randomInt(250, 390) + Math.round(power / 5);
  const homerChance = Math.min(0.85, 0.35 + power / 180);
  const isHomer = Math.random() < homerChance;

  state.derby.pitches--;
  if (isHomer) {
    state.derby.homers++;
    state.derby.bestDistance = Math.max(state.derby.bestDistance, distance);
    $("derby-result").textContent = `홈런! ${distance}m`;
  } else {
    $("derby-result").textContent = `아웃! ${randomInt(180, 290)}m`;
  }

  $("derby-pitches").textContent = state.derby.pitches;
  $("derby-homers").textContent = state.derby.homers;
  $("derby-distance").textContent = `${state.derby.bestDistance}m`;

  if (state.derby.pitches === 0) {
    state.user.coins += state.derby.homers * 150;
    $("derby-result").textContent += ` · 보상 ${state.derby.homers * 150}C`;
    saveGame();
    renderAll();
  }
});

/* -------------------------
   2D 야구장
------------------------- */
function drawStadium() {
  const canvas = $("stadium-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;

  ctx.clearRect(0,0,w,h);

  // 외야
  ctx.fillStyle = "#78a84c";
  ctx.fillRect(0,0,w,h);

  // 파울라인/내야
  ctx.save();
  ctx.translate(w/2, h-45);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#b99462";
  ctx.fillRect(-150,-150,300,300);
  ctx.restore();

  // 베이스
  const bases = [[w/2,h-45], [w/2+106,h-151], [w/2,h-257], [w/2-106,h-151]];
  ctx.fillStyle = "#fff";
  bases.forEach(([x,y]) => {
    ctx.beginPath();
    ctx.moveTo(x, y-8);
    ctx.lineTo(x+8, y);
    ctx.lineTo(x, y+8);
    ctx.lineTo(x-8, y);
    ctx.closePath();
    ctx.fill();
  });

  // 펜스
  ctx.strokeStyle = "#e9e9e9";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(w/2, h-45, 365, Math.PI, 2*Math.PI);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 22px Arial";
  ctx.fillText("2D STADIUM", 20, 35);
}

window.addEventListener("resize", drawStadium);

/* -------------------------
   서버형 친선경기
------------------------- */
function connectServer() {
  if (!SERVER_CONFIG.websocketUrl) {
    $("room-status").textContent =
      "서버 주소가 설정되지 않았습니다. 현재는 로컬 시뮬레이션 모드입니다.";
    return;
  }

  try {
    const ws = new WebSocket(SERVER_CONFIG.websocketUrl);
    state.socket = ws;

    ws.onopen = () => {
      $("room-status").textContent = "서버 연결 완료";
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch {
        addLog(event.data);
      }
    };

    ws.onclose = () => {
      $("room-status").textContent = "서버 연결 종료";
    };

    ws.onerror = () => {
      $("room-status").textContent = "서버 연결 오류";
    };
  } catch (e) {
    console.error(e);
  }
}

function sendServerMessage(message) {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(message));
  } else {
    // 서버가 없을 때도 UI 테스트 가능
    simulateLocalMatch(message);
  }
}

function handleServerMessage(message) {
  if (message.type === "room_created") {
    state.room = message.roomCode;
    $("room-code-input").value = message.roomCode;
    $("room-status").textContent = `방 생성 완료: ${message.roomCode}`;
  }
  if (message.type === "room_joined") {
    state.room = message.roomCode;
    $("room-status").textContent = `방 참가 완료: ${message.roomCode}`;
    $("match-controls").classList.remove("hidden");
  }
  if (message.type === "match_event") {
    addLog(message.text);
  }
  if (message.type === "match_start") {
    $("match-controls").classList.remove("hidden");
  }
}

$("create-room-btn").addEventListener("click", () => {
  const code = Math.random().toString(36).slice(2, 7).toUpperCase();
  sendServerMessage({ type: "create_room", roomCode: code });
  if (!state.socket) {
    state.room = code;
    $("room-code-input").value = code;
    $("room-status").textContent = `로컬 테스트 방 생성: ${code}`;
    $("match-controls").classList.remove("hidden");
  }
});

$("join-room-btn").addEventListener("click", () => {
  const code = $("room-code-input").value.trim().toUpperCase();
  if (!code) return alert("방 코드를 입력하세요.");
  sendServerMessage({ type: "join_room", roomCode: code });
  if (!state.socket) {
    state.room = code;
    $("room-status").textContent = `로컬 테스트 방 참가: ${code}`;
    $("match-controls").classList.remove("hidden");
  }
});

document.querySelectorAll("#match-controls button").forEach(btn => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    sendServerMessage({
      type: "match_action",
      roomCode: state.room,
      action
    });
  });
});

function simulateLocalMatch(message) {
  const actionText = {
    pitch: "투수가 빠른 공을 던졌습니다.",
    swing: "타자가 스윙했습니다!",
    steal: "주자가 도루를 시도합니다!"
  };
  addLog(actionText[message.action] || "플레이");
}

/* -------------------------
   시작
------------------------- */
loadGame();
renderAll();
connectServer();
resetDerby();
drawStadium();
