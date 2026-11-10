/* ============================================================
 * test-cpr.js —— 《黄金四分钟》验收测试（无头运行，无需浏览器）
 * 用法：node test-cpr.js
 * 覆盖：节拍判定边界值 / 评分公式 / 状态机三种路径 / 30:2 循环计数
 * 依据：PRD 第六节「验收方式」
 * ============================================================ */
'use strict';
var G = require('./game.js');
var classifyInterval = G.classifyInterval;
var computeScore = G.computeScore;
var CONFIG = G.CONFIG;

var pass = 0, fail = 0, fails = [];
function ok(cond, name) {
  if (cond) { pass++; console.log('  √ ' + name); }
  else { fail++; fails.push(name); console.log('  × ' + name); }
}
function section(t) { console.log('\n【' + t + '】'); }

/* ---------- 1. 节拍判定边界值 ---------- */
section('1. 节拍判定边界值（PRD 四-1）');
ok(classifyInterval(499) === 'GOOD',   '499ms → GOOD（PERFECT 下界之外）');
ok(classifyInterval(500) === 'PERFECT','500ms → PERFECT（100 次/分 下界）');
ok(classifyInterval(545) === 'PERFECT','545ms → PERFECT（110 次/分 中值）');
ok(classifyInterval(600) === 'PERFECT','600ms → PERFECT（120 次/分 上界）');
ok(classifyInterval(601) === 'GOOD',   '601ms → GOOD（PERFECT 上界之外）');
ok(classifyInterval(420) === 'GOOD',   '420ms → GOOD（GOOD 下界）');
ok(classifyInterval(419) === 'MISS',   '419ms → MISS（快于 143 次/分）');
ok(classifyInterval(680) === 'GOOD',   '680ms → GOOD（GOOD 上界）');
ok(classifyInterval(681) === 'MISS',   '681ms → MISS（慢于 88 次/分）');
ok(classifyInterval(200) === 'MISS',   '200ms → MISS（狂按无效）');
ok(classifyInterval(1000) === 'MISS',  '1000ms → MISS（停太久）');

/* ---------- 2. 评分公式与等级映射 ---------- */
section('2. 评分公式与等级映射（PRD 四-3）');
function mkres(o) {
  return { perfect: 0, good: 0, miss: 0, p2Correct: true, aedErrors: 0,
           blowValid: 4, p1Ms: 1000, blowDurs: [] };
}
var s1 = computeScore(Object.assign(mkres(), { perfect: 60, good: 0, miss: 0 }));
ok(s1.rhythm === 120 && s1.flow === 30 && s1.blow === 20 && s1.reaction === 30, '满分构成 120+30+20+30');
ok(s1.total === 200 && s1.grade === 'S', '完美操作 = 200 分 S 级');

var s2 = computeScore(Object.assign(mkres(), { perfect: 45, good: 10, miss: 5 }));
ok(s2.rhythm === 100 && s2.total === 180 && s2.grade === 'S', '节奏 45P+10G → 180 分 = S 下界');

var s3 = computeScore(Object.assign(mkres(), { perfect: 37, good: 16, miss: 7 }));
ok(s3.rhythm === 90 && s3.total === 170 && s3.grade === 'A', 'A 区间样例（170）');

var s4 = computeScore(Object.assign(mkres(), { p2Correct: false, aedErrors: 2, p1Ms: 6500,
                                               perfect: 22, good: 12, miss: 26 }));
ok(s4.rhythm === 56 && s4.flow === 10 && s4.reaction === 15 && s4.total === 101 && s4.grade === 'C',
   '错误路径扣分：节奏56 流程10 反应15 → 101 分 C');

var s5 = computeScore(Object.assign(mkres(), { blowValid: 2 }));
ok(s5.blow === 10 && s5.total === 70, '吹气 2/4 有效 → 吹气分 10（此时总分 70）');

var s6 = computeScore(Object.assign(mkres(), { p1Ms: 3000 }));
var s6b = computeScore(Object.assign(mkres(), { p1Ms: 3999 }));
var s7 = computeScore(Object.assign(mkres(), { p1Ms: 4000 }));
ok(s6.reaction === 30 && s6b.reaction === 30 && s7.reaction === 25,
   '反应分：不足 1 秒不扣（3.0s/3.999s=30），满 1 秒扣 5（4.0s=25）');

var s8 = computeScore(Object.assign(mkres(), { p1Ms: 99999 }));
ok(s8.reaction === 0, '反应分下限 0（不出现负数）');

/* ---------- 3. 状态机：正常完整流程 ---------- */
section('3. 状态机：完整正常流程');
var g = new G.CPRGame();
var t = 0;
function k(key, dt, down) { t += (dt || 100); g.update(dt || 100); g.handleKey(key, t, down !== false); }

ok(g.phase === 'TITLE', '初始 = TITLE');
k('Enter');
ok(g.phase === 'P1', 'Enter → P1');
for (var i = 0; i < 3; i++) k('F', 300);
ok(g.phase === 'P2' && g.p1Ms === 900, '3×F → P2，p1Ms=900');

k('2');
ok(g.phase === 'P3' && g.p2Correct === true, '选 2（正确）→ P3');

