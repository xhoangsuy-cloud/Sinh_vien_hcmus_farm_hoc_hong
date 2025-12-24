// main.js (ESM) - Sonic-ish platformer demo (HTML5 Canvas)
// - Player sprite: assets/player.png + assets/player.sprite.json (auto)
// - Enemy sprite: assets/enemies/vitichphan_monster.png + vitichphan_monster.sprite.json (auto)
// Debug: F2

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

// Background (HCMUS in fire)
let bgImg = null;

// Obstacle images
let deskImg = null;   // Vietnamese long desk+bench platform
let stairsImg = null; // Vietnamese 3-color stair tile
let checkpointImg = null; // New checkpoint sprite
let trapImg = null; // New spike trap sprite
let bossImg = null; // New boss sprite
let coinImg = null; // New coin sprite
let endingImg = null; // Ending screen


// Ground tileset (hell)
let tileImg = null;
let groundImg = null; // New ground image

// UI icons
let uiIcons = null;

// Level/game state (Twist HCMUS)
let level = null;
let pickups = [];
let hazards = [];
let traps = []; // Spike traps
let checkpoints = [];
let activeCheckpoint = null;
let newAssetsLoaded = false; // Flag to track if we are using new assets

// Asset Paths Configuration
const ASSETS = {
  bg: { new: "./newassets/parallax background.png", old: "./assets/bg_hcmus_fire.png" },
  tiles: { new: null, old: "./assets/tiles/hell_tiles.png" },
  ui: { new: "./newassets/player elements.png", old: "./assets/ui/icons.png" },
  player: {
    newPng: "./newassets/main char sprite.png",
    newJson: "./newassets/player_new.sprite.json",
    oldPng: "./assets/player.png",
    oldJson: "./assets/player.sprite.json"
  },
  monster: { oldPng: "./assets/enemies/vitichphan_monster.png", oldJson: "./assets/enemies/vitichphan_monster.sprite.json" },
  checkpoint: { png: "./newassets/checkpoint.png", json: "./newassets/checkpoint.sprite.json" },
  trap: { png: "./newassets/spike trap (1).png", json: "./newassets/spike.sprite.json" },
  boss: { png: "./newassets/intergral boss.png", json: "./newassets/boss.sprite.json" },
  coin: { png: "./newassets/coin.png", json: "./newassets/coin.sprite.json" },
  ending: { png: "./newassets/ending.png" },
  ground: { png: "./newassets/ground.png" }
};

// Placeholder config for new Player Sprite (needs adjustment based on actual sheet)
// Will be dynamically generated after loading player sprite
let NEW_PLAYER_CONFIG = null;

// Boss config - will be set after loading
let BOSS_CONFIG = null;

// Coin config - will be set after loading
let COIN_CONFIG = null;
let coinAnimTime = 0; // For coin animation


// Campaign levels - REDUCED TO 3
const LEVEL_FILES = ["level1.json", "level2.json", "level3.json"];
let levelIndex = 0;
let levelLoading = false;
let nextLevelCountdown = -1;

// Boss state (used in level4)
let boss = null;
let bossSheet = null; // Boss sprite sheet
let bossAnimator = null; // Boss animator
let bossBullets = [];
let slowZones = [];
let bossActive = false;
let bossDefeated = false;

function levelPath(i) {
  return `./levels/${LEVEL_FILES[clamp(i, 0, LEVEL_FILES.length - 1)]}`;
}


const game = {
  timeLeft: 60,
  credits: 0,
  drl: 0,
  hp: 5,
  shield: 0,
  speedBoost: 0,
  doubleJump: 0,
  dashUnlocked: false,
  dashCD: 0,
  coins: 0, // New global coin counter
  won: false,
  lost: false,
  victory: false, // Campaign cleared
  msg: "",
  // ===== SCORING SYSTEM =====
  totalPlayTime: 0,      // Tổng thời gian chơi (giây)
  finalScore: 0,         // Điểm cuối cùng
  gameStartTime: 0,      // Thời điểm bắt đầu game
  deathCount: 0          // Số lần chết
};


const UI = {
  spriteFile: document.getElementById("spriteFile"),
  configFile: document.getElementById("configFile"),
  applyBtn: document.getElementById("applyBtn"),
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

// ---------- Audio (tiny WebAudio SFX) ----------
let _ac = null;
function beep(freq = 440, dur = 0.06, type = "square", gain = 0.05) {
  try {
    if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
    const t0 = _ac.currentTime;
    const o = _ac.createOscillator();
    const g = _ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(_ac.destination);
    o.start(t0);
    o.stop(t0 + dur);
  } catch (_) { }
}

// ---------- Input ----------
const keys = new Map();
addEventListener("keydown", (e) => keys.set(e.code, true));
addEventListener("keyup", (e) => keys.set(e.code, false));
addEventListener("mousedown", (e) => {
  if (game.victory) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Nút RESTART - khớp với vị trí trong drawEnding()
    const btnW = 180;
    const btnH = 50;
    const btnX = canvas.width - btnW - 30;
    const btnY = canvas.height - btnH - 20;

    if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
      // Restart Game - quay về Level 1
      levelIndex = 0;
      resetGame();
      game.victory = false;
      startLevel(0, { newRun: true });
      beep(880, 0.1, "square", 0.1);
    }
  }
});
function down(code) { return keys.get(code) === true; }

// key edge (avoid repeat spam)
const _prevKeys = new Map();
function pressed(code) {
  const now = down(code);
  const prev = _prevKeys.get(code) === true;
  _prevKeys.set(code, now);
  return now && !prev;
}

function axisX() {
  const left = down("ArrowLeft") || down("KeyA");
  const right = down("ArrowRight") || down("KeyD");
  return (right ? 1 : 0) - (left ? 1 : 0);
}
function jumpPressed() { return pressed("Space"); }
function downPressed() { return down("ArrowDown") || down("KeyS"); }

// ---------- Tilemap ----------
const TILE = 32;
// 0 empty, 1 solid
const mapW = 80, mapH = 20;
const map = Array.from({ length: mapH }, () => Array(mapW).fill(0));

// Ground
for (let x = 0; x < mapW; x++) {
  for (let y = 16; y < mapH; y++) map[y][x] = 1;
}
// Platforms / slope-ish stairs
// Visual obstacles mapping (collision uses the tilemap above)
const DESK_PLATFORMS = []; // Populated by loadLevel

const STAIRS_STEPS = Array.from({ length: 8 }, (_, i) => ({ x: 55 + i, y: 15 - i })); // Vietnamese 3-color staircase

// Smooth slope collision for the stairs region (so walking up/down is continuous)
const SLOPE_STAIRS = {
  x0: 55, x1: 62,      // tile range (inclusive)
  yTop: 8, yBottom: 15 // tile rows (inclusive)
};




for (let i = 0; i < 8; i++) map[15 - i][55 + i] = 1;

function isStairsTile(tx, ty) {
  // The diagonal staircase tiles are handled by slope math, not block collision.
  return (tx >= SLOPE_STAIRS.x0 && tx <= SLOPE_STAIRS.x1) && (ty >= SLOPE_STAIRS.yTop && ty <= SLOPE_STAIRS.yBottom) && ((ty - SLOPE_STAIRS.yBottom) === -(tx - SLOPE_STAIRS.x0));
}

function isSolidAtPixel(px, py) {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return false;
  if (map[ty][tx] !== 1) return false;
  if (isStairsTile(tx, ty)) return false;
  return true;
}
function rectVsMap(x, y, w, h) {
  const pts = [
    [x, y],
    [x + w - 1, y],
    [x, y + h - 1],
    [x + w - 1, y + h - 1],
  ];
  return pts.some(([px, py]) => isSolidAtPixel(px, py));
}

function applyStairsSlope(body) {
  // body: {x, y, vx, vy, w, h, onGround}
  const xStart = SLOPE_STAIRS.x0 * TILE;
  const xEnd = (SLOPE_STAIRS.x1 + 1) * TILE; // end pixel
  const length = xEnd - xStart;

  // Use feet x with a tiny bias in movement direction to reduce jitter.
  const footX = body.x + (body.vx !== 0 ? Math.sign(body.vx) * 0.5 : 0);

  if (footX < xStart || footX > xEnd) return false;

  const t = clamp((footX - xStart) / length, 0, 1);

  const yLeft = (SLOPE_STAIRS.yBottom) * TILE; // surface y at left
  const yRight = (SLOPE_STAIRS.yTop) * TILE;    // surface y at right
  const ySurf = yLeft + (yRight - yLeft) * t;

  // Snap to slope when falling or already near it
  const near = (body.y >= ySurf - 24) && (body.y <= ySurf + 48);
  if (body.vy >= 0 && near) {
    if (body.y > ySurf) {
      body.y = ySurf;
      body.vy = 0;
      body.onGround = true;
      return true;
    } else if (Math.abs(body.y - ySurf) <= 6) {
      // stick to slope while walking
      body.y = ySurf;
      body.vy = 0;
      body.onGround = true;
      return true;
    }
  }

  return false;
}

// ---------- Sprite ----------
class SpriteSheet {
  constructor() { this.img = null; this.cfg = null; this.ready = false; }
  set(img, cfg) { this.img = img; this.cfg = cfg; this.ready = !!(img && cfg && cfg.animations); }
  get fps() { return (this.cfg?.meta?.fps) ?? 12; }
  get anchorX() { return (this.cfg?.meta?.anchorX) ?? 16; }
  get anchorY() { return (this.cfg?.meta?.anchorY) ?? 28; }
  get scale() { return (this.cfg?.meta?.scale) ?? 1; }
  get bobWalk() { return (this.cfg?.meta?.bobWalk) ?? 0; }
  frames(name) { return this.cfg?.animations?.[name] ?? null; }
}

