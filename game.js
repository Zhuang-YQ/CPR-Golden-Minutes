/* ============================================================
 * 黄金四分钟 · 心肺复苏节拍训练游戏
 * 逻辑与渲染分离：CPRGame / classifyInterval / computeScore
 * 可被 node 无头测试（test-cpr.js）
 * 作者：庄喻晴 · AI 协作开发 · 2026-11
 * ============================================================ */

var CONFIG = {
  tutorialMode: true,          // 教学模式开关
  BPM: 110,                    // 节拍器频率
  METRO_INTERVAL: 545,         // 60000/110 ≈ 545ms
  STEP: 1000 / 60,             // 固定步长
  // 按压间隔判定（毫秒）
  PERFECT_MIN: 500, PERFECT_MAX: 600,   // 100~120 次/分
  GOOD_MIN: 420, GOOD_MAX: 680,
  // 吹气判定（按住 B 的时长）
  BLOW_MIN: 800, BLOW_MAX: 1200,
  // 反应判定
  P1_TARGET_MS: 3000,
  // 循环
  ROUNDS: 2, PRESSES_PER_ROUND: 30, BLOWS_PER_ROUND: 2,
  // AED 正确顺序
  AED_SEQ: ['Enter', '1', '2', 'Space'],
};

var PALETTE = {
  bg0: '#0d0f16', bg1: '#151824', bg2: '#1c2030',
  panel: '#1d2130', panelHi: '#252a3d', line: '#2e3448', lineHi: '#3d4460',
  text: '#eef1f7', dim: '#8a90a3', faint: '#565c70',
  red: '#ff3b30', redDeep: '#b3170f', redDark: '#7a1008',
  green: '#3ddc84', greenDark: '#1d9e57',
  gold: '#ffd75e', goldDark: '#c99a17',
  blue: '#4c9aff', blueDark: '#1d4f99',
  white: '#ffffff',
  ecg: '#39ff88', ecgDim: 'rgba(57,255,136,.25)',
};

/* ---------- 纯函数：节拍判定（可测） ---------- */
function classifyInterval(ms) {
  if (ms >= CONFIG.PERFECT_MIN && ms <= CONFIG.PERFECT_MAX) return 'PERFECT';
  if (ms >= CONFIG.GOOD_MIN && ms <= CONFIG.GOOD_MAX) return 'GOOD';
  return 'MISS';
}

/* ---------- 纯函数：评分（可测） ---------- */
// res = { perfect, good, miss, p2Correct, aedErrors, blowValid, p1Ms }
function computeScore(res) {
  var rhythm = res.perfect * 2 + res.good * 1;                              // 满分 120
  var flow = (res.p2Correct ? 10 : 0) + (res.aedErrors === 0 ? 10 : 0) + 10; // 满分 30
  var blow = res.blowValid * 5;                                             // 满分 20
  var reaction = Math.max(0, 30 - Math.floor(Math.max(0, res.p1Ms - CONFIG.P1_TARGET_MS) / 1000) * 5);
  var total = rhythm + flow + blow + reaction;
  var grade = total >= 180 ? 'S' : total >= 150 ? 'A' : total >= 120 ? 'B' : 'C';
  return { rhythm: rhythm, flow: flow, blow: blow, reaction: reaction,
           total: total, grade: grade };
}

/* ---------- 游戏逻辑（状态机，可无头驱动） ---------- */
function CPRGame() { this.reset(); }

CPRGame.prototype.reset = function () {
  this.phase = 'TITLE';
  this.clock = 0;
  this.round = 1;
  this.judgments = [];
  this.pressCount = 0;
  this.lastPressAt = null;
  this.blowCount = 0;
  this.blowStart = null;
  this.blowValid = 0;
  this.blowDurs = [];
  this.p1Presses = 0;
  this.p1Ms = null;
  this.p2Correct = false;
  this.p2Choice = null;
  this.aedStep = 0;
  this.aedErrors = 0;
  this.flash = null;
  this.hint = '';
  this.beatPulse = 0;
  this.result = null;
  this._setHint();
};

CPRGame.prototype._setHint = function () {
  if (!CONFIG.tutorialMode) { this.hint = ''; return; }
  var h = {
    TITLE: '按 Enter 开始（手机：点屏幕下方按钮）',
    P1: '真实急救：拍打双肩、大声呼唤，确认有无反应。快速！黄金时间不等人。',
    P2: '真实急救：指定具体的人打 120、取 AED，施救者不能离开伤员。',
    P3: '真实急救：按压频率 100~120 次/分。跟着节拍按空格，节奏准才有效！',
    P4: '真实急救：按压 30 次后吹气 2 次，每次约 1 秒，看到胸廓起伏即可。',
    P5: '真实急救：AED 全程语音提示——开机、贴片、分析电击时任何人不得接触患者。',
    RESULT: '按 R 重新挑战 · 建议每 1~2 年复训一次',
  };
  this.hint = h[this.phase] || '';
};