for (i = 0; i < 30; i++) k('Space', 545);
ok(g.phase === 'P4' && g.judgments.length === 30, '30 次按压 → P4，判定 30 条');
ok(g.judgments[0] === 'PERFECT' && g.judgments[1] === 'PERFECT', '首拍基准 + 545ms 间隔 → 全 PERFECT');

k('B', 0, true); k('B', 1000, false);
k('B', 0, true); k('B', 1000, false);
ok(g.phase === 'P3' && g.round === 2 && g.blowValid === 2, '2 次有效吹气 → 第二轮 P3，round=2');

for (i = 0; i < 30; i++) k('Space', 560);
ok(g.phase === 'P4', '第二轮 30 次按压 → P4');
k('B', 0, true); k('B', 900, false);
k('B', 0, true); k('B', 1100, false);
ok(g.phase === 'P5', '4 次吹气全部完成 → P5 (AED)');

k('Enter'); k('1'); k('2'); k('Space');
ok(g.phase === 'RESULT' && g.result.score.total === 200 && g.result.score.grade === 'S',
   'AED 顺序正确 → RESULT，200 分 S');

k('R');
ok(g.phase === 'TITLE' && g.judgments.length === 0, 'R → 重置回 TITLE');

/* ---------- 4. 错误路径：P2 选错 ---------- */
section('4. 错误路径：P2 选 1（离开伤员）');
var g2 = new G.CPRGame();
t = 0;
g2.handleKey('Enter', t += 100, true);
for (i = 0; i < 3; i++) g2.handleKey('F', t += 300, true);
g2.handleKey('1', t += 100, true);
ok(g2.phase === 'P3' && g2.p2Correct === false, '选 1 也能进入 P3，但 p2Correct=false');
for (i = 0; i < 30; i++) g2.handleKey('Space', t += 545, true);
g2.handleKey('B', t, true); g2.handleKey('B', t += 1000, false);
g2.handleKey('B', t, true); g2.handleKey('B', t += 1000, false);
for (i = 0; i < 30; i++) g2.handleKey('Space', t += 545, true);
g2.handleKey('B', t, true); g2.handleKey('B', t += 1000, false);
g2.handleKey('B', t, true); g2.handleKey('B', t += 1000, false);
['Enter', '1', '2', 'Space'].forEach(function (kk) { g2.handleKey(kk, t += 100, true); });
ok(g2.result.score.flow === 20, '流程分扣 10（P2 错误 → 20/30）');
ok(g2.result.score.total === 190 && g2.result.score.grade === 'S',
   'P2 选错只扣 10 分 → 190 分仍为 S（一次失误不至于降档）');

/* ---------- 5. 错误路径：AED 顺序按错 ---------- */
section('5. 错误路径：AED 顺序按错');
var g3 = new G.CPRGame();
t = 0;
g3.handleKey('Enter', t += 100, true);
for (i = 0; i < 3; i++) g3.handleKey('F', t += 300, true);
g3.handleKey('2', t += 100, true);
for (i = 0; i < 30; i++) g3.handleKey('Space', t += 545, true);
g3.handleKey('B', t, true); g3.handleKey('B', t += 1000, false);
g3.handleKey('B', t, true); g3.handleKey('B', t += 1000, false);
for (i = 0; i < 30; i++) g3.handleKey('Space', t += 545, true);
g3.handleKey('B', t, true); g3.handleKey('B', t += 1000, false);
g3.handleKey('B', t, true); g3.handleKey('B', t += 1000, false);
// 顺序错误：先按 2（应先 Enter）
g3.handleKey('2', t += 100, true);
ok(g3.aedErrors === 1 && g3.aedStep === 0 && g3.phase === 'P5', '按错顺序：记 1 次错误，步骤不前进');
// 无关按键不算错误
g3.handleKey('F', t += 100, true);
ok(g3.aedErrors === 1, '无关按键不计入 AED 错误');
['Enter', '1', '2', 'Space'].forEach(function (kk) { g3.handleKey(kk, t += 100, true); });
ok(g3.result.score.flow === 20 && g3.result.aedErrors === 1, 'AED 错 1 次 → 流程分 20/30');

/* ---------- 6. 30:2 循环计数 ---------- */
section('6. 30:2 循环计数（PRD 四-3）');
var g4 = new G.CPRGame();
t = 0;
g4.handleKey('Enter', t += 100, true);
for (i = 0; i < 3; i++) g4.handleKey('F', t += 300, true);
g4.handleKey('2', t += 100, true);
var totalPresses = 0, totalBlows = 0;
for (var round = 0; round < 2; round++) {
  for (i = 0; i < 30; i++) { g4.handleKey('Space', t += 545, true); totalPresses++; }
  for (i = 0; i < 2; i++) { g4.handleKey('B', t, true); g4.handleKey('B', t += 1000, false); totalBlows++; }
}
ok(totalPresses === 60 && g4.judgments.length === 60, '两轮共 60 次按压、60 条判定');
ok(totalBlows === 4 && g4.blowCount === 4, '两轮共 4 次吹气（30:2 × 2 轮）');
ok(g4.phase === 'P5', '两轮完成 → 进入 AED 阶段');

/* ---------- 汇总 ---------- */
console.log('\n========================================');
console.log('通过 ' + pass + ' / ' + (pass + fail) + (fail === 0 ? ' —— 全部 PASS' : ' —— 存在失败项'));
if (fail > 0) { fails.forEach(function (f) { console.log('  失败: ' + f); }); process.exit(1); }