class Animator {
  constructor(sheet) {
    this.sheet = sheet;
    this.anim = "idle";
    this.t = 0;
    this.frameIndex = 0;
    this.flipX = false;
    this._bobT = 0;
  }
  setAnim(name) {
    if (this.anim !== name) { this.anim = name; this.t = 0; this.frameIndex = 0; this._bobT = 0; }
  }
  update(dt) {
    const frames = this.sheet.frames(this.anim);
    if (!frames || frames.length <= 1) return;
    this.t += dt;
    this._bobT += dt;
    this.frameIndex = Math.floor(this.t * this.sheet.fps) % frames.length;
  }
  draw(px, py) {
    const ax = this.sheet.anchorX, ay = this.sheet.anchorY;
    const s = this.sheet.scale;
    const x = Math.floor(px), y = Math.floor(py);

    // optional bob for walk
    let bob = 0;
    if (this.anim === "walk" || this.anim === "run") {
      const amp = this.sheet.bobWalk;
      if (amp > 0) bob = Math.sin(this._bobT * 12) * amp;
    }

    if (!this.sheet.ready) {
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.scale(this.flipX ? -1 : 1, 1);
      ctx.fillStyle = "rgba(120,220,255,.9)";
      ctx.fillRect(-12, -26, 24, 26);
      ctx.fillStyle = "rgba(0,0,0,.25)";
      ctx.fillRect(-10, -24, 20, 8);
      ctx.restore();
      return;
    }

    const frames = this.sheet.frames(this.anim);
    const fr = frames?.[this.frameIndex] ?? frames?.[0];
    if (!fr) return;

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(this.flipX ? -1 : 1, 1);
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(
      this.sheet.img,
      fr.x, fr.y, fr.w, fr.h,
      -ax * s, -ay * s,
      fr.w * s, fr.h * s
    );
    ctx.restore();
  }
}

// ---------- Player ----------
const sheet = new SpriteSheet();
const animator = new Animator(sheet);

const player = {
  x: 200, y: 200,
  vx: 0, vy: 0,
  w: 22, h: 28,      // hitbox
  onGround: false,
  facing: 1,
  jumpBuffer: 0,
  coyote: 0,
  rolling: false,
  airJumpUsed: false
};

const PHYS = {
  gravity: 1900,
  jumpVel: 720,
  maxRun: 560,
  accel: 2200,
  airAccel: 1200,
  friction: 1800,
  airDrag: 120,
  rollFriction: 600,
  coyoteTime: 0.08,
  jumpBufferTime: 0.10
};

// ---------- Enemy ----------
const enemies = []; // {x,y,vx,vy,w,h,facing,sheet,anim,alive,invuln,minX,maxX}
let enemySheet = null;

// ---------- Camera ----------
const cam = { x: 0, y: 0 };

// Debug
let DEBUG = false;
let _fpsT = 0, _fpsN = 0, FPS = 0;

addEventListener("keydown", (e) => {
  if (e.code === "F2") DEBUG = !DEBUG;
});

function reset() {
  // legacy quick reset (kept for backwards)
  respawn();
}

// ---------- Helpers ----------
function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`Failed to load ${src}`));
    im.src = src;
  });
}

async function loadAsset(newPath, oldPath) {
  if (newPath) {
    try {
      const img = await loadImage(newPath);
      // Verify dimensions to ensure it's not a broken/empty file if needed, but onload is usually enough
      return { img, isNew: true };
    } catch (e) {
      console.log(`[Asset] New asset not found: ${newPath}, trying fallback...`);
    }
  }
  if (oldPath) {
    try {
      const img = await loadImage(oldPath);
      return { img, isNew: false };
    } catch (e) {
      console.warn(`[Asset] Fallback failed: ${oldPath}`);
    }
  }
  return { img: null, isNew: false };
}

async function loadBg() {
  const result = await loadAsset(ASSETS.bg.new, ASSETS.bg.old);
  bgImg = result.img;
}

async function loadTiles() {
  const result = await loadAsset(ASSETS.tiles.new, ASSETS.tiles.old);
  tileImg = result.img;
}

async function loadOtherAssets() {
  // Desk platform
  try {
    const dRes = await loadAsset(null, "./assets/obstacles/desk_platform.png");
    deskImg = dRes.img;
    console.log("[ASSETS] Desk loaded");
  } catch (e) { console.warn("[ASSETS] Desk load failed"); }

  // Stairs
  try {
    const sRes = await loadAsset(null, "./assets/obstacles/stairs_tile.png");
    stairsImg = sRes.img;
    console.log("[ASSETS] Stairs loaded");
  } catch (e) { console.warn("[ASSETS] Stairs load failed"); }

  // Checkpoint
  const cRes = await loadAsset(ASSETS.checkpoint.png, null);
  checkpointImg = cRes.img;

  // Trap/Spike
  const tRes = await loadAsset(ASSETS.trap.png, null);
  trapImg = tRes.img;

  // Boss - Load with JSON config
  try {
    const [bImgRes, bCfgRes] = await Promise.all([
      loadAsset(ASSETS.boss.png, null),
      fetch(ASSETS.boss.json, { cache: "no-store" })
    ]);
    if (bImgRes.img && bCfgRes.ok) {
      bossImg = bImgRes.img;
      BOSS_CONFIG = await bCfgRes.json();
      console.log("[BOSS] Loaded with JSON config!");

      // Apply game scale
      const targetHeight = 96; // Boss is bigger
      const firstFrame = BOSS_CONFIG.animations?.idle?.[0];
      if (firstFrame) {
        const calculatedScale = targetHeight / firstFrame.h;
        BOSS_CONFIG.meta.scale = calculatedScale;
        console.log("[BOSS] Adjusted scale:", calculatedScale.toFixed(2));
      }

      bossSheet = new SpriteSheet();
      bossSheet.set(bossImg, BOSS_CONFIG);
      bossAnimator = new Animator(bossSheet);
      bossAnimator.setAnim("idle");
    }
  } catch (e) {
    console.warn("[BOSS] Failed to load config:", e);
  }

  // Coin - Load with JSON config
  try {
    const [coinImgRes, coinCfgRes] = await Promise.all([
      loadAsset(ASSETS.coin.png, null),
      fetch(ASSETS.coin.json, { cache: "no-store" })
    ]);
    if (coinImgRes.img && coinCfgRes.ok) {
      coinImg = coinImgRes.img;
      COIN_CONFIG = await coinCfgRes.json();
      console.log("[COIN] Loaded with JSON config!");

      // Store spin frames for easy access
      COIN_CONFIG._spinFrames = COIN_CONFIG.animations?.spin || [];
      COIN_CONFIG._collectFrames = COIN_CONFIG.animations?.collect || [];
    }
  } catch (e) {
    console.warn("[COIN] Failed to load config:", e);
  }

  // Ground - Load new ground image
  try {
    const groundRes = await loadAsset(ASSETS.ground.png, null);
    if (groundRes.img) {
      groundImg = groundRes.img;
      console.log("[GROUND] Loaded successfully!");
    }
  } catch (e) {
    console.warn("[GROUND] Failed to load:", e);
  }
}

async function loadUIIcons() {
  const result = await loadAsset(ASSETS.ui.new, ASSETS.ui.old);
  uiIcons = result.img;
}

async function loadLevel(path = "./levels/level1.json") {
  level = await fetch(path, { cache: "no-store" }).then(r => r.json());
  // build runtime entities
  pickups = (level.pickups || []).map(p => ({
    type: p.type,
    x: (p.tx + 0.5) * TILE,
    y: (p.ty + 0.5) * TILE,
    r: 10,
    alive: true
  }));
  hazards = (level.hazards || []).map(h => ({
    type: h.type,
    x: (h.tx + 0.5) * TILE,
    y: (h.ty + 0.5) * TILE,
    w: 26,
    h: 26,
    vx: (h.speed || 140) * (Math.random() < 0.5 ? -1 : 1),
    minX: (h.minTx || h.tx - 3) * TILE,
    maxX: (h.maxTx || h.tx + 3) * TILE,
    alive: true
  }));
  checkpoints = (level.checkpoints || []).map(c => ({
    name: c.name,
    x: (c.tx + 0.5) * TILE,
    y: (c.ty + 0.5) * TILE,
    w: 28,
    h: 28,
    alive: true
  }));

  traps = (level.traps || []).map(t => ({
    x: (t.tx + 0.5) * TILE,
    y: (t.ty + 1) * TILE, // floor aligned
    state: "idle", // idle (hull), warn, extend (damage), retract
    timer: 0,
    w: 32, h: 32,
    offset: t.offset || 0,
    // Config: idle=2s, warn=0.5, active=1s, retract=0.5
    tIdle: 2.0, tWarn: 0.5, tActive: 1.0, tRetract: 0.5
  }));

  game.timeLeft = Math.max(5, level.timeLimitSec || 60);
  game.msg = "";
  game.won = false;
  game.lost = false;
  activeCheckpoint = null;

  // boss setup (optional)
  boss = null;
  bossBullets = [];
  slowZones = [];
  bossActive = false;
  bossDefeated = false;
  if (level && level.boss) {
    const b = level.boss;
    boss = {
      type: b.type || "final_exam",
      x: (b.tx + 0.5) * TILE,
      y: (b.ty + 1) * TILE - 1,
      w: (b.wTiles || 2) * TILE,
      h: (b.hTiles || 2) * TILE,
      hp: b.hp || 10,
      maxHp: b.hp || 10,
      invuln: 0,
      t: 0,
      phase: 1,
      arena: b.arena || { x0Tx: 56, x1Tx: 76, yFloorTy: 15 },
      triggerTx: (b.triggerTx ?? 54)
    };
  }

  // REBUILD COLLISION MAP from level platforms
  rebuildMapFromLevel(level);
}

// Rebuild tilemap collision from level JSON
function rebuildMapFromLevel(level) {
  // Clear map (keep ground)
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      map[y][x] = (y >= 16) ? 1 : 0; // Ground at y >= 16
    }
  }

  // Load platforms from level
  const platforms = level?.platforms || [];
  for (const p of platforms) {
    for (let x = p.x0; x <= p.x1; x++) {
      if (p.y >= 0 && p.y < mapH) map[p.y][x] = 1;
    }
  }

  // Load stairs from level
  const stairs = level?.stairs || SLOPE_STAIRS;
  if (stairs) {
    SLOPE_STAIRS.x0 = stairs.x0;
    SLOPE_STAIRS.x1 = stairs.x1;
    SLOPE_STAIRS.yTop = stairs.yTop;
    SLOPE_STAIRS.yBottom = stairs.yBottom;
  }

  // Update DESK_PLATFORMS for rendering
  DESK_PLATFORMS.length = 0;
  for (const p of platforms) {
    DESK_PLATFORMS.push(p);
  }

  console.log("[MAP] Rebuilt from level:", platforms.length, "platforms,", stairs ? "with stairs" : "no stairs");
}


