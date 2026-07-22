(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    score: document.getElementById("scoreValue"),
    best: document.getElementById("bestValue"),
    orbs: document.getElementById("orbValue"),
    level: document.getElementById("levelValue"),
    finalScore: document.getElementById("finalScore"),
    resultMessage: document.getElementById("resultMessage"),
    startOverlay: document.getElementById("startOverlay"),
    pauseOverlay: document.getElementById("pauseOverlay"),
    gameOverOverlay: document.getElementById("gameOverOverlay"),
    startButton: document.getElementById("startButton"),
    restartButton: document.getElementById("restartButton"),
    resumeButton: document.getElementById("resumeButton"),
    pauseButton: document.getElementById("pauseButton"),
    soundButton: document.getElementById("soundButton"),
    moveLeftButton: document.getElementById("moveLeftButton"),
    moveRightButton: document.getElementById("moveRightButton")
  };

  const state = {
    running: false,
    paused: false,
    gameOver: false,
    soundEnabled: true,
    score: 0,
    orbs: 0,
    level: 1,
    speed: 330,
    distance: 0,
    spawnTimer: 0,
    pickupTimer: 0,
    shake: 0,
    lastTime: 0,
    best: Number.parseInt(localStorage.getItem("gamebosh-neon-dash-best") || "0", 10)
  };

  const world = {
    width: 960,
    height: 540,
    horizonY: 100,
    roadTopWidth: 190,
    roadBottomWidth: 760,
    roadBottomY: 540,
    laneCount: 3,
    stars: [],
    objects: [],
    particles: []
  };

  const player = {
    lane: 1,
    targetLane: 1,
    x: 480,
    y: 440,
    width: 62,
    height: 74,
    shield: 0,
    tilt: 0
  };

  let audioContext = null;

  function initAudio() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext?.state === "suspended") audioContext.resume();
  }

  function tone(frequency, duration = 0.08, type = "sine", volume = 0.045) {
    if (!state.soundEnabled) return;
    initAudio();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = world.width * dpr;
    canvas.height = world.height * dpr;
    canvas.style.aspectRatio = `${world.width} / ${world.height}`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeStars() {
    world.stars = Array.from({ length: 92 }, () => ({
      x: Math.random() * world.width,
      y: Math.random() * world.horizonY,
      size: Math.random() * 1.8 + 0.35,
      phase: Math.random() * Math.PI * 2
    }));
  }

  function resetGame() {
    state.score = 0;
    state.orbs = 0;
    state.level = 1;
    state.speed = 330;
    state.distance = 0;
    state.spawnTimer = 0.6;
    state.pickupTimer = 1.8;
    state.shake = 0;
    state.gameOver = false;
    state.paused = false;
    world.objects = [];
    world.particles = [];
    player.lane = 1;
    player.targetLane = 1;
    player.x = laneXAtY(1, player.y);
    player.shield = 0;
    player.tilt = 0;
    syncUi();
  }

  function startGame() {
    initAudio();
    resetGame();
    state.running = true;
    state.lastTime = performance.now();
    hideAllOverlays();
    tone(420, 0.08, "square", 0.035);
    requestAnimationFrame(loop);
  }

  function endGame() {
    state.running = false;
    state.gameOver = true;
    const roundedScore = Math.floor(state.score);
    if (roundedScore > state.best) {
      state.best = roundedScore;
      localStorage.setItem("gamebosh-neon-dash-best", String(state.best));
      ui.resultMessage.textContent = "New high score! The neon belongs to you.";
    } else {
      ui.resultMessage.textContent = "A strong run. Try again and beat your best score.";
    }
    ui.finalScore.textContent = roundedScore.toLocaleString();
    ui.gameOverOverlay.classList.add("is-visible");
    syncUi();
    tone(120, 0.32, "sawtooth", 0.05);
  }

  function togglePause(force) {
    if (!state.running && !state.paused) return;
    const next = typeof force === "boolean" ? force : !state.paused;
    state.paused = next;
    ui.pauseOverlay.classList.toggle("is-visible", next);
    ui.pauseButton.textContent = next ? "Resume game" : "Pause game";
    if (!next) {
      state.lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  }

  function hideAllOverlays() {
    ui.startOverlay.classList.remove("is-visible");
    ui.pauseOverlay.classList.remove("is-visible");
    ui.gameOverOverlay.classList.remove("is-visible");
  }

  function syncUi() {
    ui.score.textContent = Math.floor(state.score).toLocaleString();
    ui.best.textContent = state.best.toLocaleString();
    ui.orbs.textContent = state.orbs.toLocaleString();
    ui.level.textContent = state.level.toLocaleString();
  }

  function laneXAtY(lane, y) {
    const progress = clamp((y - world.horizonY) / (world.roadBottomY - world.horizonY), 0, 1);
    const width = lerp(world.roadTopWidth, world.roadBottomWidth, progress);
    const left = world.width / 2 - width / 2;
    return left + width * ((lane + 0.5) / world.laneCount);
  }

  function roadWidthAtY(y) {
    const progress = clamp((y - world.horizonY) / (world.roadBottomY - world.horizonY), 0, 1);
    return lerp(world.roadTopWidth, world.roadBottomWidth, progress);
  }

  function scaleAtY(y) {
    return lerp(0.18, 1.15, clamp((y - world.horizonY) / (world.roadBottomY - world.horizonY), 0, 1));
  }

  function spawnObstacle() {
    const available = [0, 1, 2];
    const safeLane = Math.floor(Math.random() * 3);
    const obstacleCount = state.level >= 4 && Math.random() > 0.58 ? 2 : 1;
    const lanes = available.filter(lane => lane !== safeLane).sort(() => Math.random() - 0.5).slice(0, obstacleCount);

    lanes.forEach((lane, index) => {
      world.objects.push({
        type: "obstacle",
        lane,
        y: world.horizonY + 10 - index * 18,
        passed: false,
        hit: false,
        rotation: 0
      });
    });
  }

  function spawnPickup() {
    const roll = Math.random();
    world.objects.push({
      type: roll > 0.84 ? "shield" : "orb",
      lane: Math.floor(Math.random() * 3),
      y: world.horizonY + 4,
      collected: false,
      rotation: Math.random() * Math.PI
    });
  }

  function movePlayer(direction) {
    if (!state.running || state.paused) return;
    player.targetLane = clamp(player.targetLane + direction, 0, 2);
    tone(direction < 0 ? 240 : 300, 0.04, "square", 0.018);
  }

  function update(dt) {
    state.distance += state.speed * dt;
    state.score += dt * (18 + state.level * 3);
    state.level = Math.min(12, 1 + Math.floor(state.score / 450));
    state.speed = 330 + (state.level - 1) * 28;
    state.spawnTimer -= dt;
    state.pickupTimer -= dt;
    state.shake = Math.max(0, state.shake - dt * 26);
    player.shield = Math.max(0, player.shield - dt);

    if (state.spawnTimer <= 0) {
      spawnObstacle();
      state.spawnTimer = Math.max(0.42, 1.18 - state.level * 0.055) + Math.random() * 0.32;
    }

    if (state.pickupTimer <= 0) {
      spawnPickup();
      state.pickupTimer = 1.6 + Math.random() * 1.8;
    }

    const targetX = laneXAtY(player.targetLane, player.y);
    const previousX = player.x;
    player.x += (targetX - player.x) * Math.min(1, dt * 11);
    player.tilt += (((player.x - previousX) * -0.04) - player.tilt) * Math.min(1, dt * 12);
    if (Math.abs(targetX - player.x) < 1) player.lane = player.targetLane;

    world.objects.forEach(object => {
      object.y += state.speed * dt * (0.55 + scaleAtY(object.y) * 0.64);
      object.rotation += dt * (object.type === "orb" ? 4 : 1.2);
      checkCollision(object);

      if (object.type === "obstacle" && !object.passed && object.y > player.y + 58) {
        object.passed = true;
        state.score += 12;
      }
    });

    world.objects = world.objects.filter(object => object.y < world.height + 130 && !object.collected);
    updateParticles(dt);
    syncUi();
  }

  function checkCollision(object) {
    if (object.collected || object.hit) return;
    const scale = scaleAtY(object.y);
    const objectX = laneXAtY(object.lane, object.y);
    const hitDistanceX = object.type === "obstacle" ? 42 * scale + player.width * 0.35 : 28 * scale + player.width * 0.28;
    const hitDistanceY = object.type === "obstacle" ? 46 * scale + player.height * 0.32 : 30 * scale + player.height * 0.25;

    if (Math.abs(objectX - player.x) < hitDistanceX && Math.abs(object.y - player.y) < hitDistanceY) {
      if (object.type === "orb") {
        object.collected = true;
        state.orbs += 1;
        state.score += 75;
        burst(objectX, object.y, "#ffcf4a", 12);
        tone(720, 0.08, "sine", 0.045);
      } else if (object.type === "shield") {
        object.collected = true;
        player.shield = 8;
        state.score += 120;
        burst(objectX, object.y, "#61df8c", 18);
        tone(520, 0.18, "triangle", 0.05);
      } else if (object.type === "obstacle") {
        object.hit = true;
        if (player.shield > 0) {
          player.shield = 0;
          state.shake = 8;
          burst(objectX, object.y, "#61df8c", 22);
          tone(190, 0.12, "square", 0.055);
        } else {
          state.shake = 14;
          burst(player.x, player.y, "#ff3158", 30);
          endGame();
        }
      }
    }
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 190;
      world.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 5,
        life: 0.35 + Math.random() * 0.45,
        maxLife: 0.8,
        color
      });
    }
  }

  function updateParticles(dt) {
    world.particles.forEach(particle => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 140 * dt;
      particle.life -= dt;
    });
    world.particles = world.particles.filter(particle => particle.life > 0);
  }

  function draw(time) {
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
    }
    drawSky(time);
    drawRoad();
    drawObjects();
    drawPlayer(time);
    drawParticles();
    drawSpeedLines();
    ctx.restore();
  }

  function drawSky(time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, world.height);
    gradient.addColorStop(0, "#100525");
    gradient.addColorStop(0.55, "#2b0f43");
    gradient.addColorStop(1, "#07020d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, world.width, world.height);

    const glow = ctx.createRadialGradient(world.width / 2, world.horizonY + 15, 0, world.width / 2, world.horizonY + 15, 360);
    glow.addColorStop(0, "rgba(255,49,88,.36)");
    glow.addColorStop(0.35, "rgba(140,82,255,.14)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, world.width, 320);

    world.stars.forEach(star => {
      const pulse = 0.45 + Math.sin(time * 0.0016 + star.phase) * 0.35;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,155,31,.24)";
    ctx.fillRect(0, world.horizonY - 2, world.width, 4);
  }

  function drawRoad() {
    const topLeft = world.width / 2 - world.roadTopWidth / 2;
    const topRight = world.width / 2 + world.roadTopWidth / 2;
    const bottomLeft = world.width / 2 - world.roadBottomWidth / 2;
    const bottomRight = world.width / 2 + world.roadBottomWidth / 2;

    const roadGradient = ctx.createLinearGradient(0, world.horizonY, 0, world.height);
    roadGradient.addColorStop(0, "#170925");
    roadGradient.addColorStop(1, "#0d0715");
    ctx.fillStyle = roadGradient;
    ctx.beginPath();
    ctx.moveTo(topLeft, world.horizonY);
    ctx.lineTo(topRight, world.horizonY);
    ctx.lineTo(bottomRight, world.height);
    ctx.lineTo(bottomLeft, world.height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(255,49,88,.75)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(topLeft, world.horizonY);
    ctx.lineTo(bottomLeft, world.height);
    ctx.moveTo(topRight, world.horizonY);
    ctx.lineTo(bottomRight, world.height);
    ctx.stroke();

    for (let lane = 1; lane < world.laneCount; lane += 1) {
      ctx.strokeStyle = "rgba(255,255,255,.22)";
      ctx.lineWidth = 2;
      ctx.setLineDash([18, 18]);
      ctx.lineDashOffset = state.distance * 0.12;
      ctx.beginPath();
      const topX = topLeft + world.roadTopWidth * (lane / world.laneCount);
      const bottomX = bottomLeft + world.roadBottomWidth * (lane / world.laneCount);
      ctx.moveTo(topX, world.horizonY);
      ctx.lineTo(bottomX, world.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (let i = 0; i < 15; i += 1) {
      const offset = ((i * 48 + state.distance * 0.8) % 720) / 720;
      const y = world.horizonY + Math.pow(offset, 1.7) * (world.height - world.horizonY);
      const width = roadWidthAtY(y);
      ctx.strokeStyle = `rgba(140,82,255,${0.03 + offset * 0.12})`;
      ctx.lineWidth = 1 + offset * 2;
      ctx.beginPath();
      ctx.moveTo(world.width / 2 - width / 2, y);
      ctx.lineTo(world.width / 2 + width / 2, y);
      ctx.stroke();
    }
  }

  function drawObjects() {
    const sortedObjects = [...world.objects].sort((a, b) => a.y - b.y);
    sortedObjects.forEach(object => {
      const x = laneXAtY(object.lane, object.y);
      const scale = scaleAtY(object.y);
      ctx.save();
      ctx.translate(x, object.y);
      ctx.scale(scale, scale);
      ctx.rotate(object.rotation * (object.type === "obstacle" ? 0.06 : 1));

      if (object.type === "obstacle") drawObstacle(object);
      if (object.type === "orb") drawOrb();
      if (object.type === "shield") drawShield();
      ctx.restore();
    });
  }

  function drawObstacle(object) {
    ctx.globalAlpha = object.hit ? 0.25 : 1;
    ctx.shadowColor = "#ff3158";
    ctx.shadowBlur = 22;
    const gradient = ctx.createLinearGradient(-38, -34, 38, 34);
    gradient.addColorStop(0, "#ff3158");
    gradient.addColorStop(1, "#8c133e");
    roundRect(ctx, -42, -34, 84, 68, 14);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.18)";
    roundRect(ctx, -32, -23, 64, 12, 6);
    ctx.fill();
    ctx.fillStyle = "#ffd7df";
    ctx.font = "900 26px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 0, 9);
    ctx.globalAlpha = 1;
  }

  function drawOrb() {
    ctx.shadowColor = "#ffcf4a";
    ctx.shadowBlur = 26;
    const gradient = ctx.createRadialGradient(-7, -8, 2, 0, 0, 30);
    gradient.addColorStop(0, "#fff7bd");
    gradient.addColorStop(0.45, "#ffcf4a");
    gradient.addColorStop(1, "#ff8a00");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#5b2500";
    ctx.font = "900 22px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚡", 0, 1);
  }

  function drawShield() {
    ctx.shadowColor = "#61df8c";
    ctx.shadowBlur = 28;
    ctx.fillStyle = "rgba(97,223,140,.9)";
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(28, -16);
    ctx.lineTo(21, 18);
    ctx.lineTo(0, 34);
    ctx.lineTo(-21, 18);
    ctx.lineTo(-28, -16);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#e9fff0";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -1, 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawPlayer(time) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.tilt);

    if (player.shield > 0) {
      const pulse = 1 + Math.sin(time * 0.01) * 0.04;
      ctx.save();
      ctx.scale(pulse, pulse);
      ctx.strokeStyle = "rgba(97,223,140,.9)";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#61df8c";
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.ellipse(0, -5, 48, 58, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.shadowColor = "#8c52ff";
    ctx.shadowBlur = 30;
    const bodyGradient = ctx.createLinearGradient(-32, -36, 32, 38);
    bodyGradient.addColorStop(0, "#a971ff");
    bodyGradient.addColorStop(0.62, "#8c52ff");
    bodyGradient.addColorStop(1, "#ff3158");
    roundRect(ctx, -31, -37, 62, 74, 21);
    ctx.fillStyle = bodyGradient;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#140722";
    roundRect(ctx, -21, -24, 42, 27, 10);
    ctx.fill();
    ctx.fillStyle = "#ffcf4a";
    ctx.fillRect(-13, -14, 8, 5);
    ctx.fillRect(5, -14, 8, 5);

    ctx.fillStyle = "rgba(255,255,255,.87)";
    ctx.font = "900 17px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("GB", 0, 17);

    const flameLength = 17 + Math.sin(time * 0.025) * 5;
    const flame = ctx.createLinearGradient(0, 30, 0, 30 + flameLength);
    flame.addColorStop(0, "#fff1a5");
    flame.addColorStop(0.45, "#ff9b1f");
    flame.addColorStop(1, "rgba(255,49,88,0)");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-12, 34);
    ctx.quadraticCurveTo(-5, 34 + flameLength, 0, 34 + flameLength);
    ctx.quadraticCurveTo(6, 34 + flameLength, 12, 34);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    world.particles.forEach(particle => {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawSpeedLines() {
    if (!state.running) return;
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 2;
    for (let i = 0; i < state.level + 2; i += 1) {
      const x = ((i * 137 + state.distance * 1.8) % (world.width + 100)) - 50;
      const y = 130 + ((i * 83 + state.distance * 1.1) % 360);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 25, y - 34);
      ctx.stroke();
    }
  }

  function loop(time) {
    if (!state.running || state.paused) return;
    const dt = Math.min((time - state.lastTime) / 1000, 0.033);
    state.lastTime = time;
    update(dt);
    draw(time);
    if (state.running) requestAnimationFrame(loop);
  }

  function drawIdle() {
    draw(performance.now());
    if (!state.running && !state.gameOver) requestAnimationFrame(drawIdle);
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (start, end, amount) => start + (end - start) * amount;

  ui.startButton.addEventListener("click", startGame);
  ui.restartButton.addEventListener("click", startGame);
  ui.resumeButton.addEventListener("click", () => togglePause(false));
  ui.pauseButton.addEventListener("click", () => togglePause());
  ui.moveLeftButton.addEventListener("pointerdown", () => movePlayer(-1));
  ui.moveRightButton.addEventListener("pointerdown", () => movePlayer(1));

  ui.soundButton.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    ui.soundButton.textContent = state.soundEnabled ? "🔊" : "🔇";
    ui.soundButton.setAttribute("aria-label", state.soundEnabled ? "Mute sound" : "Enable sound");
    ui.soundButton.title = state.soundEnabled ? "Mute sound" : "Enable sound";
    if (state.soundEnabled) tone(440, 0.08, "sine", 0.04);
  });

  window.addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
    if (["ArrowLeft", "a", "A"].includes(event.key)) movePlayer(-1);
    if (["ArrowRight", "d", "D"].includes(event.key)) movePlayer(1);
    if (["p", "P", "Escape"].includes(event.key)) togglePause();
    if ((event.key === "Enter" || event.key === " ") && (!state.running || state.gameOver)) startGame();
  });

  canvas.addEventListener("pointerdown", event => {
    if (!state.running || state.paused) return;
    const rect = canvas.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    movePlayer(relativeX < rect.width / 2 ? -1 : 1);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running && !state.paused) togglePause(true);
  });

  window.addEventListener("resize", resizeCanvas);

  resizeCanvas();
  makeStars();
  resetGame();
  syncUi();
  drawIdle();
})();