CPRGame.prototype._flash = function (text, kind) {
  this.flash = { text: text, kind: kind, at: this.clock };
};

CPRGame.prototype._enterPhase = function (p) {
  if (p === 'P3') {
    if (this.phase === 'P4') this.round++;
    this.pressCount = 0;
    this.lastPressAt = null;
  }
  this.phase = p;
  this.clock = 0;
  this._setHint();
};

CPRGame.prototype.handleKey = function (key, ts, isDown) {
  if (isDown === undefined) isDown = true;
  var t = (ts === undefined) ? this.clock : ts;

  if (!isDown) {                      // ---- keyup ----
    if (key === 'B' && this.phase === 'P4' && this.blowStart !== null) {
      var dur = t - this.blowStart;
      this.blowStart = null;
      this.blowDurs.push(dur);
      this.blowCount++;
      if (dur >= CONFIG.BLOW_MIN && dur <= CONFIG.BLOW_MAX) {
        this.blowValid++;
        this._flash('吹气有效', 'good');
      } else {
        this._flash(dur < CONFIG.BLOW_MIN ? '太快了' : '吹太久了', 'miss');
      }
      if (this.blowCount >= CONFIG.ROUNDS * CONFIG.BLOWS_PER_ROUND) {
        this._enterPhase('P5');
      } else if (this.blowCount >= this.round * CONFIG.BLOWS_PER_ROUND) {
        this._enterPhase('P3');
      }
    }
    return;
  }

  // ---- keydown ----
  if (this.phase === 'TITLE') {
    if (key === 'Enter') this._enterPhase('P1');
    return;
  }
  if (this.phase === 'RESULT') {
    if (key === 'R') this.reset();
    return;
  }
  if (this.phase === 'P1') {
    if (key === 'F') {
      this.p1Presses++;
      if (this.p1Presses >= 3) {
        this.p1Ms = this.clock;
        this._flash('无反应！立即呼救', 'good');
        this._enterPhase('P2');
      }
    }
    return;
  }
  if (this.phase === 'P2') {
    if (key === '1' || key === '2') {
      this.p2Choice = key;
      this.p2Correct = (key === '2');
      this._flash(this.p2Correct ? '正确！自己留下按压' : '不能离开伤员！', this.p2Correct ? 'good' : 'miss');
      this._enterPhase('P3');
    }
    return;
  }
  if (this.phase === 'P3') {
    if (key === 'Space') {
      if (this.lastPressAt === null) {
        this.judgments.push('PERFECT');
        this._flash('基准拍', 'good');
      } else {
        var j = classifyInterval(t - this.lastPressAt);
        this.judgments.push(j);
        this._flash(j === 'PERFECT' ? 'PERFECT' : j === 'GOOD' ? 'GOOD' : '偏了！',
                    j === 'MISS' ? 'miss' : 'good');
      }
      this.lastPressAt = t;
      this.pressCount++;
      if (this.pressCount >= CONFIG.PRESSES_PER_ROUND) {
        this._enterPhase('P4');
      }
    }
    return;
  }
  if (this.phase === 'P4') {
    if (key === 'B' && this.blowStart === null) this.blowStart = t;
    return;
  }
  if (this.phase === 'P5') {
    var want = CONFIG.AED_SEQ[this.aedStep];
    if (key === want) {
      this.aedStep++;
      if (this.aedStep >= CONFIG.AED_SEQ.length) {
        this._buildResult();
      } else {
        this._flash('√', 'good');
      }
    } else if (CONFIG.AED_SEQ.indexOf(key) !== -1) {
      this.aedErrors++;
      this._flash('顺序错了！重做这一步', 'miss');
    }
    return;
  }
};

CPRGame.prototype._buildResult = function () {
  var perfect = 0, good = 0, miss = 0;
  for (var i = 0; i < this.judgments.length; i++) {
    var j = this.judgments[i];
    if (j === 'PERFECT') perfect++; else if (j === 'GOOD') good++; else miss++;
  }
  var res = {
    perfect: perfect, good: good, miss: miss,
    p2Correct: this.p2Correct, aedErrors: this.aedErrors,
    blowValid: this.blowValid, p1Ms: this.p1Ms === null ? 9999 : this.p1Ms,
    blowDurs: this.blowDurs.slice(),
  };
  res.score = computeScore(res);
  this.result = res;
  this._enterPhase('RESULT');
};