async function startLevel(i, { newRun = false } = {}) {
  levelLoading = true;
  levelIndex = clamp(i, 0, LEVEL_FILES.length - 1);

  await loadLevel(levelPath(levelIndex));

  // per-level resets
  game.won = false;
  game.lost = false;
  game.msg = "";
  if (newRun) {
    game.credits = 0;
    game.drl = 0;
    game.coins = 0;
    game.deathCount = 0;
    game.totalPlayTime = 0;
    game.gameStartTime = performance.now();
  }
  game.hp = 5;
  game.shield = 0;
  game.speedBoost = 0;
  game.doubleJump = 0;
  game.dashUnlocked = false;
  game.dashCD = 0;

  // boss init is handled in loadLevel() via level.boss
  respawn();

  levelLoading = false;
}



async function loadObstacles() {
  // These are optional. If missing, the game falls back to green tiles.
  try {
    deskImg = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = "./assets/obstacles/desk_platform.png";
    });
  } catch (_) { deskImg = null; }

  try {
    stairsImg = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = "./assets/obstacles/stairs_tile.png";
    });
  } catch (_) { stairsImg = null; }
}

async function loadSpriteByPath(pngPath, jsonPath) {
  const cfg = await fetch(jsonPath, { cache: "no-store" }).then(r => r.json());
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = pngPath;
  });
  const s = new SpriteSheet();
  s.set(img, cfg);
  return s;
}

// ---------- Physics + Collision ----------
function moveAndCollidePlayer(dt) {
  player.vy += PHYS.gravity * dt;

  // X
  let nx = player.x + player.vx * dt;
  let ny = player.y;
  const left = nx - player.w / 2;
  const top = ny - player.h;

  if (rectVsMap(left, top, player.w, player.h)) {
    const step = sign(player.vx) || 1;
    while (!rectVsMap((player.x - player.w / 2) + step, top, player.w, player.h) && Math.abs(nx - player.x) > 0.5) {
      player.x += step;
    }
    player.vx = 0;
    nx = player.x;
  }
  player.x = nx;

  // Y
  nx = player.x;
  ny = player.y + player.vy * dt;

  const l = nx - player.w / 2;
  const t = ny - player.h;

  player.onGround = false;

  if (rectVsMap(l, t, player.w, player.h)) {
    const step = sign(player.vy) || 1;
    while (!rectVsMap(l, (player.y - player.h) + step, player.w, player.h) && Math.abs(ny - player.y) > 0.5) {
      player.y += step;
    }
    if (player.vy > 0) player.onGround = true;
    player.vy = 0;
    ny = player.y;
  }
  player.y = ny;

  // Smooth stairs slope (continuous walking up/down)
  applyStairsSlope(player);

  player.coyote = player.onGround ? PHYS.coyoteTime : Math.max(0, player.coyote - dt);
  player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);

  // Trap Platform Collision (Safe Traps)
  if (player.vy >= 0) { // Only checking when falling/standing
    const pw = player.w;
    for (const t of traps) {
      if (t.state === "extend") continue; // Hazardous, not platform
      // Trap rect (assuming 32x32, anchors at bottom t.y)
      // t.x is center X? No, loaded as (tx+0.5)*TILE -> Center X. 
      // t.y is (ty+1)*TILE -> Bottom Y.
      const tTop = t.y - 32;
      const tLeft = t.x - 16;
      const tRight = t.x + 16;

      // Check X overlap
      if (player.x + pw / 4 > tLeft && player.x - pw / 4 < tRight) {
        // Check Y (landing)
        if (player.y >= tTop && player.y <= tTop + 18 + player.vy * dt) {
          player.y = tTop;
          player.vy = 0;
          player.onGround = true;
          player.coyote = PHYS.coyoteTime; // Allowed to jump
          player.stomp = false; // Landed
        }
      }
    }
  }
}

function updatePlayer(dt) {
  const ax = axisX();
  // per-frame speed cap (affected by boosts/slow)
  let maxRun = PHYS.maxRun;

  const wantJump = jumpPressed();
  const wantRoll = downPressed();

  const wantDash = (game.dashUnlocked && game.dashCD <= 0) && (pressed("KeyK") || pressed("KeyX"));
  if (wantDash) {
    player.vx = player.facing * (maxRun * 2.2);
    player.rolling = true;
    game.dashCD = 0.9;
    player.invuln = Math.max(player.invuln || 0, 0.2);
    beep(480, 0.05, "sawtooth", 0.05);
  }

  // STOMP Mechanic (Down in Air)
  if (!player.onGround && (pressed("ArrowDown") || pressed("KeyS")) && !player.stomp) {
    player.stomp = true;
    player.vy = 800; // Fast fall
    beep(150, 0.05, "sawtooth", 0.04);
  }
  if (player.onGround) player.stomp = false;

  // slow zone decay
  game._slowed = Math.max(0, (game._slowed || 0) - dt);
  if (game._slowed > 0) maxRun *= 0.60;

  // decay invuln timer
  player.invuln = Math.max(0, (player.invuln || 0) - dt);

  // speed boost scales max speed
  if (wantJump) player.jumpBuffer = PHYS.jumpBufferTime;

  if (player.onGround && wantRoll && Math.abs(player.vx) > 160) player.rolling = true;
  if (!wantRoll && player.onGround) player.rolling = false;

  if (ax !== 0) player.facing = ax;

  if (player.onGround) {
    if (ax !== 0) player.vx += ax * PHYS.accel * dt;
    else {
      const fr = player.rolling ? PHYS.rollFriction : PHYS.friction;
      const dv = fr * dt;
      if (Math.abs(player.vx) <= dv) player.vx = 0;
      else player.vx -= sign(player.vx) * dv;
    }
  } else {
    if (ax !== 0) player.vx += ax * PHYS.airAccel * dt;
    const dv = PHYS.airDrag * dt;
    if (Math.abs(player.vx) <= dv) player.vx = 0;
    else player.vx -= sign(player.vx) * dv;
  }

  maxRun = maxRun * (game.speedBoost > 0 ? 1.25 : 1.0) * (player.rolling ? 1.10 : 1.0);
  player.vx = clamp(player.vx, -maxRun, maxRun);

  if (player.jumpBuffer > 0 && player.coyote > 0) {
    // ground/coyote jump
    player.vy = -PHYS.jumpVel;
    player.jumpBuffer = 0;
    player.coyote = 0;
    player.onGround = false;
    player.rolling = false;
    player.airJumpUsed = false;
  } else if (player.jumpBuffer > 0 && !player.onGround && game.doubleJump > 0 && !player.airJumpUsed) {
    // temporary double jump (Giáo trình)
    player.vy = -PHYS.jumpVel * 0.95;
    player.jumpBuffer = 0;
    player.airJumpUsed = true;
    player.rolling = false;
    beep(700, 0.05, "square", 0.04);
  }

  moveAndCollidePlayer(dt);

  // Fix bug: rớt khỏi map thì respawn
  const deathY = mapH * TILE + 400;
  if (player.y > deathY) { hurtPlayer("void"); if (!game.lost) respawn(); }

  if (player.onGround) player.airJumpUsed = false;

  // -- Player State Machine --
  animator.flipX = (player.facing < 0);

  // Determine animation based on state
  let targetAnim = "idle";

  if (game.hp <= 0) {
    targetAnim = "death";
    player.vx = 0; // Disable movement if dead
  }
  else if (player._punching > 0) {
    targetAnim = "hit"; // Use hit animation for punch
  }
  else if (player.invuln > 0.5) {
    targetAnim = "hit"; // Just got hit
  }
  else if (!player.onGround) {
    targetAnim = (player.vy < 0) ? "jump" : "fall";
  }
  else if (player.rolling) {
    targetAnim = "roll"; // Now using proper roll animation!
  }
  else if (Math.abs(player.vx) > 40) {
    targetAnim = "run";
  }
  else {
    targetAnim = "idle";
  }

  animator.setAnim(targetAnim);
  animator.update(dt);
}

// Enemy physics: simple gravity + collide down + patrol bounds
function moveAndCollideEnemy(e, dt) {
  const GRAV = 1900;
  e.vy += GRAV * dt;

  // X move (patrol)
  let nx = e.x + e.vx * dt * e.facing;
  let ny = e.y;

  // Try X collision against walls
  const left = nx - e.w / 2;
  const top = ny - e.h;
  if (rectVsMap(left, top, e.w, e.h)) {
    // reverse on wall
    e.facing *= -1;
    nx = e.x;
  }
  e.x = nx;

  // Y move
  ny = e.y + e.vy * dt;
  const l = e.x - e.w / 2;
  const t = ny - e.h;
  if (rectVsMap(l, t, e.w, e.h)) {
    // resolve out
    const step = sign(e.vy) || 1;
    while (!rectVsMap(l, (e.y - e.h) + step, e.w, e.h) && Math.abs(ny - e.y) > 0.5) {
      e.y += step;
    }
    if (e.vy > 0) e.onGround = true;
    e.vy = 0;
    ny = e.y;
  } else {
    e.onGround = false;
  }
  e.y = ny;

  // Smooth stairs slope for enemies too
  applyStairsSlope(e);

  // Patrol bounds (primary logic)
  if (e.x < e.minX) { e.x = e.minX; e.facing = 1; }
  if (e.x > e.maxX) { e.x = e.maxX; e.facing = -1; }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) continue;

    e.invuln = Math.max(0, e.invuln - dt);

    moveAndCollideEnemy(e, dt);

    e.anim.flipX = (e.facing < 0);
    e.anim.setAnim(e.invuln > 0 ? "hurt" : "walk");
    e.anim.update(dt);
  }
}

function drawEnemies() {
  for (const e of enemies) {
    if (!e.alive) continue;
    e.anim.draw(e.x - cam.x, e.y - cam.y);
  }
}

