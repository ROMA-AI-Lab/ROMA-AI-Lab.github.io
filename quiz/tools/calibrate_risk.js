/* ===========================================================================
 * 风险公式标定工具
 * ---------------------------------------------------------------------------
 * 目的：风 risk 四个指标是启发式提示，系数必须与「50 题 / 六维」的实际分布匹配。
 * v4.3 的系数（sev*18 + weak*7）是按旧题库的极端分布写的，套到 v5.0 会让
 * 一个正常作答直接顶到 100%，失去区分意义。本工具用若干典型作答画像仿真，
 * 把各候选系数下的落点打出来，供人工选定。
 *
 * 用法：node tools/calibrate_risk.js
 * ===========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const CIT = require('../scoring.js');

const ROOT = path.join(__dirname, '..');
const bank = ['core.zh.json', 'extended.zh.json']
  .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')))
  .flat();
// 偏好分不在题库里，而是独立的 tastes/roma.json；换口味必须重跑本工具
const taste = JSON.parse(fs.readFileSync(path.join(ROOT, 'tastes', 'roma.json'), 'utf8'));
const pref = (q, o) => CIT.prefOf(taste, q.id, o.id);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const optByScore = q => {
  const m = {};
  q.options.forEach(o => {
    const v = pref(q, o);
    if (v === null) return;
    (m[v] = m[v] || []).push(o.id);
  });
  return m;
};
const MAP = bank.map(optByScore);

// 确定性伪随机，保证每次跑出来数字一致
let seed = 20261112;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pickFrom = arr => arr[Math.floor(rnd() * arr.length)];

/** 按 score 概率分布抽一份作答 */
function answerBy(dist) {
  const a = {};
  bank.forEach((q, i) => {
    const m = MAP[i];
    // 先按分布抽目标分，若该分在这题不存在则向邻近分回退
    let target = pickFrom(dist);
    let cand = m[target];
    for (let k = 1; !cand && k <= 3; k++) cand = m[target - k] || m[target + k];
    a[q.id] = pickFrom(cand || q.options.map(o => o.id));
  });
  return a;
}

const PROFILES = [
  ['理想型（每题最优）', () => {
    const a = {}; bank.forEach((q, i) => { a[q.id] = MAP[i][3][0]; }); return a;
  }],
  ['优秀（3 为主）', () => answerBy([3, 3, 3, 3, 3, 3, 3, 2, 2, 1])],
  ['良好（3/2 各半）', () => answerBy([3, 3, 3, 2, 2, 2, 2, 1])],
  ['常见（2 为主）', () => answerBy([2, 2, 2, 2, 2, 3, 3, 1])],
  ['中庸（2/1 混合）', () => answerBy([2, 2, 1, 1, 1, 3])],
  ['偏弱（1 为主）', () => answerBy([1, 1, 1, 1, 2, 0])],
  ['令人担心（1/0 混合）', () => answerBy([1, 1, 1, 0, 0, 2])],
  ['最差（每题选该题最低分）', () => {
    const a = {};
    bank.forEach(q => {
      const min = Math.min.apply(null, q.options.map(o => pref(q, o) ?? 0));
      a[q.id] = q.options.find(o => pref(q, o) === min).id;
    });
    return a;
  }],
  ['乱点（均匀随机）', () => answerBy([0, 1, 2, 3])],
  ['从头到尾选 A', () => {
    const a = {}; bank.forEach(q => { a[q.id] = q.options[0].id; }); return a;
  }]
];

const PACES = {
  '正常作答': null,
  '每题 1 秒内': 900,
  '每题 20 秒以上': 22000
};

function risks(s, paceMs) {
  const q = s.quality;
  const sev = q.severeCount, weak = q.weakCount, maturity = q.matureRate || 0;
  const r = k => (s.per[k] === null ? 60 : s.per[k]);
  let fastRate = 0, varcoef = 0;
  if (paceMs) { fastRate = paceMs < 1200 ? 1 : 0; varcoef = 0.2; }
  return {
    sev, weak, maturity,
    pub: clamp(Math.max(0, 60 - r('BND')) * 1.5, 0, 100),
    int: clamp(sev * 3.5 + weak * 1.2 + Math.max(0, 60 - r('INT')) * 0.8, 0, 100),
    vol: clamp(weak * 1.2 + (100 - maturity) * 0.35 + fastRate * 25 + varcoef * 20, 0, 100),
    ego: clamp(Math.max(0, 55 - r('EMP')) * 1.1 + Math.max(0, 55 - r('COM')) * 0.7 + sev * 3, 0, 100)
  };
}

console.log('题库：' + bank.length + ' 题 / 指纹 ' + CIT.hashBank(bank)
  + ' · 口味 ' + taste.name + '（' + CIT.hashTaste(taste) + '）\n');
const head = ['作答画像', 'Fit', '均分', '成熟率', 'sev', 'weak', '公开', '诚信', '波动', '利己'];
console.log(head.map(h => h.padStart(6)).join(''));

let worstOver = 0;
PROFILES.forEach(([name, make]) => {
  const ans = make();
  const s = CIT.compute(bank, ans, taste);
  const fit = CIT.fit(s.per);
  const r = risks(s, null);
  console.log([name, fit, s.quality.meanScore, s.quality.matureRate + '%', r.sev, r.weak,
    Math.round(r.pub), Math.round(r.int), Math.round(r.vol), Math.round(r.ego)]
    .map(v => String(v).padStart(6)).join(''));
  worstOver = Math.max(worstOver, r.int, r.vol, r.ego, r.pub);
});

console.log('\n节奏影响（理想型作答 + 不同答题速度）');
PROFILES.slice(0, 1).forEach(([name, make]) => {
  const ans = make();
  [['正常', null], ['每题 1 秒内', 900], ['每题 20 秒以上', 22000]].forEach(([pl, ms]) => {
    const s = CIT.compute(bank, ans, taste);
    const r = risks(s, ms);
    console.log(`  ${pl.padEnd(12)} 波动 ${Math.round(r.vol)}%`);
  });
});

console.log('\n乱点画像 × 节奏');
const rand = PROFILES.find(p => p[0].startsWith('乱点'))[1]();
Object.entries(PACES).forEach(([pl, ms]) => {
  const s = CIT.compute(bank, rand, taste);
  const r = risks(s, ms);
  console.log(`  ${pl.padEnd(12)} 诚信 ${Math.round(r.int)}% · 波动 ${Math.round(r.vol)}%`);
});