CPRGame.prototype.update = function (dt) {
  this.clock += dt;
  if (this.flash && this.clock - this.flash.at > 700) this.flash = null;
  if (this.phase === 'P3') {
    this.beatPulse = (this.clock % CONFIG.METRO_INTERVAL) / CONFIG.METRO_INTERVAL;
  }
};

/* ============================================================
 * 渲染层（浏览器专用）—— 逻辑层之上，不含任何游戏规则
 * ============================================================ */
if (typeof window !== 'undefined' && typeof document !== 'undefined') {

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var game = new CPRGame();
  var W = 480, H = 320;
  /* 高清渲染：内部按 2 倍（高分屏按设备像素比）绘制，逻辑坐标仍是 480×320 */
  var SCALE = Math.max(2, window.devicePixelRatio || 1);
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

  /* ---------- 节拍音（振荡器，无音频文件） ---------- */
  var audioCtx = null;
  function beep(freq, dur, vol) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq || 880; o.type = 'square';
      g.gain.value = vol || 0.06;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + (dur || 0.05));
    } catch (e) { /* 忽略 */ }
  }
  var metroTimer = null;
  function startMetro() { stopMetro(); metroTimer = setInterval(function(){ beep(880,0.05,0.06); }, CONFIG.METRO_INTERVAL); beep(880,0.05,0.06); }
  function stopMetro() { if (metroTimer) { clearInterval(metroTimer); metroTimer = null; } }

  var KEYMAP = { 'Enter': 'Enter', 'f': 'F', 'F': 'F', ' ': 'Space',
                 'b': 'B', 'B': 'B', '1': '1', '2': '2', 'r': 'R', 'R': 'R' };
  /* 物理键盘与触屏按键共用同一条分发路径，保证行为完全一致 */
  function dispatchKey(k, isDown) {
    var before = game.phase;
    game.handleKey(k, performance.now(), isDown);
    if (isDown && (k === 'F' || k === 'Enter' || k === '1' || k === '2' || k === 'Space')) beep(660, 0.03, 0.03);
    if (game.phase === 'P3' && before !== 'P3') startMetro();
    if (before === 'P3' && game.phase !== 'P3') stopMetro();
  }
  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var k = KEYMAP[e.key];
    if (!k) return;
    e.preventDefault();
    dispatchKey(k, true);
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'b' || e.key === 'B') dispatchKey('B', false);
  });

  /* ---------- 触屏虚拟按键（手机 / 平板） ---------- */
  var touchBar = document.getElementById('touchbar');
  var IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  var tbtns = touchBar ? touchBar.querySelectorAll('.tbtn') : [];
  /* 各阶段需要亮出的按键：随流程自动切换 */
  var PHASE_KEYS = {
    TITLE:  ['Enter'],
    P1:     ['F'],
    P2:     ['1', '2'],
    P3:     ['Space'],
    P4:     ['B'],
    P5:     ['Enter', '1', '2', 'Space'],
    RESULT: ['R']
  };
  if (IS_TOUCH && touchBar) {
    document.body.classList.add('touch');
    Array.prototype.forEach.call(tbtns, function (btn) {
      var k = btn.getAttribute('data-key');
      function down(e) { if (e) e.preventDefault(); btn.classList.add('active'); dispatchKey(k, true); }
      function up(e)   { if (e) e.preventDefault(); btn.classList.remove('active'); dispatchKey(k, false); }
      btn.addEventListener('touchstart',  down, { passive: false });
      btn.addEventListener('touchend',    up,   { passive: false });
      btn.addEventListener('touchcancel', up,   { passive: false });
      /* 兼容触屏笔电 / 模拟器上的鼠标点击 */
      btn.addEventListener('mousedown',  down);
      btn.addEventListener('mouseup',    up);
      btn.addEventListener('mouseleave', up);
    });
  }
  var lastPhase = null;
  function updateTouchbar() {
    if (!IS_TOUCH || !touchBar) return;
    var keys = PHASE_KEYS[game.phase] || [];
    Array.prototype.forEach.call(tbtns, function (btn) {
      btn.style.display = keys.indexOf(btn.getAttribute('data-key')) !== -1 ? '' : 'none';
    });
  }

  /* ---------- 通用绘制工具 ---------- */
  function rr(x, y, w, h, r) {           // 圆角矩形路径
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function panel(x, y, w, h, fill, border) {
    rr(x, y, w, h, 8);
    ctx.fillStyle = fill || PALETTE.panel;
    ctx.fill();
    ctx.strokeStyle = border || PALETTE.line;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  function txt(t, x, y, size, color, align, bold, noShadow) {
    ctx.font = (bold === undefined ? true : bold) ? 'bold ' : '';
    ctx.font += size + 'px "Microsoft YaHei", sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'alphabetic';
    if (!noShadow) {
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fillText(t, x + 1, y + 1);
    }
    ctx.fillStyle = color;
    ctx.fillText(t, x, y);
  }
  function keycap(x, y, label, active) {  // 键帽
    var w = 46, h = 26;
    rr(x - w / 2, y - h / 2, w, h, 5);
    ctx.fillStyle = active ? PALETTE.gold : PALETTE.panelHi;
    ctx.fill();
    ctx.strokeStyle = active ? PALETTE.goldDark : PALETTE.lineHi;
    ctx.lineWidth = 1;
    ctx.stroke();
    txt(label, x, y + 4, 12, active ? '#3a2c00' : PALETTE.text, 'center', true, true);
  }
  function bar(x, y, w, h, ratio, fill, bg) {
    rr(x, y, w, h, h / 2);
    ctx.fillStyle = bg || PALETTE.bg2;
    ctx.fill();
    if (ratio > 0) {
      rr(x, y, Math.max(h, w * Math.min(1, ratio)), h, h / 2);
      ctx.fillStyle = fill;
      ctx.fill();
    }
  }
  function bg() {                          // 背景：渐变 + 网格 + 暗角
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PALETTE.bg1);
    g.addColorStop(1, PALETTE.bg0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.025)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 24) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy < H; gy += 24) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    var v = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 340);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }
  function ecg(y, amp, speed, color, alpha) {  // 滚动心电图
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    var t0 = Date.now() / (1000 / (speed || 1)) % 4;
    for (var x = 0; x <= W; x += 2) {
      var ph = ((x / W) * 4 + t0) % 4;          // 4 秒一个周期
      var v = 0;
      if (ph < 0.06) v = 0;                     // 等电位
      else if (ph < 0.10) v = 0.18;             // P 波
      else if (ph < 0.16) v = -0.05;
      else if (ph < 0.19) v = 1;                // R 尖峰
      else if (ph < 0.23) v = -0.35;            // S 谷
      else if (ph < 0.34) v = 0.28;             // T 波
      else v = 0;
      var yy = y - v * amp;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.restore();
  }
  function chip(t, x, y, color) {              // 小标签胶囊
    ctx.font = 'bold 11px "Microsoft YaHei", sans-serif';
    var w = ctx.measureText(t).width + 18;
    rr(x - w / 2, y - 11, w, 22, 11);
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(t, x, y + 4);
    return w;
  }

  /* ---------- 粒子（渲染层专用） ---------- */
  var particles = [];
  function spawnBurst(x, y, color, n) {
    for (var i = 0; i < (n || 10); i++) {
      var a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
                       life: 1, color: color, size: 2 + Math.random() * 2 });
    }
  }
  function drawParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt / 16; p.y += p.vy * dt / 16;
      p.vy += 0.08 * dt / 16; p.life -= 0.02 * dt / 16;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }
  }
  var prevJudg = 0;
  var comboBest = 0;          // 本局最佳连准（渲染层统计，不参与评分）
  var toast = null;           // 里程碑鼓励飘字 {at, text}
  var prevPress = 0;

  /* ---------- 各阶段画面 ---------- */
  function drawTitle() {
    ecg(140, 34, 1.2, PALETTE.ecg, .9);
    // 心跳圆点扫过
    var t0 = Date.now() / (1000 / 1.2) % 4 / 4;
    txt('黄金四分钟', W / 2, 84, 42, PALETTE.red, 'center');
    ctx.save(); ctx.globalAlpha = .9;
    txt('CPR · 心肺复苏节拍训练游戏', W / 2, 112, 14, PALETTE.text);
    ctx.restore();
    txt('怎么玩：跟着屏幕提示，依次完成 5 步急救，把伤员救回来', W / 2, 136, 11.5, PALETTE.text);
    txt('电脑按键盘 · 手机点屏幕下方按钮', W / 2, 152, 10, PALETTE.dim, 'center', false);
    txt('心脏骤停后，每延迟 1 分钟，存活率下降 7%~10%', W / 2, 172, 11.5, PALETTE.dim);
    // 三步口诀
    var steps = [['叫', '判断 · 呼救', '3 秒内完成'], ['压', '按压 100~120', '每轮 30 次'], ['电', 'AED 除颤', '开机→贴片→电击']];
    for (var i = 0; i < 3; i++) {
      var x = W / 2 - 132 + i * 132;
      panel(x, 186, 108, 52, PALETTE.panel, PALETTE.line);
      ctx.beginPath(); ctx.arc(x + 30, 212, 15, 0, Math.PI * 2);
      ctx.fillStyle = [PALETTE.blue, PALETTE.red, PALETTE.gold][i];
      ctx.fill();
      txt(steps[i][0], x + 30, 217, 16, PALETTE.white);
      txt(steps[i][1], x + 74, 209, 10, PALETTE.text, 'center');
      txt(steps[i][2], x + 74, 224, 8.5, PALETTE.dim, 'center', false);
    }
    var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 350);
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    keycap(W / 2 - 34, 262, 'Enter', true);
    txt('开始', W / 2 + 16, 267, 14, PALETTE.gold, 'center');
    ctx.globalAlpha = 1;
  }

  function drawPatient(x, y, breathe) {   // 伤员（平躺）
    ctx.save();
    ctx.fillStyle = PALETTE.bg2;
    ctx.fillRect(x - 84, y, 168, 14);                       // 地面阴影
    ctx.fillStyle = PALETTE.panelHi;
    rr(x - 76, y - 16, 152, 16, 8); ctx.fill();             // 身体
    ctx.strokeStyle = PALETTE.lineHi; ctx.stroke();
    var lift = breathe ? Math.sin(Date.now() / 150) * 2 : 0;
    ctx.beginPath(); ctx.arc(x - 88, y - 12, 13, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.redDeep; ctx.fill();            // 头
    ctx.strokeStyle = PALETTE.lineHi; ctx.stroke();
    ctx.strokeStyle = PALETTE.faint;
    ctx.beginPath(); ctx.moveTo(x - 60, y - 14); ctx.lineTo(x - 30, y - 14 - lift); ctx.stroke(); // 胸线
    ctx.restore();
  }

  function drawP1() {
    txt('① 判断意识', W / 2, 56, 21, PALETTE.text);
    drawPatient(W / 2 + 20, 150, false);
    // 计时条：3 秒内完成
    var ratio = Math.max(0, 1 - game.clock / 3000);
    var col = ratio > 0.4 ? PALETTE.green : PALETTE.red;
    bar(140, 96, 200, 10, ratio, col);
    txt('黄金时间', 100, 104, 10.5, PALETTE.dim, 'right');
    txt('拍打双肩 · 大声呼唤', W / 2, 186, 13, PALETTE.text);
    for (var i = 0; i < 3; i++) {
      var on = i < game.p1Presses;
      ctx.beginPath(); ctx.arc(W / 2 - 32 + i * 32, 216, 9, 0, Math.PI * 2);
      ctx.fillStyle = on ? PALETTE.green : PALETTE.bg2; ctx.fill();
      ctx.strokeStyle = on ? PALETTE.greenDark : PALETTE.lineHi; ctx.stroke();
    }
    keycap(W / 2 - 30, 254, 'F ×3', game.phase === 'P1');
    txt('连按三次', W / 2 + 24, 259, 12.5, PALETTE.gold);
  }

  function drawP2() {
    txt('② 呼救', W / 2, 56, 21, PALETTE.text);
    drawPatient(W / 2 + 20, 150, false);
    txt('现场只有你和一个路人。谁去打 120、取 AED？', W / 2, 190, 12, PALETTE.text);
    var opts = [
      { k: '1', t: '自己跑去打电话', sub: '伤员无人照看', x: 118, bad: true },
      { k: '2', t: '指定路人打 120 / 取 AED', sub: '自己留下按压', x: 362, bad: false },
    ];
    for (var i = 0; i < 2; i++) {
      var o = opts[i];
      var chosen = game.p2Choice === o.k;
      panel(o.x - 92, 208, 184, 56, chosen ? (o.bad ? 'rgba(255,59,48,.12)' : 'rgba(61,220,132,.10)') : PALETTE.panel,
            chosen ? (o.bad ? PALETTE.red : PALETTE.green) : PALETTE.line);
      txt('[' + o.k + '] ' + o.t, o.x, 230, 12, chosen ? (o.bad ? PALETTE.red : PALETTE.green) : PALETTE.text);
      txt(o.sub, o.x, 250, 10, PALETTE.dim, 'center', false);
    }
  }

  function drawP3() {
    txt('③ 胸外按压', W / 2, 48, 21, PALETTE.text);
    ecg(70, 18, 2.2, PALETTE.ecgDim, .8);                    // 顶部弱 ECG
    // 心跳
    var p = 1 - game.beatPulse;
    var cx = W / 2, cy = 128;
    ctx.save();
    ctx.shadowColor = PALETTE.red; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(cx, cy, 30 + 8 * p, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.redDeep; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, 18 + 8 * p, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.red; ctx.fill();
    txt('♥', cx, cy + 8, 24, PALETTE.white);
    // 判定统计
    var pf = 0, gd = 0, ms = 0;
    for (var i = 0; i < game.judgments.length; i++) {
      if (game.judgments[i] === 'PERFECT') pf++;
      else if (game.judgments[i] === 'GOOD') gd++; else ms++;
    }
    txt('PERFECT ' + pf + '   GOOD ' + gd + '   偏差 ' + ms, cx, 168, 10.5, PALETTE.dim, 'center', false);
    // 连准计数（连续 PERFECT）：≥3 时金色跳动显示
    var combo = 0;
    for (var ci = game.judgments.length - 1; ci >= 0; ci--) {
      if (game.judgments[ci] === 'PERFECT') combo++; else break;
    }
    if (combo > comboBest) comboBest = combo;
    if (combo >= 3) {
      var cpulse = 0.5 + 0.5 * Math.sin(Date.now() / 180);
      ctx.save();
      ctx.globalAlpha = 0.7 + 0.3 * cpulse;
      txt('连准 ×' + combo, cx + 96, cy - 40, 13, PALETTE.gold);
      ctx.restore();
      if (combo % 5 === 0 && game.judgments.length !== prevJudg) spawnBurst(cx, cy, PALETTE.gold, 18);
    }
    // 里程碑鼓励：每 10 次按压飘字
    if (game.pressCount !== prevPress) {
      if (game.pressCount > 0 && game.pressCount % 10 === 0 && game.pressCount < CONFIG.PRESSES_PER_ROUND) {
        toast = { at: game.clock, text: game.pressCount + ' 次 · 节奏稳，继续！' };
      }
      prevPress = game.pressCount;
    }
    if (toast && game.clock - toast.at < 900) {
      ctx.globalAlpha = Math.min(1, (900 - (game.clock - toast.at)) / 300);
      txt(toast.text, W / 2, 72, 12.5, PALETTE.gold);
      ctx.globalAlpha = 1;
    }
    // 分段进度（30 格）
    var total = CONFIG.PRESSES_PER_ROUND, done = game.pressCount;
    for (var s = 0; s < total; s++) {
      var sx = 90 + s * (300 / total);
      ctx.fillStyle = s < done ? PALETTE.green : PALETTE.bg2;
      ctx.fillRect(sx, 182, 300 / total - 2, 12);
    }
    txt(done + ' / ' + total + ' 次', cx, 214, 13, PALETTE.text);
    txt('跟着哔声节拍按', cx, 246, 12.5, PALETTE.dim, 'center', false);
    keycap(cx - 22, 262, '空格', true);
    // 判定飘字（带缩放动画）
    if (game.judgments.length && game.flash) {
      var f = game.flash;
      var scale = 1 + Math.max(0, 1 - (game.clock - f.at) / 200) * 0.6;
      ctx.save();
      ctx.translate(cx + 96, cy - 18);
      ctx.scale(scale, scale);
      var lj = game.judgments[game.judgments.length - 1];
      var col = lj === 'PERFECT' ? PALETTE.green : lj === 'GOOD' ? PALETTE.blue : PALETTE.red;
      txt(lj, 0, 0, 13, col);
      ctx.restore();
    }
    // 判定变化时喷粒子
    if (game.judgments.length !== prevJudg) {
      var j = game.judgments[game.judgments.length - 1];
      var c = j === 'PERFECT' ? PALETTE.green : j === 'GOOD' ? PALETTE.blue : PALETTE.red;
      spawnBurst(cx, cy, c, j === 'MISS' ? 5 : 12);
      prevJudg = game.judgments.length;
    }
  }

  function drawP4() {
    txt('④ 人工呼吸', W / 2, 48, 21, PALETTE.text);
    txt('仰头抬颏 · 捏鼻 · 缓慢吹气 1 秒', W / 2, 82, 12.5, PALETTE.dim);
    drawPatient(W / 2 + 20, 130, game.blowStart !== null);
    // 吹气表
    var fill = game.blowStart === null ? 0 : Math.min(1, (performance.now() - game.blowStart) / 1500);
    var bx = 120, bw = 240, by = 170, bh = 26;
    rr(bx, by, bw, bh, 13);
    ctx.fillStyle = PALETTE.bg2; ctx.fill();
    ctx.strokeStyle = PALETTE.line; ctx.stroke();
    var z0 = bx + bw * 0.533, z1 = bx + bw * 0.8;            // 0.8~1.2s 绿色区间
    ctx.fillStyle = 'rgba(61,220,132,.25)';
    ctx.fillRect(z0, by + 2, z1 - z0, bh - 4);
    ctx.strokeStyle = PALETTE.greenDark;
    ctx.strokeRect(z0, by + 2, z1 - z0, bh - 4);
    if (fill > 0) {
      rr(bx + 2, by + 2, Math.max(bh - 4, (bw - 4) * fill), bh - 4, 10);
      var inZone = fill >= 0.533 && fill <= 0.8;
      ctx.fillStyle = inZone ? PALETTE.blue : PALETTE.red;
      ctx.fill();
    }
    txt('0.8 秒', z0 - 4, by + 42, 9.5, PALETTE.green, 'center', false);
    txt('1.2 秒', z1 + 4, by + 42, 9.5, PALETTE.green, 'center', false);
    txt('第 ' + (game.blowCount + 1) + ' / ' + (CONFIG.ROUNDS * CONFIG.BLOWS_PER_ROUND) + ' 次吹气', W / 2, 232, 12, PALETTE.text);
    keycap(W / 2 - 26, 258, 'B 按住', true);
    txt('在绿色区间松手', W / 2 + 34, 263, 12, PALETTE.gold);
  }

  function drawP5() {
    txt('⑤ AED 除颤', W / 2, 48, 21, PALETTE.text);
    // AED 设备
    var bx = 170, by = 76, bw = 140, bh = 92;
    panel(bx, by, bw, bh, PALETTE.panelHi, PALETTE.blue);
    txt('AED', bx + bw / 2, by + 26, 20, PALETTE.blue);
    // 心电屏
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(bx + 14, by + 36, bw - 28, 26);
    ctx.strokeStyle = PALETTE.line; ctx.strokeRect(bx + 14, by + 36, bw - 28, 26);
    ecg(by + 52, 9, 3, PALETTE.ecg, .9);
    // 状态灯
    var led = Math.sin(Date.now() / 260) > 0;
    ctx.beginPath(); ctx.arc(bx + bw - 16, by + 14, 4, 0, Math.PI * 2);
    ctx.fillStyle = led ? PALETTE.red : PALETTE.redDark; ctx.fill();
    txt(game.aedStep < 4 ? '分析中…' : 'OK', bx + 16, by + 18, 8.5, PALETTE.dim, 'left', false);
    // 四步
    var names = ['开机', '贴电极片', '所有人离开', '电击'];
    var keys = ['Enter', '1', '2', '空格'];
    for (var s = 0; s < 4; s++) {
      var sx = 90 + s * 76, sy = 190;
      var state = s < game.aedStep ? 'done' : (s === game.aedStep ? 'cur' : 'todo');
      panel(sx, sy, 68, 46,
            state === 'cur' ? 'rgba(255,215,94,.10)' : PALETTE.panel,
            state === 'cur' ? PALETTE.gold : (state === 'done' ? PALETTE.greenDark : PALETTE.line));
      txt((state === 'done' ? '√ ' : '') + names[s], sx + 34, sy + 19, 10.5,
          state === 'done' ? PALETTE.green : (state === 'cur' ? PALETTE.gold : PALETTE.dim));
      txt('[' + keys[s] + ']', sx + 34, sy + 36, 10,
          state === 'cur' ? PALETTE.text : PALETTE.faint, 'center', false);
    }
    txt('操作错误 ' + game.aedErrors + ' 次', W / 2, 258, 10.5, PALETTE.dim);
  }

  function drawResult() {
    if (!game.result) return;
    var sc = game.result.score, r = game.result;
    txt('抢救结束', W / 2, 50, 18, PALETTE.text);
    /* 结局叙事：等级决定伤员的命运 */
    var GRADE_MSG = {
      S: '自主循环恢复（ROSC）· 伤员恢复呼吸！',
      A: '抢救成功 · 伤员恢复了呼吸！',
      B: '抢救有效 · 伤员恢复部分循环，等待专业救援',
      C: '抢救不足 · 伤员仍在危险中，再来一次！'
    };
    var gmCol = sc.grade === 'S' ? PALETTE.gold : sc.grade === 'A' ? PALETTE.green : sc.grade === 'B' ? PALETTE.blue : PALETTE.red;
    txt(GRADE_MSG[sc.grade] || '', W / 2, 68, 11.5, gmCol);
    if (comboBest >= 5) txt('本局最佳连准 ×' + comboBest, W / 2, 168, 9.5, PALETTE.dim, 'center', false);
    // 等级徽章
    var gcx = W / 2, gcy = 116;
    var gcol = sc.grade === 'S' ? PALETTE.gold : sc.grade === 'A' ? PALETTE.green : sc.grade === 'B' ? PALETTE.blue : PALETTE.red;
    ctx.save();
    ctx.shadowColor = gcol; ctx.shadowBlur = 22;
    ctx.beginPath(); ctx.arc(gcx, gcy, 40, 0, Math.PI * 2);
    ctx.strokeStyle = gcol; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
    txt(sc.grade, gcx, gcy + 15, 46, gcol);
    // 四项成绩条
    var items = [
      ['节奏', sc.rhythm, 120, PALETTE.green],
      ['流程', sc.flow, 30, PALETTE.blue],
      ['吹气', sc.blow, 20, PALETTE.gold],
      ['反应', sc.reaction, 30, PALETTE.red],
    ];
    for (var i = 0; i < 4; i++) {
      var y = 178 + i * 22;
      txt(items[i][0], 96, y + 4, 11, PALETTE.dim, 'right');
      bar(110, y, 200, 9, items[i][1] / items[i][2], items[i][3]);
      txt(items[i][1] + '/' + items[i][2], 326, y + 4, 10.5, PALETTE.text, 'left');
    }
    txt('总分 ' + sc.total + ' / 200', W / 2, 276, 16, gcol);
    var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 350);
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    keycap(W / 2 - 18, 300 - 14, 'R', true);
    txt('重新挑战', W / 2 + 30, 288, 12, PALETTE.gold);
    ctx.globalAlpha = 1;
    // 统计小字
    txt('PERFECT ' + r.perfect + ' · GOOD ' + r.good + ' · 偏差 ' + r.miss +
        ' · 有效吹气 ' + r.blowValid + '/4 · AED 错误 ' + r.aedErrors, W / 2, 262, 9.5, PALETTE.faint, 'center', false);
  }

  function hintBar() {
    if (!game.hint) return;
    ctx.fillStyle = 'rgba(13,15,22,.95)';
    ctx.fillRect(0, H - 34, W, 34);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(0, H - 34, 3, 34);
    ctx.font = 'bold 9.5px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('提示', 10, H - 20);
    ctx.font = '10.5px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = PALETTE.text;
    var h = game.hint;
    ctx.fillText(h.slice(0, 38), 44, H - 20);
    if (h.length > 38) ctx.fillText(h.slice(38, 76), 44, H - 7);
  }

  function statusBar() {
    ctx.fillStyle = 'rgba(13,15,22,.9)';
    ctx.fillRect(0, 0, W, 30);
    ctx.strokeStyle = PALETTE.line;
    ctx.beginPath(); ctx.moveTo(0, 30.5); ctx.lineTo(W, 30.5); ctx.stroke();
    // 小红心 logo
    ctx.fillStyle = PALETTE.red;
    ctx.beginPath();
    ctx.moveTo(22, 18);
    ctx.bezierCurveTo(22, 10, 12, 10, 12, 17);
    ctx.bezierCurveTo(12, 22, 22, 26, 22, 27);
    ctx.bezierCurveTo(22, 26, 32, 22, 32, 17);
    ctx.bezierCurveTo(32, 10, 22, 10, 22, 18);
    ctx.fill();
    txt('黄金四分钟', 44, 20, 12, PALETTE.text, 'left');
    /* 标题页显示副标题；游戏中显示五步进度（当前步金色高亮） */
    if (game.phase === 'TITLE' || game.phase === 'RESULT') {
      txt('成人 CPR 节拍训练', 132, 20, 9.5, PALETTE.dim, 'left', false);
    } else {
      var order = ['P1', 'P2', 'P3', 'P4', 'P5'];
      var labels = { P1: '判断', P2: '呼救', P3: '按压', P4: '吹气', P5: 'AED' };
      for (var i = 0; i < order.length; i++) {
        var cur = game.phase === order[i];
        txt(String(i + 1) + ' ' + labels[order[i]], 196 + i * 52, 20, 9, cur ? PALETTE.gold : PALETTE.dim, 'center', cur);
      }
      txt(game.round + '/' + CONFIG.ROUNDS + ' 轮', W - 14, 20, 10, PALETTE.dim, 'right', false);
    }
  }

  /* ---------- 主循环：固定步长 ---------- */
  var last = null, acc = 0;
  function frame(now) {
    if (last === null) last = now;
    var wall = now - last;
    last = now;
    acc += wall;
    if (acc > 200) acc = 200;
    while (acc >= CONFIG.STEP) { game.update(CONFIG.STEP); acc -= CONFIG.STEP; }
    if (game.phase !== lastPhase) {
      if (game.phase === 'TITLE') { comboBest = 0; toast = null; prevPress = 0; prevJudg = 0; }
      lastPhase = game.phase;
      updateTouchbar();
    }

    bg();
    if (game.phase === 'TITLE') drawTitle();
    else if (game.phase === 'P1') drawP1();
    else if (game.phase === 'P2') drawP2();
    else if (game.phase === 'P3') drawP3();
    else if (game.phase === 'P4') drawP4();
    else if (game.phase === 'P5') drawP5();
    else if (game.phase === 'RESULT') drawResult();
    drawParticles(wall);
    statusBar();
    hintBar();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CPRGame: CPRGame, classifyInterval: classifyInterval, computeScore: computeScore, CONFIG: CONFIG, PALETTE: PALETTE };
}