// ---------- Camera ----------
function updateCamera(dt) {
  const lookAhead = player.vx * 0.15;
  const targetX = player.x - canvas.width / 2 + lookAhead;
  const targetY = player.y - canvas.height / 2 - 80;

  cam.x += (targetX - cam.x) * (1 - Math.pow(0.001, dt));
  cam.y += (targetY - cam.y) * (1 - Math.pow(0.001, dt));

  cam.x = clamp(cam.x, 0, mapW * TILE - canvas.width);
  // Boss arena camera clamp
  if (boss && bossActive && !bossDefeated) {
    const a = boss.arena;
    const minCamX = a.x0Tx * TILE;
    const maxCamX = (a.x1Tx + 1) * TILE - canvas.width;
    cam.x = clamp(cam.x, minCamX, Math.max(minCamX, maxCamX));
  }
  cam.y = clamp(cam.y, 0, mapH * TILE - canvas.height);
}

// ---------- Draw ----------
function drawDeskPlatforms() {
  if (!deskImg) return;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  for (const p of DESK_PLATFORMS) {
    const px = p.x0 * TILE - cam.x;
    const pyTop = p.y * TILE - cam.y; // collision top
    const w = (p.x1 - p.x0 + 1) * TILE;

    // desk_platform.png: recommended 256x64 with transparent BG
    // Align the "tabletop" to the collision top by drawing slightly above it.
    const h = 64;
    const y = pyTop - (h - 8); // keep tabletop ~8px from bottom of sprite
    ctx.drawImage(deskImg, 0, 0, deskImg.width, deskImg.height, px, y, w, h);
  }

  ctx.restore();
}


function drawVietnamStairs() {
  // Use dynamic stairs coords from level
  const x0 = SLOPE_STAIRS.x0;
  const x1 = SLOPE_STAIRS.x1;
  const yTop = SLOPE_STAIRS.yTop;
  const yBottom = SLOPE_STAIRS.yBottom;

  // Draw stair sprite if available
  if (stairsImg) {
    const destW = (x1 - x0 + 1) * TILE;
    const destH = (yBottom - yTop + 1) * TILE;
    const px = x0 * TILE - cam.x;
    const py = (yBottom + 1) * TILE - cam.y - destH - 8;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(stairsImg, px, py, destW, destH + 16);
    ctx.restore();
  } else {
    // Draw simple stair blocks if no sprite
    ctx.save();
    for (let i = 0; i <= (x1 - x0); i++) {
      const tx = x0 + i;
      const ty = yBottom - i;
      const px = tx * TILE - cam.x;
      const py = ty * TILE - cam.y;

      // Stair step gradient
      ctx.fillStyle = "rgba(80, 60, 40, 0.9)";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "rgba(100, 80, 60, 0.8)";
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE / 3);
    }
    ctx.restore();
  }
}

function getHellTileSrc(x, y) {
  // Choose a tile from the tileset for variation.
  // Tileset assumed to be a grid of 32x32 tiles.
  const TW = 32, TH = 32;
  const cols = tileImg ? Math.max(1, Math.floor(tileImg.width / TW)) : 1;
  const rows = tileImg ? Math.max(1, Math.floor(tileImg.height / TH)) : 1;

  // Top surface if air above
  const isTop = (y === 0) || (map[y - 1][x] === 0);

  // Prefer row 0 for top and row 1 for fill (fallback if missing)
  const r = Math.min(isTop ? 0 : 1, rows - 1);

  // Variation: stable pseudo-random by x/y
  const c = (x * 7 + y * 3) % cols;

  return { sx: c * TW, sy: r * TH, sw: TW, sh: TH };
}

function drawMap() {
  // ===== RENDER GROUND IMAGE =====
  if (groundImg) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Ground area: y = 16 * TILE to mapH * TILE (4 tiles tall)
    const groundY = 16 * TILE;
    const groundH = 4 * TILE; // 128 pixels
    const groundW = mapW * TILE; // Full map width

    // Draw ground image stretched to fit ground area
    // Tile horizontally if image is smaller than map
    const imgW = groundImg.width;
    const imgH = groundImg.height;

    // Calculate how many times to tile
    let x = -cam.x;
    const y = groundY - cam.y;

    // Scale to fit ground height
    const scale = groundH / imgH;
    const scaledW = imgW * scale;

    // Draw tiled ground
    while (x < canvas.width) {
      ctx.drawImage(groundImg, x, y, scaledW, groundH);
      x += scaledW;
    }

    ctx.restore();
  }

  // Visual overlays for special obstacles
  drawVietnamStairs();
  drawDeskPlatforms();
}

function drawDebug() {
  if (!DEBUG) return;

  // Player hitbox

  ctx.strokeStyle = "rgba(255,255,255,.8)";
  ctx.strokeRect(
    (player.x - player.w / 2) - cam.x,
    (player.y - player.h) - cam.y,
    player.w,
    player.h
  );

  // Enemy hitboxes + patrol bounds
  ctx.strokeStyle = "rgba(255,0,0,.8)";
  for (const e of enemies) {
    if (!e.alive) continue;
    ctx.strokeRect(
      (e.x - e.w / 2) - cam.x,
      (e.y - e.h) - cam.y,
      e.w, e.h
    );
    // patrol line
    ctx.beginPath();
    ctx.moveTo(e.minX - cam.x, e.y - cam.y + 4);
    ctx.lineTo(e.maxX - cam.x, e.y - cam.y + 4);
    ctx.stroke();
  }

  // Death plane
  const deathY = mapH * TILE + 400;
  ctx.strokeStyle = "rgba(255,255,0,.6)";
  ctx.beginPath();
  ctx.moveTo(0, deathY - cam.y);
  ctx.lineTo(canvas.width, deathY - cam.y);
  ctx.stroke();
}

function drawHUD() {
  // main HUD panel
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const pad = 10;
  const boxW = 520;
  const boxH = 80;

  // Background panel with border
  ctx.fillStyle = "rgba(20, 20, 30, 0.65)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(pad, pad, boxW, boxH, 12);
  ctx.fill();
  ctx.stroke();

  // --- PLAYER AVATAR ---
  // Use first idle frame of player sprite
  if (sheet && sheet.ready) {
    const frame = sheet.frames("idle")?.[0];
    if (frame) {
      // Draw avatar background circle
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.beginPath();
      ctx.arc(pad + 40, pad + 40, 32, 0, Math.PI * 2);
      ctx.fill();

      // Draw face clip
      ctx.save();
      ctx.beginPath();
      ctx.arc(pad + 40, pad + 40, 28, 0, Math.PI * 2);
      ctx.clip();
      // Draw head portion of sprite
      ctx.drawImage(sheet.img, frame.x, frame.y, frame.w, 40, pad + 15, pad + 15, 50, 50);
      ctx.restore();

      // Border ring
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pad + 40, pad + 40, 28, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const startX = pad + 90;
  const hpY = pad + 25;
  const infoY = pad + 55;

  // --- HP HEARTS ---
  for (let i = 0; i < 5; i++) { // Max 5 HP slots
    const hx = startX + i * 24;
    const filled = i < game.hp;

    // Draw Heart
    ctx.beginPath();
    const hy = hpY;
    ctx.moveTo(hx, hy + 4);
    ctx.bezierCurveTo(hx, hy, hx - 4, hy - 4, hx - 10, hy + 4);
    ctx.bezierCurveTo(hx - 10, hy + 14, hx, hy + 20, hx, hy + 22);
    ctx.bezierCurveTo(hx, hy + 20, hx + 10, hy + 14, hx + 10, hy + 4);
    ctx.bezierCurveTo(hx + 10, hy - 4, hx + 6, hy, hx, hy + 4);

    ctx.fillStyle = filled ? "#e74c3c" : "rgba(255, 255, 255, 0.2)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#2c3e50";
    ctx.stroke();
  }

  // --- SHIELD ICON ---
  if (game.shield > 0) {
    for (let i = 0; i < game.shield; i++) {
      const sx = startX + (game.hp * 24) + 10 + i * 20;
      ctx.fillStyle = "#3498db";
      ctx.beginPath();
      ctx.arc(sx, hpY + 10, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }
  }

  // --- COINS ---
  // Draw coin sprite
  const coinX = startX + 220;
  if (coinImg) {
    ctx.drawImage(coinImg, 0, 0, 24, 24, coinX, hpY - 2, 24, 24);
  } else {
    ctx.fillStyle = "gold";
    ctx.beginPath(); ctx.arc(coinX + 12, hpY + 10, 10, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "#f1c40f";
  ctx.font = "bold 20px system-ui";
  ctx.fillText(`${game.coins}`, coinX + 30, hpY + 16);

  // --- TIME ---
  const timeX = coinX + 100;
  ctx.fillStyle = game.timeLeft < 20 ? "#e74c3c" : "#fff";
  ctx.font = "bold 20px system-ui";
  ctx.fillText(`⏱️ ${game.timeLeft.toFixed(0)}`, timeX, hpY + 16);

  // --- BUFF ICONS ---
  // Draw only active buffs
  let bx = startX;
  const bSize = 24;

  // Wifi (Speed)
  if (game.speedBoost > 0) {
    ctx.fillStyle = "rgba(46, 204, 113, 0.8)"; // Green bg
    ctx.beginPath(); ctx.roundRect(bx, infoY - 14, 60, 20, 4); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.fillText(`📶 ${game.speedBoost.toFixed(0)}s`, bx + 4, infoY);
    bx += 70;
  }

  // Book (Double Jump)
  if (game.doubleJump > 0) {
    ctx.fillStyle = "rgba(155, 89, 182, 0.8)"; // Purple bg
    ctx.beginPath(); ctx.roundRect(bx, infoY - 14, 60, 20, 4); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.fillText(`📖 ${game.doubleJump.toFixed(0)}s`, bx + 4, infoY);
    bx += 70;
  }

  // Dash
  if (game.dashUnlocked) {
    const ready = game.dashCD <= 0;
    ctx.fillStyle = ready ? "rgba(230, 126, 34, 0.8)" : "rgba(120, 120, 120, 0.5)";
    ctx.beginPath(); ctx.roundRect(bx, infoY - 14, 70, 20, 4); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "12px sans-serif";
    ctx.fillText(`⚡ ${ready ? "READY" : "CD"}`, bx + 4, infoY);
    bx += 80;
  }

  // DRL (Điểm rèn luyện)
  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  ctx.beginPath(); ctx.roundRect(bx, infoY - 14, 50, 20, 4); ctx.fill();
  ctx.fillStyle = "#ccc";
  ctx.font = "12px sans-serif";
  ctx.fillText(`DRL: ${game.drl}`, bx + 4, infoY);

  // Level Info Panel
  const levelBoxX = pad + boxW + 10;
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.beginPath(); ctx.roundRect(levelBoxX, pad, 220, boxH, 12); ctx.fill();

  ctx.fillStyle = "#e8eefc";
  ctx.font = "bold 16px system-ui";
  ctx.fillText(`Level ${levelIndex + 1}/${LEVEL_FILES.length}`, levelBoxX + 15, pad + 30);

  ctx.font = "12px system-ui";
  ctx.fillStyle = "#aaa";
  if (level && level.name) ctx.fillText(level.name, levelBoxX + 15, pad + 55);

  // Message Overlay (Win/Lose)
  if (game.msg) {
    const mx = canvas.width / 2;
    const my = canvas.height / 2;

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath(); ctx.roundRect(mx - 200, my - 40, 400, 80, 16); ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = game.won ? "#2ecc71" : game.lost ? "#e74c3c" : "#f1c40f";
    ctx.font = "bold 24px system-ui";
    ctx.fillText(game.msg, mx, my + 10);
    ctx.textAlign = "left"; // Reset alignment
  }

  // Boss HP bar (only when active)
  if (boss && (bossActive || bossDefeated) && levelIndex === LEVEL_FILES.length - 1) {
    const bw = 300, bh = 14;
    const bx = (canvas.width - bw) / 2;
    const by = pad + boxH + 20;

    // Bg
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);

    // Bar
    const f = boss.maxHp ? (boss.hp / boss.maxHp) : 0;
    ctx.fillStyle = bossDefeated ? "#95a5a6" : "#c0392b";
    ctx.fillRect(bx, by, bw * f, bh);

    // Label
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("DEADLINE BOSS", bx + bw / 2, by - 5);
    ctx.textAlign = "left";
  }

  ctx.restore();

  if (DEBUG) {
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(10, 110, 430, 92);
    ctx.fillStyle = "#e8eefc";
    ctx.font = "14px system-ui";
    ctx.fillText(`vx: ${player.vx.toFixed(1)}  vy: ${player.vy.toFixed(1)}  FPS~: ${FPS}`, 20, 134);
    ctx.fillText(`anim: ${animator.anim} | onGround: ${player.onGround}`, 20, 156);
    ctx.fillText(`enemy loaded: ${enemySheet?.ready ? "yes" : "no"} | debug(F2): ${DEBUG ? "on" : "off"}`, 20, 178);
  }
}

// Background - Per Level (Top=Level1, Middle=Level2, Bottom=Level3)
function drawBackground() {
  if (!bgImg) return false;

  // Split background into 3 vertical sections for 3 levels
  const layerH = Math.floor(bgImg.height / 3);

  // Select which section based on current level
  const srcY = levelIndex * layerH; // 0, layerH, or layerH*2

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Simple horizontal scrolling for the selected layer
  const w = bgImg.width;
  const xOff = (cam.x * 0.3) % w;

  // Draw tiled background
  let destX = -xOff;
  while (destX < canvas.width) {
    ctx.drawImage(
      bgImg,
      0, srcY, w, layerH,  // Source: selected layer
      destX, 0, w, canvas.height  // Dest: stretch to canvas height
    );
    destX += w;
  }

  ctx.restore();
  return true;
}

// ---------- Twist HCMUS: pickups, powerups, hazards ----------
function playerRect() {
  return {
    l: player.x - player.w / 2,
    t: player.y - player.h,
    w: player.w,
    h: player.h
  };
}

function givePower(type) {
  if (type === "wifi") {
    game.speedBoost = 6;
    beep(880, 0.05, "square", 0.06);
  } else if (type === "card") {
    game.shield = Math.min(2, game.shield + 1);
    beep(520, 0.06, "triangle", 0.06);
  } else if (type === "book") {
    game.doubleJump = 10;
    player.airJumpUsed = false;
    beep(660, 0.06, "square", 0.05);
  } else if (type === "coffee") {
    game.dashUnlocked = true;
    beep(740, 0.06, "sawtooth", 0.05);
  }
}


function collect(type) {
  if (type === "credit") {
    game.coins += 1; // Cumulative
    game.credits += 1; // Keep legacy credit count just in case
    beep(1040, 0.03, "square", 0.05);
  }
  else if (type === "drl") { game.drl += 1; beep(880, 0.04, "triangle", 0.05); }
  else { givePower(type); }
}

function updatePickups() {
  const pr = playerRect();
  for (const p of pickups) {
    if (!p.alive) continue;
    const bx = p.x - p.r;
    const by = p.y - p.r;
    if (aabb(pr.l, pr.t, pr.w, pr.h, bx, by, p.r * 2, p.r * 2)) {
      p.alive = false;
      collect(p.type);
    }
  }
  // checkpoints
  for (const c of checkpoints) {
    const bx = c.x - c.w / 2;
    const by = c.y - c.h / 2;
    if (aabb(pr.l, pr.t, pr.w, pr.h, bx, by, c.w, c.h)) {
      activeCheckpoint = c;
      if (!c.used) {
        c.used = true;
        game.msg = `Checkpoint: ${c.name}`;
        beep(620, 0.07, "square", 0.05);
        // Save spawn pos immediately
        // Note: respawn logic reads activeCheckpoint.x/y
      }
    }
  }
}

function hurtPlayer(reason = "hit") {
  if (player.invuln > 0) return;
  if (game.shield > 0) {
    game.shield -= 1;
    player.invuln = 0.6;
    beep(180, 0.07, "square", 0.06);
    return;
  }
  game.hp -= 1;
  player.invuln = 1.0; // Reduced invincibility time
  player.vx = -player.facing * 240;
  player.vy = -420;
  beep(120, 0.08, "sawtooth", 0.06);
  if (game.hp <= 0) {
    game.lost = true;
    game.deathCount++;
    game.msg = "Gục vì deadline...";
  }
}

// Hàm riêng cho boss damage - gây ít damage hơn để giảm độ khó
function hurtPlayerByBoss(reason = "boss") {
  if (player.invuln > 0) return;
  if (game.shield > 0) {
    game.shield -= 1;
    player.invuln = 0.8;
    beep(180, 0.07, "square", 0.06);
    return;
  }
  game.hp -= 0.5; // Boss chỉ gây 0.5 damage thay vì 1
  player.invuln = 1.5; // Thời gian bất tử lâu hơn để tránh bị đánh liên tục
  player.vx = -player.facing * 200;
  player.vy = -350;
  beep(100, 0.06, "sawtooth", 0.05);
  if (game.hp <= 0) {
    game.lost = true;
    game.deathCount++;
    game.msg = "Gục vì deadline...";
  }
}

function respawn() {
  const sp = activeCheckpoint ? { x: activeCheckpoint.x, y: (activeCheckpoint.y + 0.8) * TILE / TILE } : null;
  const tx = (level?.spawn?.tx ?? 6);
  const ty = (level?.spawn?.ty ?? 12);
  player.x = (sp ? sp.x : (tx + 0.5) * TILE);
  player.y = (sp ? (Math.floor(activeCheckpoint.y / TILE) + 1) * TILE - 1 : (ty + 1) * TILE - 1);
  player.vx = 0; player.vy = 0;
  player.onGround = false;
  player.rolling = false;
  player.airJumpUsed = false;
  animator.setAnim("idle");
}

function resetGame() {
  game.credits = 0;
  game.drl = 0;
  game.hp = 5;
  game.shield = 0;
  game.speedBoost = 0;
  game.doubleJump = 0;
  game.dashUnlocked = false;
  game.dashCD = 0;
  game.won = false;
  game.lost = false;
  game.victory = false;
  game.msg = "";
  for (const p of pickups) p.alive = true;
  for (const h of hazards) h.alive = true;
  for (const c of checkpoints) { c.used = false; }
  activeCheckpoint = null;
  game.timeLeft = Math.max(5, level?.timeLimitSec || 60);
  respawn();
}


function aabb2(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function updateBoss(dt) {
  if (!boss || bossDefeated) return;

  // countdown invuln
  boss.invuln = Math.max(0, boss.invuln - dt);

  const arena = boss.arena;
  const x0 = arena.x0Tx * TILE;
  const x1 = (arena.x1Tx + 1) * TILE;
  const yFloor = (arena.yFloorTy + 1) * TILE - 1;

  // Activate boss when player enters trigger
  if (!bossActive && player.x > boss.triggerTx * TILE) {
    bossActive = true;
    game.msg = "BOSS: THI CUỐI KỲ!";
    beep(220, 0.18, "sawtooth", 0.08);
    beep(110, 0.22, "sawtooth", 0.08);
  }

  // Keep boss grounded
  boss.y = yFloor - boss.h;

  // Clamp player inside boss arena (no escape)
  if (bossActive && !bossDefeated) {
    const minPX = x0 + player.w / 2;
    const maxPX = x1 - player.w / 2;
    if (player.x < minPX) { player.x = minPX; player.vx = Math.max(player.vx, 0); }
    if (player.x > maxPX) { player.x = maxPX; player.vx = Math.min(player.vx, 0); }
  }

  // Show Boss HP Bar
  if (bossActive) {
    // Managed in UI draw, checking bossActive flag
  }

  // Phase by HP
  const hpRatio = boss.hp / boss.maxHp;
  boss.phase = (hpRatio > 0.66) ? 1 : (hpRatio > 0.33) ? 2 : 3;

  // Bullets update
  for (const b of bossBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vy += 520 * dt; // gravity-ish
    b.ttl -= dt;
  }
  bossBullets = bossBullets.filter(b => b.ttl > 0 && b.y < yFloor + 400);

  // Slow zones update
  for (const z of slowZones) z.ttl -= dt;
  slowZones = slowZones.filter(z => z.ttl > 0);

  if (!bossActive) return;

  boss.t += dt;

  // BOSS MOVEMENT: Slowly track player horizontally
  const trackSpeed = 120 + boss.phase * 40; // BUFFED (was 80)
  const targetX = player.x;
  if (boss._charging <= 0) { // Only track when not charging
    if (boss.x < targetX - 30) boss.x += trackSpeed * dt;
    else if (boss.x > targetX + 30) boss.x -= trackSpeed * dt;
  }

  // Clamp boss in arena
  boss.x = clamp(boss.x, x0 + boss.w / 2, x1 - boss.w / 2);

  // Boss animation state with priority
  let bossAnim = "idle";

  if (boss.hp <= 0) {
    bossAnim = "death";
  } else if (boss.invuln > 0) {
    bossAnim = "hurt";
  } else if (boss._attackAnim > 0) {
    bossAnim = "attack";
  } else if (boss._charging > 0) {
    bossAnim = "attack";
  } else {
    bossAnim = "idle";
  }

  if (bossAnimator) {
    bossAnimator.setAnim(bossAnim);
    bossAnimator.update(dt);
    // Make boss face player
    bossAnimator.flipX = player.x < boss.x;
  }

  // Decay attack animation timer
  boss._attackAnim = Math.max(0, (boss._attackAnim || 0) - dt);

  // BOSS AI: Aimed shooting at player
  boss._shootTimer = (boss._shootTimer ?? 0) - dt;
  if (boss._shootTimer <= 0) {
    // Shoot frequency based on phase
    boss._shootTimer = (boss.phase === 1) ? 1.2 : (boss.phase === 2) ? 0.8 : 0.5;

    // Calculate aim direction towards player
    const dx = player.x - boss.x;
    const dy = (player.y - player.h / 2) - (boss.y + boss.h / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = 280 + boss.phase * 40; // Faster in later phases

    if (dist > 10) {
      const vx = (dx / dist) * speed;
      const vy = (dy / dist) * speed;
      bossBullets.push({
        x: boss.x,
        y: boss.y + boss.h / 2,
        vx: vx,
        vy: vy,
        r: 10,
        ttl: 4.0,
        kind: "aimed"
      });
      beep(400, 0.05, "square", 0.04);
      boss._attackAnim = 0.4; // Show attack animation
    }
  }

  // Spread shot in phase 2+
  boss._spreadTimer = (boss._spreadTimer ?? 2) - dt;
  if (boss.phase >= 2 && boss._spreadTimer <= 0) {
    boss._spreadTimer = 2.5;
    // Shoot 3-5 bullets in spread pattern
    const count = 3 + boss.phase;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI / count) * i + Math.PI / 2;
      const speed = 200;
      bossBullets.push({
        x: boss.x,
        y: boss.y + boss.h / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 8,
        ttl: 3.0,
        kind: "spread"
      });
    }
    beep(300, 0.08, "sawtooth", 0.05);
    boss._attackAnim = 0.5;
  }

  // Phase 2: Deadline charge
  boss._charge = (boss._charge ?? 0) - dt;
  if (boss.phase >= 2 && boss._charge <= 0) {
    boss._charge = 2.2;
    boss._charging = 0.8;
    boss._dir = (player.x < boss.x) ? -1 : 1;
    beep(160, 0.08, "sawtooth", 0.05);
  }
  if (boss._charging > 0) {
    boss._charging -= dt;
    boss.x += boss._dir * 480 * dt; // BUFFED (was 320)
    if (boss.x < x0 + boss.w / 2) boss.x = x0 + boss.w / 2;
    if (boss.x > x1 - boss.w / 2) boss.x = x1 - boss.w / 2;
  } else {
    // idle drift to center
    boss.x += ((x0 + x1) / 2 - boss.x) * dt * 0.6;
  }

  // Phase 3: Wifi weak zone
  if (boss.phase === 3 && boss._zone <= 0) {
    boss._zone = 2.4;
    const zx = x0 + Math.random() * (x1 - x0 - 4 * TILE);
    slowZones.push({ x: zx, y: yFloor - TILE, w: 4 * TILE, h: TILE, ttl: 2.0 });
    beep(90, 0.05, "triangle", 0.05);
  }

  // Player inside arena: optional camera clamp in updateCamera
  // Collision: boss damages player
  const pr = playerRect();
  const bx = boss.x - boss.w / 2;
  const by = boss.y;
  if (aabb2(pr.l, pr.t, pr.w, pr.h, bx, by, boss.w, boss.h)) {
    if (player.invuln <= 0) hurtPlayerByBoss("boss");
  }

  // Player attack boss: STOMP or Rolling
  const isStompHit = player.stomp && (player.vy > 0);
  const isRollingAttack = player.rolling && (Math.abs(player.vx) > 140);

  if ((isStompHit || isRollingAttack) && boss.invuln <= 0 && aabb2(pr.l, pr.t, pr.w, pr.h, bx - 20, by, boss.w + 40, boss.h)) {
    const damage = isStompHit ? 4 : 1; // Stomp = 4 damage
    boss.hp -= damage;
    boss.invuln = 0.4;

    // Visual feedback
    if (isStompHit) {
      player.vy = -600; // BOUNCE UP
      player.stomp = false;
      beep(1100, 0.08, "triangle", 0.06);
    } else {
      player.vx *= -0.5;
      player.vy = -380;
      beep(980, 0.06, "triangle", 0.05);
    }

    if (boss.hp <= 0) {
      boss.hp = 0;
      bossDefeated = true;
      bossActive = false;
      game.msg = "ĐẬU THI CUỐI KỲ! MỞ CỔNG!";
      beep(1200, 0.12, "triangle", 0.07);
      beep(1500, 0.12, "triangle", 0.07);
    }
  }

  // Bullets collision
  for (const b of bossBullets) {
    if (player.invuln > 0) continue;
    const hit = aabb2(pr.l, pr.t, pr.w, pr.h, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    if (hit) {
      b.ttl = 0;
      hurtPlayerByBoss(b.kind);
    }
  }

  // Slow zones effect
  for (const z of slowZones) {
    if (aabb2(pr.l, pr.t, pr.w, pr.h, z.x, z.y, z.w, z.h)) {
      // apply slow by scaling vx (soft) and limiting max run via updatePlayer maxRun scaling
      player.vx *= 0.92;
      game._slowed = 0.12; // short-lived flag
    }
  }
}


function drawBoss() {
  if (!boss) return;

  // Draw arena/bullets/zones first
  const x0 = boss.arena.x0Tx * TILE - cam.x;
  const x1 = (boss.arena.x1Tx + 1) * TILE - cam.x;
  const yFloor = (boss.arena.yFloorTy + 1) * TILE - cam.y;
  ctx.fillStyle = "rgba(255,80,40,0.08)";
  ctx.fillRect(x0, yFloor - 9 * TILE, x1 - x0, 9 * TILE);

  for (const z of slowZones) {
    const zx = z.x - cam.x;
    const zy = z.y - cam.y;
    ctx.fillStyle = "rgba(60,220,140,0.18)";
    ctx.fillRect(zx, zy, z.w, z.h);
  }

  for (const b of bossBullets) {
    const x = b.x - cam.x;
    const y = b.y - cam.y;
    ctx.fillStyle = "rgba(255,220,120,0.95)";
    ctx.beginPath();
    ctx.arc(x, y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw boss using animator (loaded with JSON config)
  if (bossAnimator && bossAnimator.sheet.ready) {
    // Flash when hurt
    if (boss.invuln > 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(boss.invuln * 20);
    }

    bossAnimator.draw(boss.x - cam.x, boss.y - cam.y);
    ctx.globalAlpha = 1;
  } else if (bossImg && BOSS_CONFIG) {
    // Fallback: use first idle frame from JSON
    const fr = BOSS_CONFIG.animations?.idle?.[0] || { x: 10, y: 8, w: 68, h: 70 };
    const scale = BOSS_CONFIG.meta?.scale || 1.4;
    const dw = fr.w * scale;
    const dh = fr.h * scale;
    const dx = (boss.x - cam.x) - dw / 2;
    const dy = (boss.y - cam.y) - dh;

    if (boss.invuln > 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(boss.invuln * 20);
    }

    ctx.drawImage(bossImg, fr.x, fr.y, fr.w, fr.h, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
  } else {
    // Final fallback: colored rect
    const bx = (boss.x - boss.w / 2) - cam.x;
    const by = boss.y - cam.y;
    ctx.fillStyle = bossDefeated ? "rgba(80,80,80,0.7)" : (boss.invuln > 0 ? "rgba(255,255,255,0.85)" : "rgba(255,90,90,0.95)");
    ctx.fillRect(bx, by, boss.w, boss.h);
  }

  // Label
  const bx = (boss.x - boss.w / 2) - cam.x;
  const by = boss.y - cam.y;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(bx, by - 18, boss.w, 16);
  ctx.fillStyle = "#fff";
  ctx.font = "12px system-ui";
  ctx.fillText("THI CUỐI KỲ", bx + 6, by - 6);
}

function updateHazards(dt) {
  // timers
  if (game.speedBoost > 0) game.speedBoost = Math.max(0, game.speedBoost - dt);
  if (game.doubleJump > 0) game.doubleJump = Math.max(0, game.doubleJump - dt);
  if (game.dashCD > 0) game.dashCD = Math.max(0, game.dashCD - dt);

  // mission timer
  if (!levelLoading && !game.won && !game.lost) {
    game.timeLeft = Math.max(0, game.timeLeft - dt);
    if (game.timeLeft <= 0) {
      game.lost = true;
      game.msg = "Trễ giờ điểm danh...";
      beep(90, 0.2, "sawtooth", 0.05);
    }
  }

  // hazards movement + collision
  const pr = playerRect();
  for (const h of hazards) {
    if (!h.alive) continue;
    h.x += h.vx * dt;
    if (h.x < h.minX) { h.x = h.minX; h.vx *= -1; }
    if (h.x > h.maxX) { h.x = h.maxX; h.vx *= -1; }

    const bx = h.x - h.w / 2;
    const by = h.y - h.h / 2;
    if (aabb(pr.l, pr.t, pr.w, pr.h, bx, by, h.w, h.h)) {
      hurtPlayer(h.type);
    }
  }

  // win condition
  if (level && !game.won && !game.lost) {
    const gx = level.goal.tx * TILE;
    const gy = level.goal.ty * TILE;
    const gw = (level.goal.wTiles || 2) * TILE;
    const gh = (level.goal.hTiles || 4) * TILE;
    if (aabb(pr.l, pr.t, pr.w, pr.h, gx, gy, gw, gh)) {
      // In boss levels, require boss defeat before allowing goal
      if (level.requireBossDefeat && !bossDefeated) {
        // ignore goal until boss is defeated
      } else {
        game.won = true;
        game.msg = (game.timeLeft > 0) ? "KỊP ĐIỂM DANH!" : "Tới nơi nhưng trễ...";

        if (levelIndex < LEVEL_FILES.length - 1) {
          // Chưa phải level cuối -> chuyển level sau 1.2s
          nextLevelCountdown = 1.2;
        } else {
          // ĐÂY LÀ LEVEL CUỐI -> TRIGGER VICTORY/ENDING sau 2s
          setTimeout(() => {
            // ===== TÍNH ĐIỂM =====
            game.totalPlayTime = (performance.now() - game.gameStartTime) / 1000; // Giây

            // Công thức tính điểm:
            // + 100 điểm mỗi coin
            // + Bonus thời gian (càng nhanh càng nhiều điểm)
            // + Bonus HP còn lại
            // - Trừ điểm mỗi lần chết
            const coinScore = game.coins * 100;
            const timeBonus = Math.max(0, Math.floor(3000 - game.totalPlayTime * 5)); // Max 3000 điểm nếu dưới 1 phút
            const hpBonus = Math.floor(game.hp) * 200;
            const deathPenalty = game.deathCount * 150;

            game.finalScore = Math.max(0, coinScore + timeBonus + hpBonus - deathPenalty + 1000); // +1000 base score cho việc hoàn thành

            game.victory = true;
            beep(523, 0.1, "triangle", 0.1);
            beep(659, 0.1, "triangle", 0.1);
            beep(784, 0.2, "triangle", 0.1);
          }, 2000);
        }
      }
      if (game.won) {
        beep(900, 0.12, "triangle", 0.06);
        beep(1200, 0.12, "triangle", 0.06);
      }
    }
  }
}

function drawPickupsAndHazards() {
  // pickups
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const p of pickups) {
    if (!p.alive) continue;
    const x = p.x - cam.x;
    const y = p.y - cam.y;
    // Render coin using JSON config animation
    if (p.type === "credit" && coinImg && COIN_CONFIG && COIN_CONFIG._spinFrames?.length) {
      // Animate coin using spin frames from JSON
      const frames = COIN_CONFIG._spinFrames;
      const fps = COIN_CONFIG.meta?.fps || 12;
      const frameIdx = Math.floor(coinAnimTime * fps) % frames.length;
      const fr = frames[frameIdx];

      // Scale to 32px (BIGGER)
      const size = 32;
      ctx.drawImage(
        coinImg,
        fr.x, fr.y, fr.w, fr.h,
        x - size / 2, y - size / 2, size, size
      );
    } else if (p.type === "credit" && coinImg) {
      // Fallback: just draw first frame area
      const size = 32;
      ctx.drawImage(coinImg, 50, 22, 81, 81, x - size / 2, y - size / 2, size, size);
    }
    // Skip non-credit pickups (no more colored circles)
  }
  // hazards - Use enemy sprite if available, otherwise colored boxes
  for (const h of hazards) {
    if (!h.alive) continue;
    const x = (h.x - cam.x) - h.w / 2;
    const y = (h.y - cam.y) - h.h / 2;

    // Try to draw with enemy sheet if available
    if (enemySheet && enemySheet.ready) {
      const fr = enemySheet.frames("walk")?.[0];
      if (fr) {
        ctx.drawImage(
          enemySheet.img,
          fr.x, fr.y, fr.w, fr.h,
          x, y, h.w, h.h
        );
        continue;
      }
    }

    // Fallback: simple danger indicator (not ugly red box)
    ctx.fillStyle = "rgba(180,60,60,0.7)";
    ctx.beginPath();
    ctx.arc(x + h.w / 2, y + h.h / 2, h.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,0,0,0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // goal zone marker (subtle)
  if (level) {
    const gx = level.goal.tx * TILE - cam.x;
    const gy = level.goal.ty * TILE - cam.y;
    const gw = (level.goal.wTiles || 2) * TILE;
    const gh = (level.goal.hTiles || 4) * TILE;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(gx, gy, gw, gh);
  }
  ctx.restore();
}



function drawCheckpoints() {
  // Use checkpoint sprite as GOAL DOOR at level end
  if (!checkpointImg) return;

  // Frame configs from checkpoint.sprite.json
  const idleFrame = { x: 36, y: 29, w: 75, h: 120 }; // Inactive door
  const activeFrames = [
    { x: 36, y: 231, w: 72, h: 117 },
    { x: 143, y: 231, w: 72, h: 117 },
    { x: 248, y: 231, w: 74, h: 117 },
    { x: 355, y: 231, w: 73, h: 117 },
    { x: 462, y: 231, w: 73, h: 117 },
    { x: 568, y: 231, w: 73, h: 117 }
  ];

  // Draw goal door at goal position
  if (level && level.goal) {
    const gx = level.goal.tx * TILE - cam.x;
    const gy = (level.goal.ty + level.goal.hTiles) * TILE - cam.y; // Bottom align

    // Animate if player is close or game won
    const playerClose = Math.abs(player.x - level.goal.tx * TILE) < TILE * 5;
    const isOpen = game.won || playerClose;

    let fr;
    if (isOpen) {
      // Animate opening door
      const frameIdx = Math.floor(coinAnimTime * 8) % activeFrames.length;
      fr = activeFrames[frameIdx];
    } else {
      fr = idleFrame;
    }

    // Draw scaled up
    const scale = 1.5;
    const dw = fr.w * scale;
    const dh = fr.h * scale;

    ctx.drawImage(
      checkpointImg,
      fr.x, fr.y, fr.w, fr.h,
      gx, gy - dh, dw, dh
    );
  }
}



// Spike Trap Logic
// Idle: safe, Acts as ground? (visual only for now, collision usually handled by map if we wanted it solid)
// Extend: hurts player
const TRAP_TIMING = { idle: 2.0, warn: 0.6, extend: 0.8, retract: 0.5 };

function updateTraps(dt) {
  const pr = playerRect();

  for (const t of traps) {
    t.timer += dt;

    // Use per-trap timing if available, else default
    let limit = t.tIdle || 2.0;
    if (t.state === "warn") limit = t.tWarn || 0.6;
    else if (t.state === "extend") limit = t.tActive || 0.8;
    else if (t.state === "retract") limit = t.tRetract || 0.5;

    if (t.timer >= limit) {
      t.timer = 0;
      if (t.state === "idle") t.state = "warn";
      else if (t.state === "warn") { t.state = "extend"; beep(100, 0.05, "sawtooth", 0.02); }
      else if (t.state === "extend") t.state = "retract";
      else if (t.state === "retract") t.state = "idle";
    }

    // Logic:
    // If Idle/Warn/Retract: It is "terrain" (safe).
    // If Extend: It hurts.

    // We can also make it "solid" when retracted if we want the player to stand on it.
    // For now, let's just implement the Damage logic when Extended.

    if (t.state === "extend") {
      // Hitbox is slightly smaller
      const tx = t.x - 12;
      const ty = t.y - 12; // Lower part only?
      const tw = 24;
      const th = 12;

      // Full spike height collision
      if (aabb(pr.l, pr.t, pr.w, pr.h, t.x - 14, t.y - 28, 28, 28)) {
        hurtPlayer("trap");
      }
    }
  }
}

function drawTraps() {
  if (!trapImg) return;
  // Assume generic spike sprite or 4 frames
  // Assuming 4 frames horizontal: Idle, Warn, Extend, Retract
  const fw = trapImg.width / 4;
  const fh = trapImg.height;

  for (const t of traps) {
    let fIdx = 0;
    if (t.state === "idle") fIdx = 0;
    else if (t.state === "warn") fIdx = 1;
    else if (t.state === "extend") fIdx = 2;
    else if (t.state === "retract") fIdx = 3;

    // Warn blink
    if (t.state === "warn" && Math.floor(t.timer * 10) % 2 === 0) {
      // blink effect
    }

    ctx.drawImage(trapImg, fIdx * fw, 0, fw, fh, t.x - fw / 2 - cam.x, t.y - fh - cam.y, fw, fh);
  }
}

function drawEnding() {
  const time = performance.now() / 1000; // Animation time

  if (!endingImg) {
    // Fallback
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.font = "40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BẠN ĐÃ CHIẾN THẮNG!", canvas.width / 2, canvas.height / 2);
    ctx.font = "24px sans-serif";
    ctx.fillText("Click để chơi lại", canvas.width / 2, canvas.height / 2 + 50);
  } else {
    // Vẽ ending image cover full screen
    const imgRatio = endingImg.width / endingImg.height;
    const canvasRatio = canvas.width / canvas.height;
    let drawW, drawH, drawX, drawY;

    if (imgRatio > canvasRatio) {
      drawH = canvas.height;
      drawW = drawH * imgRatio;
      drawX = (canvas.width - drawW) / 2;
      drawY = 0;
    } else {
      drawW = canvas.width;
      drawH = drawW / imgRatio;
      drawX = 0;
      drawY = (canvas.height - drawH) / 2;
    }

    ctx.drawImage(endingImg, drawX, drawY, drawW, drawH);

    // ===== HIỆU ỨNG GLOW PULSE TOÀN MÀN HÌNH =====
    const pulseIntensity = 0.06 + Math.sin(time * 2) * 0.03;
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0,
      canvas.width / 2, canvas.height / 2, canvas.width * 0.7
    );
    gradient.addColorStop(0, `rgba(255, 220, 100, ${pulseIntensity})`);
    gradient.addColorStop(0.6, `rgba(255, 180, 50, ${pulseIntensity * 0.3})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ===== PARTICLES LẤP LÁNH =====
    ctx.save();
    for (let i = 0; i < 25; i++) {
      const pt = time + i * 0.4;
      const px = (Math.sin(pt * 0.4 + i * 2.1) * 0.5 + 0.5) * canvas.width;
      const py = ((pt * 0.12 + i * 0.08) % 1.3 - 0.15) * canvas.height;
      const size = 1.5 + Math.sin(pt * 3.5 + i) * 1;
      const alpha = 0.25 + Math.sin(pt * 4.5 + i * 2.5) * 0.2;

      ctx.fillStyle = `rgba(255, 255, 220, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ===== HIỂN THỊ ĐIỂM SỐ VÀ THỜI GIAN =====
    ctx.save();

    // Panel background (góc trên bên trái)
    const panelX = 30;
    const panelY = 30;
    const panelW = 280;
    const panelH = 180;

    // Panel background với gradient
    const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    panelGrad.addColorStop(0, "rgba(0, 0, 0, 0.75)");
    panelGrad.addColorStop(1, "rgba(20, 20, 40, 0.85)");
    ctx.fillStyle = panelGrad;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 15);
    ctx.fill();

    // Border glow cho panel
    ctx.strokeStyle = `rgba(255, 200, 100, ${0.4 + Math.sin(time * 2) * 0.2})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Title
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 22px 'Segoe UI', system-ui";
    ctx.textAlign = "center";
    ctx.fillText("🏆 KẾT QUẢ", panelX + panelW / 2, panelY + 35);

    // Stats
    ctx.font = "18px 'Segoe UI', system-ui";
    ctx.textAlign = "left";

    // Thời gian
    const minutes = Math.floor(game.totalPlayTime / 60);
    const seconds = Math.floor(game.totalPlayTime % 60);
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    ctx.fillStyle = "#fff";
    ctx.fillText("⏱️ Thời gian:", panelX + 20, panelY + 65);
    ctx.fillStyle = "#7DFFFF";
    ctx.fillText(timeStr, panelX + 150, panelY + 65);

    // Coins
    ctx.fillStyle = "#fff";
    ctx.fillText("💰 Coins:", panelX + 20, panelY + 95);
    ctx.fillStyle = "#FFE066";
    ctx.fillText(`${game.coins}`, panelX + 150, panelY + 95);

    // Deaths
    ctx.fillStyle = "#fff";
    ctx.fillText("💀 Số lần chết:", panelX + 20, panelY + 125);
    ctx.fillStyle = game.deathCount === 0 ? "#7DFF7D" : "#FF6B6B";
    ctx.fillText(`${game.deathCount}`, panelX + 150, panelY + 125);

    // Final Score (big)
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 28px 'Segoe UI', system-ui";
    ctx.textAlign = "center";
    const scoreDisplay = game.finalScore.toLocaleString();
    ctx.fillText(`ĐIỂM: ${scoreDisplay}`, panelX + panelW / 2, panelY + 165);

    ctx.restore();
  }

  // ===== NÚT RESTART - Chỉ vẽ hiệu ứng shimmer, KHÔNG VẼ VIỀN =====
  const btnW = 180;
  const btnH = 50;
  const btnX = canvas.width - btnW - 30;
  const btnY = canvas.height - btnH - 20;

  // Shimmer effect chạy qua nút (không viền)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const shimmerPos = ((time * 0.6) % 2.5 - 0.5) * btnW * 1.5;
  const shimmerGrad = ctx.createLinearGradient(
    btnX + shimmerPos - 40, btnY,
    btnX + shimmerPos + 40, btnY
  );
  shimmerGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
  shimmerGrad.addColorStop(0.5, "rgba(255, 255, 200, 0.25)");
  shimmerGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = shimmerGrad;
  ctx.beginPath();
  ctx.roundRect(btnX, btnY, btnW, btnH, 8);
  ctx.fill();
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (game.victory) {
    drawEnding();
    return;
  }

  // Background image (fallback to dots if not loaded)
  const hasBg = drawBackground();
  if (!hasBg) {
    // background dots
    ctx.fillStyle = "rgba(255,255,255,.05)";
    for (let i = 0; i < 60; i++) {
      const x = ((i * 211 + performance.now() * 0.02) % (canvas.width + 200)) - 100;
      const y = (i * 97) % canvas.height;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  drawMap();
  drawCheckpoints(); // Added
  drawTraps(); // Added
  drawPickupsAndHazards();
  drawBoss();

  // Enemy under/over? draw enemy first then player
  drawEnemies();

  animator.draw(player.x - cam.x, player.y - cam.y);

  drawDebug();
  drawHUD();
}

// ---------- Load player sprite via UI ----------
async function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function loadImageFromFile(file) {
  const url = await fileToDataURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
async function loadJSONFromFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

UI.applyBtn?.addEventListener("click", async () => {
  try {
    const imgFile = UI.spriteFile.files?.[0];
    const cfgFile = UI.configFile.files?.[0];
    if (!imgFile || !cfgFile) { alert("Chọn PNG và JSON trước."); return; }
    const [img, cfg] = await Promise.all([loadImageFromFile(imgFile), loadJSONFromFile(cfgFile)]);
    sheet.set(img, cfg);
    animator.setAnim("idle");
  } catch (e) {
    console.error(e);
    alert("Load player sprite/config lỗi. Mở console (F12) để xem.");
  }
});

// ---------- Auto-load assets ----------
async function tryAutoLoadPlayer() {
  console.log("[PLAYER] Attempting to load player sprite...");

  // Try loading NEW sprite with JSON config
  try {
    const [imgRes, cfgRes] = await Promise.all([
      loadAsset(ASSETS.player.newPng, null),
      fetch(ASSETS.player.newJson, { cache: "no-store" })
    ]);

    if (imgRes.img && cfgRes.ok) {
      const cfg = await cfgRes.json();
      console.log("[PLAYER] Loaded NEW player with JSON config!");

      // Apply scale adjustment for game (80px target height - BIGGER)
      const firstFrame = cfg.animations?.idle?.[0];
      if (firstFrame) {
        const targetHeight = 80;
        const calculatedScale = targetHeight / firstFrame.h;
        cfg.meta.scale = calculatedScale;
        console.log("[PLAYER] Adjusted scale:", calculatedScale.toFixed(2));
      }

      sheet.set(imgRes.img, cfg);
      animator.setAnim("idle");
      console.log("[PLAYER] New sprite configured successfully!");
      return;
    }
  } catch (e) {
    console.log("[PLAYER] New sprite/config not found, trying legacy...", e);
  }

  // Fallback to legacy
  try {
    const cfg = await fetch(ASSETS.player.oldJson, { cache: "no-store" }).then(r => {
      if (!r.ok) throw new Error("no cfg");
      return r.json();
    });
    const imgs = await loadAsset(null, ASSETS.player.oldPng);
    if (imgs.img) {
      console.log("[PLAYER] Using legacy sprite");
      sheet.set(imgs.img, cfg);
      animator.setAnim("idle");
    }
  } catch (e) {
    console.error("[PLAYER] All sprite loading failed:", e);
  }
}



async function loadEndingAssets() {
  try {
    const res = await loadAsset(ASSETS.ending.png, null);
    endingImg = res.img;
    console.log("[ASSETS] Ending image loaded");
  } catch (e) {
    console.error("[ASSETS] Ending load failed", e);
  }
}

async function initEnemy() {
  try {
    enemySheet = await loadSpriteByPath("./assets/enemies/vitichphan_monster.png", "./assets/enemies/vitichphan_monster.sprite.json");
    const e = {
      x: 760,
      y: 16 * TILE - 1,   // feet on ground (offset to avoid boundary stick)
      vx: 90,
      vy: 0,
      w: 26,
      h: 26,
      facing: -1,
      onGround: false,
      sheet: enemySheet,
      anim: new Animator(enemySheet),
      alive: true,
      invuln: 0,
      minX: 640,
      maxX: 880
    };
    e.anim.setAnim("walk");
    enemies.push(e);
  } catch (e) {
    console.warn("Enemy load failed", e);
  }
}



async function boot() {
  await Promise.all([
    tryAutoLoadPlayer(),
    loadBg(),
    loadTiles(),
    loadUIIcons(),
    loadOtherAssets(),
    loadEndingAssets(),
    initEnemy(),
    loadLevel(levelPath(levelIndex))
  ]);
  resetGame();
  last = performance.now();
  requestAnimationFrame(loop);
}

boot();

// ---------- Game Loop ----------
var last = performance.now();
let fpsAccT = 0, fpsAccN = 0;

function loop(now) {
  const dt = clamp((now - last) / 1000, 0, 1 / 20);
  last = now;

  // Update coin animation timer
  coinAnimTime += dt;

  // fps estimate
  fpsAccT += dt;
  fpsAccN += 1;
  if (fpsAccT >= 0.5) {
    FPS = Math.round(fpsAccN / fpsAccT);
    fpsAccT = 0;
    fpsAccN = 0;
  }

  if (pressed("KeyR")) { nextLevelCountdown = -1; startLevel(levelIndex, { newRun: false }).then(() => { }); }
  if (pressed("F2")) DEBUG = !DEBUG;

  if (!levelLoading && !game.won && !game.lost) {
    updatePlayer(dt);
    updateEnemies(dt);
  }
  if (!levelLoading) {
    updatePickups();
    updateHazards(dt);
    updateTraps(dt); // Added
    updateBoss(dt);
    updateCamera(dt);
  }


  // auto-advance to next level after a short win banner
  if (nextLevelCountdown >= 0) {
    nextLevelCountdown -= dt;
    if (nextLevelCountdown <= 0 && !levelLoading) {
      nextLevelCountdown = -1;
      if (levelIndex < LEVEL_FILES.length - 1) {
        // carry over credits/DRL but reset combat stats
        startLevel(levelIndex + 1, { newRun: false }).then(() => { });
      } else {
        // VICTORY - All levels cleared
        game.victory = true;
        beep(523, 0.1, "triangle", 0.1);
        beep(659, 0.1, "triangle", 0.1);
        beep(784, 0.2, "triangle", 0.1);
      }
    }
  }
  render();

  requestAnimationFrame(loop);
}
// boot() starts the loop
