/* ROMA Lab · CIT Faculty Analyzer v5.1
 * - 计分一律走 scoring.js（与学生端同一份内核），本文件不再复制公式
 * - 题库只说「选项体现什么特质」，口味文件说「实验室喜欢什么」，两者分开载入
 * - 载入报告后先做双重对账：题库指纹 + 口味指纹；题库不符→分数不可比，口味不符→契合度口径不同
 * - v4.3 旧报告没有题库指纹，用 migration_v4.3.json 做选项文本迁移后重算
 */
const CIT = window.CIT;
const DIM = CIT.DIMS;
const DIM_NAME = CIT.DIM_LABEL;

let RULES = null;
let BANK = [];
let TASTE = null;
let TASTE_BIND = null;
let MIGRATION = null;
let LAST = null;

const $ = (s, r = document) => r.querySelector(s);

/* ---------- 主题 ---------- */
(function () {
  const b = document.getElementById('themeBtn');
  const body = document.body;
  function apply(mode) { body.classList.toggle('light', mode === 'light'); }
  let mode = localStorage.getItem('theme') || 'auto';
  apply(mode);
  if (b) b.onclick = () => {
    mode = (mode === 'light') ? 'auto' : 'light';
    localStorage.setItem('theme', mode);
    apply(mode);
  };
})();

/* ---------- 配置与题库 ---------- */
async function loadConfig() {
  if (RULES) return RULES;
  try {
    const res = await fetch('rules.weights.json', { cache: 'no-store' });
    if (res.ok) RULES = await res.json();
  } catch (e) { console.warn('rules.weights.json 缺失'); }
  return RULES;
}

async function loadMigration() {
  if (MIGRATION !== null) return MIGRATION;
  try {
    const res = await fetch('migration_v4.3.json', { cache: 'no-store' });
    MIGRATION = res.ok ? await res.json() : false;
  } catch (e) { MIGRATION = false; }
  return MIGRATION;
}

async function loadBankFor() {
  // v5.0 起只有一种模式：固定 50 题。报告里的 mode 字段仅作历史兼容，不再参与题库选择。
  if (BANK.length && TASTE) return BANK;
  let out = [];
  for (const f of CIT.BANK_FILES) {
    const res = await fetch(f, { cache: 'no-store' });
    if (!res.ok) throw new Error('题库缺失：' + f);
    out = out.concat(await res.json());
  }
  BANK = out;

  const tr = await fetch(`${CIT.TASTE_DIR}/${CIT.DEFAULT_TASTE}.json`, { cache: 'no-store' });
  if (!tr.ok) throw new Error('口味文件缺失：' + CIT.DEFAULT_TASTE);
  TASTE = await tr.json();
  TASTE_BIND = CIT.bindTaste(TASTE, BANK);

  const badge = $('#verBadge');
  if (badge) {
    badge.textContent = `题库 v${(TASTE.bank_binding || {}).bank_version || CIT.VERSION} · ${BANK.length} 题 · ${CIT.hashBank(BANK)}`
      + ` · 口味 ${TASTE.name || TASTE.taste_id}（${TASTE_BIND.tasteHash}）`;
    badge.classList.toggle('bad', !TASTE_BIND.ok);
  }
  return BANK;
}

/* ---------- 工具 ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = v => (v === null || v === undefined) ? '—' : (Math.round(v * 10) / 10) + '%';
const riskClass = (v, thr) => v >= thr.risk_bad ? 'bad' : (v >= thr.risk_warn ? 'warn' : 'good');
const fitClass = (v, thr) => v === null ? 'warn' : (v >= thr.fit_good ? 'good' : (v >= thr.fit_warn ? 'warn' : 'bad'));

/* ---------- 核心分析 ---------- */
async function analyze(rep) {
  const bank = await loadBankFor();
  const ver = CIT.verify(rep, bank, TASTE);

  // 1. 选项迁移：v4.3 及更早的报告没有题库指纹
  let answers = Object.assign({}, rep.answers || {});
  let migrated = false;
  if (!rep.bankHash) {
    const mig = await loadMigration();
    if (mig && mig.option_map) {
      const out = {};
      Object.entries(answers).forEach(([qid, oid]) => {
        const m = mig.option_map[qid];
        out[qid] = (m && m[oid]) || oid;
      });
      answers = out;
      migrated = true;
    }
  }

  // 2. 重算，不采信报告里的 per
  const score = CIT.compute(bank, answers, TASTE);
  const ratio = score.per;
  const fit = CIT.fit(ratio);
  const thr = (RULES && RULES.thresholds) || { fit_warn: 50, fit_good: 68, risk_warn: 40, risk_bad: 70 };
  const W = (RULES && RULES.fit_weights) || CIT.WEIGHTS;

  // 3. 触发词（只扫所选选项文本）
  let pubTrig = 0, intTrig = 0, egoTrig = 0, volTrig = 0;
  const triggerHits = [];
  bank.forEach(q => {
    const o = q.options.find(x => x.id === answers[q.id]);
    if (!o) return;
    const blob = String(o.label || '');
    ((RULES && RULES.triggers) || []).forEach(tg => {
      if (tg.key && blob.includes(tg.key)) {
        const a = tg.affect || {};
        pubTrig += a.publicityRisk || 0;
        intTrig += a.integrityRisk || 0;
        egoTrig += a.egoismRisk || 0;
        volTrig += a.volatilityRisk || 0;
        triggerHits.push({ qid: q.id, key: tg.key, affect: a });
      }
    });
  });

  // 4. 节奏
  const pace = rep.pace || { durations: {} };
  const ds = Object.values(pace.durations || {}).filter(x => Number.isFinite(x) && x > 0);
  let paceTrust = null, consistency = null, avgMs = null, medianMs = null, fastRate = 0, slowRate = 0, varcoef = 0;
  if (ds.length) {
    const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
    const sorted = ds.slice().sort((a, b) => a - b);
    avgMs = Math.round(avg);
    medianMs = Math.round(sorted[Math.floor(sorted.length / 2)]);
    fastRate = ds.filter(x => x < 1200).length / ds.length;
    slowRate = ds.filter(x => x > 12000).length / ds.length;
    const varr = ds.reduce((a, b) => a + (b - avg) * (b - avg), 0) / ds.length;
    varcoef = Math.sqrt(varr) / (avg || 1);
    // 变异系数不封顶时，只要有一两题停顿特别久（接电话、掉线），
    // 波动就会顶到 100%，把真正的问题淹没。按 1.2 封顶。
    const vc = Math.min(varcoef, 1.2);
    paceTrust = clamp(100 - fastRate * 45 - vc * 30 + slowRate * 8, 0, 100);
    consistency = clamp(100 - vc * 55, 0, 100);
  }

  // 5. 风险（启发式，公式见 rules.weights.json 的 risk_formulas）
  const sev = score.quality.severeCount, weak = score.quality.weakCount;
  const maturity = score.quality.matureRate || 0;
  const rBND = ratio.BND === null ? 60 : ratio.BND;
  const rINT = ratio.INT === null ? 60 : ratio.INT;
  const rEMP = ratio.EMP === null ? 60 : ratio.EMP;
  const rCOM = ratio.COM === null ? 60 : ratio.COM;

  const publicityRisk = clamp(pubTrig + Math.max(0, 60 - rBND) * 1.5, 0, 100);
  const integrityRisk = clamp(sev * 3.5 + weak * 1.2 + Math.max(0, 60 - rINT) * 0.8 + intTrig, 0, 100);
  const volatilityRisk = clamp(weak * 1.2 + (100 - maturity) * 0.35 + fastRate * 25 + Math.min(varcoef, 1.2) * 20 + volTrig, 0, 100);
  const egoismRisk = clamp(Math.max(0, 55 - rEMP) * 1.1 + Math.max(0, 55 - rCOM) * 0.7 + sev * 3 + egoTrig, 0, 100);

  // 6. 押中异常（疑似预先获取评分表）
  // 纯静态架构下口味表可被技术手段下载，防线是「识别」而非「保密」：
  // 强制排列后每题最优解唯一，正常学生 50 题全中近乎不可能（真实最优样本约 35/50）。
  // 看过答案的报告反而最好识别——满分本身就是最大的红旗。
  let topCount = 0, prefN = 0;
  if (TASTE && TASTE.preference) {
    bank.forEach(q => {
      const a = answers[q.id];
      if (!a) return;
      const row = TASTE.preference[q.id];
      if (!row || row[a] === undefined) return;
      prefN++;
      if (row[a] === 3) topCount++;
    });
  }
  const topRate = prefN ? topCount / prefN : 0;
  const pickedLog = Array.isArray(rep.picked) ? rep.picked : [];
  const seenQ = new Set();
  let changeCount = 0;
  pickedLog.forEach(p => { if (p && seenQ.has(p.qid)) changeCount++; else if (p) seenQ.add(p.qid); });
  const tsLog = (rep.pace && Array.isArray(rep.pace.timestamps)) ? rep.pace.timestamps : [];
  const totalMin = tsLog.length >= 2 ? (tsLog[tsLog.length - 1] - tsLog[0]) / 60000 : null;
  const gamingReasons = [];
  if (prefN && topRate >= 0.9) gamingReasons.push(`${prefN} 题中 ${topCount} 题押中实验室最优解（真实学生样本最高约 7 成）`);
  if (totalMin !== null && totalMin < 4) gamingReasons.push(`总用时约 ${totalMin.toFixed(1)} 分钟，不足以读完 50 题题干`);
  if (prefN && topRate >= 0.9 && pickedLog.length && changeCount === 0) gamingReasons.push('最优率极高且全程零改答');
  let gamingLevel = null;
  if (prefN && (topRate >= 0.98 || (topRate >= 0.9 && totalMin !== null && totalMin < 4 && pickedLog.length && changeCount === 0))) {
    gamingLevel = 'alert';
  } else if (prefN && topRate >= 0.9 && ((totalMin !== null && totalMin < 5) || (pickedLog.length && changeCount === 0))) {
    gamingLevel = 'watch';
  }
  const gaming = {
    topCount, topN: prefN, topRate: Math.round(topRate * 1000) / 10,
    changeCount, totalMin: totalMin === null ? null : Math.round(totalMin * 10) / 10,
    level: gamingLevel, reasons: gamingReasons
  };

  return {
    ratio, fit, thr, W, score, answers, migrated, ver,
    taste: TASTE ? { id: TASTE.taste_id, name: TASTE.name, hash: ver.tasteHash } : null,
    tasteBind: TASTE_BIND,
    publicityRisk, integrityRisk, volatilityRisk, egoismRisk,
    triggerHits, gaming,
    pace: { paceTrust, consistency, avgMs, medianMs, fastRate, slowRate, varcoef },
    // 旧简版（20 题）报告：总量本来就少于 50，不能当成「缺答 30 题」
    legacyShort: (rep.total && rep.total < CIT.TOTAL_ITEMS) ? rep.total : 0,
    unanswered: score.total - score.answered
  };
}

/* ---------- 渲染 ---------- */
function barRow(label, ratio, note) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:grid;grid-template-columns:150px 1fr 96px;align-items:center;gap:8px';
  const l = document.createElement('div'); l.innerHTML = label;
  const b = document.createElement('div'); b.className = 'bar';
  const fill = document.createElement('div');
  fill.style.width = (ratio === null ? 0 : ratio) + '%';
  if (ratio === null) fill.style.opacity = 0.15;
  b.appendChild(fill);
  const r = document.createElement('div'); r.className = 'subtle';
  r.style.cssText = 'text-align:right;font-variant-numeric:tabular-nums';
  r.textContent = ratio === null ? '未测量' : ratio + '%';
  if (note) r.title = note;
  wrap.append(l, b, r);
  return wrap;
}

function renderBars(r) {
  const box = $('#bars'); if (!box) return;
  box.innerHTML = '';
  DIM.forEach(k => {
    const coarse = r.score.resolution && r.score.resolution[k] === 'coarse';
    box.appendChild(barRow(
      `<b>${DIM_NAME[k]}</b> <span class="subtle">${k}</span>${coarse ? ' <span class="subtle">（分辨率有限）</span>' : ''}`,
      r.ratio[k],
      !r.score.usable[k] ? '该维度区分题不足，本次不评估'
        : coarse ? `有效题 ${r.score.coverage[k]} 道，但本题库下可分辨区间偏窄，宜看趋势`
          : `有效题 ${r.score.coverage[k]} 道`
    ));
  });
  const legend = document.createElement('div');
  legend.className = 'subtle';
  legend.style.cssText = 'margin-top:10px;font-size:12px;line-height:1.6';
  legend.innerHTML = '分数口径：<b>50%</b> = 随机作答期望，<b>100%</b> = 该维每道题都选了最体现该特质的选项，<b>0%</b> = 每道题都选最差。60% 以上即为明显高于基线。';
  box.appendChild(legend);
}

function renderKPI(r) {
  const k = $('#kpi'); if (!k) return;
  k.innerHTML = '';
  const items = [
    ['ROMA Fit', r.fit === null ? null : Math.round(r.fit), fitClass(r.fit, r.thr)],
    ['公开表达风险', Math.round(r.publicityRisk), riskClass(r.publicityRisk, r.thr)],
    ['诚信风险', Math.round(r.integrityRisk), riskClass(r.integrityRisk, r.thr)],
    ['波动', Math.round(r.volatilityRisk), riskClass(r.volatilityRisk, r.thr)],
    ['利己倾向', Math.round(r.egoismRisk), riskClass(r.egoismRisk, r.thr)],
    ['作答可信度', r.pace.paceTrust === null ? null : Math.round(r.pace.paceTrust), fitClass(r.pace.paceTrust, r.thr)]
  ];
  items.forEach(([name, val, klass]) => {
    const card = document.createElement('div');
    card.className = 'card pad';
    card.innerHTML = `<div class="subtle">${name}</div>
      <div><b class="${klass}">${val === null ? '—' : val}</b><sub class="subtle">%</sub></div>`;
    k.appendChild(card);
  });
  const note = document.createElement('div');
  note.className = 'subtle';
  note.style.cssText = 'margin-top:8px;font-size:12px';
  note.textContent = '风险指标为启发式提示，不构成心理诊断，不能单独作为录取依据。';
  k.appendChild(note);
}

function renderDiag(r) {
  const ul = $('#diag'); if (!ul) return;
  ul.innerHTML = '';
  const add = html => { const li = document.createElement('li'); li.innerHTML = html; ul.appendChild(li); };
  const thr = r.thr;

  if (!r.ver.bankMatch && !r.migrated) {
    add(`<b class="bad">题库指纹不一致</b>：报告 ${r.ver.reportHash || '无'} / 当前 ${r.ver.bankHash}，已按当前题库重算，原报告的 per 不再采信。`);
  }
  if (r.tasteBind && !r.tasteBind.ok) {
    add(`<b class="bad">口味文件绑定异常</b>：${r.tasteBind.issues.filter(i => i.level === 'error').map(i => i.msg).join('；')}。当前分数不可用，请先修好题库与口味文件的对应关系。`);
  } else if (r.ver.reportTasteHash && !r.ver.tasteMatch) {
    add(`<b class="warn">口味版本不同</b>：这份报告用的是口味 <code>${r.ver.reportTasteId || '未记名'}</code>（${r.ver.reportTasteHash}），当前是 <code>${r.ver.tasteId}</code>（${r.ver.tasteHash}）。六维分数仍可比（六维只由 dims 决定），但 ROMA Fit 与四项风险是按现行口味重算的，与报告当时的判断不同。`);
  }
  if (r.migrated) {
    add(`<b class="warn">v4.3 旧报告</b>：无题库指纹，已按选项文本迁移到现行题库后重算。旧报告里的「创造与抗压 100%」是旧缺陷产物，不可引用。`);
  }
  if (r.legacyShort) {
    add(`<b class="bad">旧版简版报告（${r.legacyShort} 题）</b>：v5.0 起固定 50 题，简版已下线。这份报告只覆盖了部分题目，未覆盖的维度会显示「未测量」，分数<b>不可</b>与新报告横向比较，也不应作为评审依据。建议请对方按现行 50 题重测。`);
  } else if (r.unanswered > 0) {
    add(`<b class="warn">完成度不足</b>：缺答 ${r.unanswered} 题，相关维度可能被低估。`);
  }

  const coarseDims = DIM.filter(d => r.score.resolution && r.score.resolution[d] === 'coarse');
  if (coarseDims.length) {
    add(`<b class="warn">分辨率有限</b>：${coarseDims.map(d => DIM_NAME[d]).join('、')} 的「基线→上限」区间偏窄（不足 ${CIT.MIN_HEADROOM} 分），少数题目的选择就能拉动十几分，请勿把该分数当精确值。`);
  }

  if (r.gaming && r.gaming.level === 'alert') {
    add(`<b class="bad">疑似预先获取评分表</b>：${r.gaming.reasons.join('；')}。纯静态架构下评分表可被技术手段获取，满分本身就是最大的异常信号。建议面试时就具体题目追问取舍理由核验，不要仅凭本报告做结论。`);
  } else if (r.gaming && r.gaming.level === 'watch') {
    add(`<b class="warn">押中率偏高</b>：${r.gaming.reasons.join('；')}。可能确为高度契合，也可能接触过评分表，建议面试追问几道题的取舍理由。`);
  }

  add(`综合契合度（ROMA Fit）：<b class="${fitClass(r.fit, thr)}">${pct(r.fit)}</b>`);
  add(`公开表达风险 <b class="${riskClass(r.publicityRisk, thr)}">${Math.round(r.publicityRisk)}%</b>；诚信风险 <b class="${riskClass(r.integrityRisk, thr)}">${Math.round(r.integrityRisk)}%</b>`);
  add(`波动 <b class="${riskClass(r.volatilityRisk, thr)}">${Math.round(r.volatilityRisk)}%</b>；利己倾向 <b class="${riskClass(r.egoismRisk, thr)}">${Math.round(r.egoismRisk)}%</b>`);
  if (r.pace.paceTrust !== null) {
    add(`作答节奏：可信度 <b>${Math.round(r.pace.paceTrust)}%</b> · 一致性 <b>${Math.round(r.pace.consistency)}%</b>`);
  }
  add(`选项与口味：均分 <b>${r.score.quality.meanScore}</b>/3 · 贴合口味的选项占比 <b>${r.score.quality.matureRate}%</b> · 与口味明显相左 <b>${r.score.quality.severeCount}</b> · 略有出入 <b>${r.score.quality.weakCount}</b> 道`);
  if (r.gaming && r.gaming.topN) {
    const g = r.gaming;
    add(`押中最优解：<b class="${g.level === 'alert' ? 'bad' : (g.level === 'watch' ? 'warn' : '')}">${g.topCount}/${g.topN}</b>（${g.topRate}%） · 改答 ${g.changeCount} 次${g.totalMin !== null ? ` · 总用时约 ${g.totalMin} 分钟` : ''}`);
  }
}

function renderDecision(r) {
  const d = $('#decision'); if (!d) return;
  const thr = r.thr;
  const lines = [];
  lines.push(`ROMA Fit: ${pct(r.fit)}（<${thr.fit_warn} 需复核 / ≥${thr.fit_good} 为契合）`);
  lines.push(`Risks: 诚信 ${Math.round(r.integrityRisk)}% · 公开表达 ${Math.round(r.publicityRisk)}% · 利己 ${Math.round(r.egoismRisk)}% · 波动 ${Math.round(r.volatilityRisk)}%`);
  const flags = [];
  if (r.gaming && r.gaming.level === 'alert') flags.push('疑似押中评分表，面试追问取舍理由');
  if (r.fit !== null && r.fit < thr.fit_warn) flags.push('列入复核');
  if (r.integrityRisk >= thr.risk_warn) flags.push('面试重点核验署名与数据规范');
  if (r.publicityRisk >= thr.risk_warn) flags.push('面试聚焦对外表达边界');
  if (r.score.usable && !r.score.usable.RES) flags.push('抗压维度本次未测');
  lines.push('建议：' + (flags.length ? flags.join('；') : '常规跟进'));
  lines.push('注意：本页是情境判断的量化摘要，不是人格测评结论；请结合面试、作品与推荐人核实。');
  d.textContent = lines.join('\n');
}

function renderSummary(r) {
  const box = document.getElementById('summary');
  if (!box) return;
  const usable = DIM.filter(d => r.ratio[d] !== null);
  const sorted = usable.slice().sort((a, b) => r.ratio[b] - r.ratio[a]);
  const top2 = sorted.slice(0, 2).map(k => `${DIM_NAME[k]} ${r.ratio[k]}%`).join(' · ');
  const low2 = sorted.slice(-2).map(k => `${DIM_NAME[k]} ${r.ratio[k]}%`).join(' / ');
  const paceTxt = r.pace.medianMs
    ? `作答中位≈${r.pace.medianMs}ms，超快(<1.2s) ${Math.round(r.pace.fastRate * 100)}%，超慢(>12s) ${Math.round(r.pace.slowRate * 100)}%。`
    : '作答节奏数据有限。';
  const gap = DIM.filter(d => r.ratio[d] === null);
  box.innerHTML = [
    `ROMA Fit ${pct(r.fit)}；完成度 ${r.score.answered}/${r.score.total}。${paceTxt}`,
    `相对亮点：${top2 || '—'}；相对弱项：${low2 || '—'}。${gap.length ? `未测维度：${gap.map(d => DIM_NAME[d]).join('、')}。` : ''}`,
    `初步印象：整体${(r.ratio.INT || 0) >= 60 ? '规范意识较强' : '规范意识待核验'}；协作上${(r.ratio.COM || 0) >= 55 && (r.ratio.EMP || 0) >= 55 ? '更注重关系与体验' : '更强调目标推进'}；抗压${r.ratio.RES === null ? '未测' : (r.ratio.RES >= 60 ? '表现稳' : '偏弱，建议追问')}。建议结合项目复盘与冲突化解的具体案例核验。`
  ].join('\n');
}

/* ---------- 证据列表 ---------- */
function escapeMd(s) { return String(s).replaceAll('|', '\\|').replaceAll('\n', ' '); }
function csvEscape(s) { const v = String(s).replaceAll('"', '""'); return /[",\n]/.test(v) ? `"${v}"` : v; }

function downloadString(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function renderEvidence(rep, r) {
  const list = document.getElementById('evidenceList');
  if (!list) return;
  list.innerHTML = '';
  const qmap = {};
  BANK.forEach(q => { qmap[q.id] = q; });
  const durations = (rep.pace && rep.pace.durations) || {};
  const entries = Object.entries(r.answers);

  const byDurDesc = entries.slice().sort((a, b) => (durations[b[0]] || 0) - (durations[a[0]] || 0));
  const pickN = 3;
  const chosen = [];
  const seen = new Set();
  [byDurDesc.slice(0, pickN), byDurDesc.slice(-pickN)].forEach(g => g.forEach(p => {
    if (!seen.has(p[0])) { chosen.push(p); seen.add(p[0]); }
  }));
  const rest = byDurDesc.filter(p => !seen.has(p[0]));
  const all = [...chosen, ...rest];

  let page = 1;
  const PAGE = 6;
  const totalPages = Math.max(1, Math.ceil(all.length / PAGE));
  const ctl = ensureEvidenceControls();

  function draw() {
    list.innerHTML = '';
    all.slice((page - 1) * PAGE, page * PAGE).forEach(([qid, oid]) => {
      const q = qmap[qid]; if (!q) return;
      const o = q.options.find(x => x.id === oid);
      const li = document.createElement('li');
      li.innerHTML = `<b>${qid}</b>
        <div class="subtle" style="margin:4px 0">${q.scenario || ''}</div>
        <div class="pill">选择 ${oid} · 耗时≈${durations[qid] || 0}ms · 口味 ${o ? (CIT.prefOf(TASTE, qid, o.id) ?? '?') : '?'}/3</div>
        <div style="margin-top:4px">${o ? o.label : '(选项缺失)'}</div>`;
      list.appendChild(li);
    });
    if (ctl) {
      ctl.pageLab.textContent = `${page} / ${totalPages}`;
      ctl.prevBtn.disabled = page <= 1;
      ctl.nextBtn.disabled = page >= totalPages;
      ctl.wrap.classList.toggle('is-single', totalPages <= 1);
    }
  }

  if (ctl) {
    ctl.prevBtn.onclick = () => { if (page > 1) { page--; draw(); } };
    ctl.nextBtn.onclick = () => { if (page < totalPages) { page++; draw(); } };
    ctl.expMdBtn.onclick = () => {
      const rows = all.map(([qid, oid]) => {
        const q = qmap[qid] || {};
        const o = (q.options || []).find(x => x.id === oid);
        return `| ${qid} | ${escapeMd(q.title || '')} | ${oid} | ${o ? (CIT.prefOf(TASTE, qid, o.id) ?? '') : ''} | ${escapeMd(o ? o.label : '')} | ${durations[qid] || 0} | ${escapeMd(q.scenario || '')} |`;
      });
      downloadString(['| QID | Title | Option | TastePref | Label | Duration(ms) | Scenario |', '|---|---|---|---:|---|---:|---|', ...rows].join('\n'),
        'CIT_evidence_all.md', 'text/markdown;charset=utf-8');
    };
    ctl.expCsvBtn.onclick = () => {
      const rows = all.map(([qid, oid]) => {
        const q = qmap[qid] || {};
        const o = (q.options || []).find(x => x.id === oid);
        return [qid, q.title || '', oid, o ? (CIT.prefOf(TASTE, qid, o.id) ?? '') : '', o ? o.label : '', durations[qid] || 0, q.scenario || ''].map(csvEscape).join(',');
      });
      downloadString(['QID,Title,Option,TastePref,Label,Duration,Scenario', ...rows].join('\n'),
        'CIT_evidence_all.csv', 'text/csv;charset=utf-8');
    };
  }
  draw();
}

function ensureEvidenceControls() {
  const container = document.querySelector('#evidenceList')?.parentElement;
  if (!container) return null;
  let wrap = container.querySelector('.evidence-controls');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'evidence-controls';
    const left = document.createElement('div'); left.className = 'controls-left';
    const prevBtn = document.createElement('button'); prevBtn.className = 'btn small ghost'; prevBtn.id = 'evidencePrev'; prevBtn.textContent = '上一页';
    const pageLab = document.createElement('span'); pageLab.id = 'evidencePage'; pageLab.className = 'page-indicator';
    const nextBtn = document.createElement('button'); nextBtn.className = 'btn small ghost'; nextBtn.id = 'evidenceNext'; nextBtn.textContent = '下一页';
    left.append(prevBtn, pageLab, nextBtn);
    const right = document.createElement('div'); right.className = 'controls-right';
    const expMdBtn = document.createElement('button'); expMdBtn.className = 'btn small'; expMdBtn.id = 'evidenceExportMd'; expMdBtn.textContent = '导出 MD';
    const expCsvBtn = document.createElement('button'); expCsvBtn.className = 'btn small'; expCsvBtn.id = 'evidenceExportCsv'; expCsvBtn.textContent = '导出 CSV';
    right.append(expMdBtn, expCsvBtn);
    wrap.append(left, right);
    container.appendChild(wrap);
    return { wrap, prevBtn, pageLab, nextBtn, expMdBtn, expCsvBtn };
  }
  return {
    wrap,
    prevBtn: wrap.querySelector('#evidencePrev'),
    nextBtn: wrap.querySelector('#evidenceNext'),
    pageLab: wrap.querySelector('#evidencePage'),
    expMdBtn: wrap.querySelector('#evidenceExportMd'),
    expCsvBtn: wrap.querySelector('#evidenceExportCsv')
  };
}

/* ---------- 导航图 ---------- */
// 自适应容器宽度：v5.0 之前把内容宽度直接写成 canvas 的 CSS 宽度，
// 50 题时算出来 640px，比卡片还宽，直接溢出到卡片外面。现在固定铺满容器，
// 用「每根柱子的步长」去适配题目数量。
function setupHiDPI(canvas, h, minW) {
  const dpr = window.devicePixelRatio || 1;
  const parent = canvas.parentElement;
  const avail = Math.max(minW || 280, Math.floor((parent ? parent.clientWidth : 640) - 2));
  canvas.width = Math.round(avail * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = '100%';
  canvas.style.height = h + 'px';
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: avail };
}

function attachTooltip(canvas, boxes, toText) {
  const tip = document.getElementById('tip'); if (!tip) return;
  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const hit = boxes.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (hit) {
      tip.innerText = toText(hit);
      tip.style.left = e.clientX + 'px';
      tip.style.top = e.clientY + 'px';
      tip.classList.add('show');
    } else tip.classList.remove('show');
  };
  canvas.onmouseleave = () => tip.classList.remove('show');
}

function emptyHint(canvas, h, text) {
  const { ctx, w } = setupHiDPI(canvas, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(226,232,240,0.08)'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(148,163,184,.75)';
  ctx.font = '12px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
}

function renderNav(rep) {
  const heat = document.getElementById('navHeat');
  if (heat && heat.getContext) {
    const durs = (rep.pace && rep.pace.durations) || {};
    const seq = Array.from(new Set((rep.picked || []).map(p => p.qid)));
    const ids = seq.filter(id => id in durs);
    if (!ids.length) {
      emptyHint(heat, 120, '这份报告没有逐题耗时记录');
    } else {
      const vals = ids.map(id => durs[id] || 0);
      const max = Math.max(1, ...vals);
      const h = 120;
      const { ctx, w } = setupHiDPI(heat, h);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(226,232,240,0.08)'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.beginPath(); ctx.moveTo(20, h - 20); ctx.lineTo(w - 10, h - 20); ctx.stroke();
      const step = (w - 44) / ids.length;
      const bw = Math.max(2, Math.min(9, step * 0.62));
      const rects = [];
      ids.forEach((id, i) => {
        const v = durs[id] || 0, t = v / max;
        const bh = Math.max(4, t * (h - 40));
        const x = 22 + i * step + (step - bw) / 2;
        const y = (h - 20) - bh;
        const g = ctx.createLinearGradient(0, y, 0, y + bh);
        g.addColorStop(0, '#93c5fd'); g.addColorStop(1, '#60a5fa');
        ctx.fillStyle = g; ctx.fillRect(x, y, bw, bh);
        rects.push({ x: 22 + i * step, y, w: Math.max(step, 4), h: bh, id, ms: v });
      });
      attachTooltip(heat, rects, r => `题目 ${r.id}\n耗时 ${r.ms} ms`);
    }
  }
  const tl = document.getElementById('navTimeline');
  if (tl && tl.getContext) {
    const picks = rep.picked || [];
    if (!picks.length) {
      emptyHint(tl, 80, '这份报告没有作答顺序记录');
    } else {
      const h = 80;
      const { ctx, w } = setupHiDPI(tl, h);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(226,232,240,0.08)'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.beginPath(); ctx.moveTo(20, h / 2); ctx.lineTo(w - 10, h / 2); ctx.stroke();
      const step = (w - 44) / picks.length;
      const ticks = [];
      picks.forEach((p, i) => {
        const x = 22 + i * step + step / 2;
        ctx.strokeStyle = 'rgba(100,116,139,.7)';
        ctx.beginPath(); ctx.moveTo(x, h / 2 - 12); ctx.lineTo(x, h / 2 + 12); ctx.stroke();
        ticks.push({ x: 22 + i * step, y: h / 2 - 12, w: Math.max(step, 4), h: 24, idx: i, qid: p.qid, opt: p.optionId });
      });
      attachTooltip(tl, ticks, t => `事件 #${t.idx + 1}\nQID ${t.qid}\n选项 ${t.opt}`);
    }
  }
}

/* ---------- 提示词 ---------- */
function buildFacultyPayload(rep, r) {
  const evidence = BANK.map(q => {
    const oid = r.answers[q.id];
    const o = q.options.find(x => x.id === oid);
    if (!o) return null;
    return {
      qid: q.id, scenario: q.scenario,
      selected: { id: o.id, label: o.label, taste_pref: CIT.prefOf(TASTE, q.id, o.id), dims: o.dims },
      duration_ms: (rep.pace && rep.pace.durations && rep.pace.durations[q.id]) || null
    };
  }).filter(Boolean);

  return {
    schema_version: 'roma-cit-faculty-prompt-v3',
    language: 'zh-CN',
    role: 'ROMA Lab CIT admissions evaluator',
    task: '基于学生作答、系统计算结果与题库证据，生成审慎、证据导向、中文的导师测评报告。',
    scoring_model: {
      version: CIT.VERSION,
      dimensions: {
        BND: '分寸感：数据、署名、隐私、合作边界与场合判断',
        COM: '沟通：主动澄清、同步、协调、建设性表达',
        EMP: '同理：对他人感受、处境、压力与尊严的觉察',
        INT: '诚信：科研诚信、透明度、规则意识、可追溯性',
        CRE: '创造：能否主动生成替代方案，而非只在既定选项里挑',
        RES: '抗压：受挫、赶工与不确定情境下能否稳住并推进'
      },
      scale: '每维 0-100。50 = 随机作答期望；100 = 每道题都选了最体现该特质的选项；0 = 每道题都选最差。60 以上明显高于基线，40 以下明显偏弱。注意 100 分按「本题真正可达到的上限」标定，因为稳妥的答案未必是该维最突出的答案；六个维度不会同时满分。',
      score_field: '选项的 taste_pref 是 0-3 的实验室口味分级：0=与实验室取向明显相左，1=可接受但保守被动，2=较接近，3=最贴近。它衡量的是情境判断与实验室取向的契合，不是人格优劣，换一套口味文件这个分级会变。',
      fit_weights: r.W,
      caution: '维度高不代表「人更好」，只代表这些情境里选得更成熟；避免道德化标签与人格定型。'
    },
    data: {
      student_report: {
        items: rep.total || CIT.TOTAL_ITEMS, answered: rep.answered, timestamp: rep.timestamp,
        legacy_short: !!r.legacyShort,
        answers: r.answers
      },
      verification: {
        bank_version: (TASTE && TASTE.bank_binding && TASTE.bank_binding.bank_version) || CIT.VERSION,
        report_bank_hash: r.ver.reportHash,
        current_bank_hash: r.ver.bankHash,
        bank_match: r.ver.bankMatch,
        taste_id: r.ver.tasteId,
        taste_name: TASTE ? TASTE.name : null,
        report_taste_id: r.ver.reportTasteId,
        report_taste_hash: r.ver.reportTasteHash,
        current_taste_hash: r.ver.tasteHash,
        taste_match: r.ver.tasteMatch,
        taste_binding_ok: !!(r.tasteBind && r.tasteBind.ok),
        migrated_from_v4_3: r.migrated,
        note: r.migrated
          ? '该报告来自 v4.3，已按选项文本迁移后重算；v4.3 的「创造与抗压」维度存在已知缺陷（恒为满分），不可引用。'
          : (r.ver.bankMatch ? '题库指纹一致，分数可直接引用。' : '题库指纹不一致，已按当前题库重算，原报告的 per 不采信。')
      },
      computed_metrics: {
        dimension: r.ratio,
        coverage: r.score.coverage,
        usable: r.score.usable,
        resolution: r.score.resolution,
        roma_fit: r.fit,
        quality: r.score.quality,
        risks: {
          publicityRisk: Math.round(r.publicityRisk),
          integrityRisk: Math.round(r.integrityRisk),
          volatilityRisk: Math.round(r.volatilityRisk),
          egoismRisk: Math.round(r.egoismRisk)
        },
        pace: r.pace,
        gaming_suspicion: r.gaming ? {
          level: r.gaming.level, top_picks: `${r.gaming.topCount}/${r.gaming.topN}`,
          changes: r.gaming.changeCount, total_min: r.gaming.totalMin,
          reasons: r.gaming.reasons,
          note: r.gaming.level
            ? '存在押中评分表的异常信号，面试时应就具体题目追问取舍理由核验。'
            : '未见押中评分表的异常信号。'
        } : null,
        flags: { severe: r.score.flags.severe, weak: r.score.flags.weak.slice(0, 10) },
        trigger_hits: r.triggerHits
      },
      selected_evidence: evidence
    },
    requirements: [
      '全文使用中文。',
      '区分事实、计算结果、解释性推断；不要把启发式风险当成诊断结论。',
      '每个关键判断必须引用至少一个题号、情境与所选选项。',
      '对 40 分以下或未测量的维度，明确写「证据不足」，不要补故事。',
      '风险指标是提示项，请写明来自哪些题，而不是给人贴标签。',
      '不要输出推理过程。'
    ],
    expected_sections: [
      '开头：ROMA Lab 招生评估报告 + 报告版本 / 评估对象 / 完成度 / 题库指纹是否一致',
      '核心画像（六维逐一说明，标注是否可测）',
      '关键证据链（题号 / 情境 / 选项 / 解释）',
      '潜在风险与成因（每条附题号依据）',
      '这份结果的可信度（作答节奏、选项质量、严重/轻微标记）',
      '面试核验建议（5-8 个具体追问）',
      '综合结论与录取建议（分情境给出）'
    ]
  };
}

function buildPrompts(rep, r) {
  const box = $('#promptFacultyJSON');
  if (!box) return;
  box.value = JSON.stringify(buildFacultyPayload(rep, r), null, 2);
}

/* ---------- 主流程 ---------- */
async function handleFile(f) {
  let data;
  try {
    data = JSON.parse(await f.text());
  } catch (e) {
    alert('不是有效的 JSON');
    return;
  }
  if (!data.answers || !Object.keys(data.answers).length) {
    alert('这份文件不像是 CIT 报告（缺少 answers）');
    return;
  }
  LAST = data;
  const meta = $('#meta');
  if (meta) {
    meta.innerHTML = `作答 ${data.answered || Object.keys(data.answers).length}/${data.total || CIT.TOTAL_ITEMS} 题`
      + ` · 报告版本 ${data.bankVersion || data.version || '未知'}`
      + ` · 题库指纹 ${data.bankHash || '无（v4.3 及更早）'}`
      + ` · 口味 ${data.tasteId ? data.tasteId + '（' + (data.tasteHash || '未记指纹') + '）' : '未记录'}`;
  }
  const rawEl = $('#raw');
  if (rawEl) rawEl.textContent = JSON.stringify(data, null, 2);

  await loadConfig();
  const r = await analyze(data);
  LAST.analysis = r;

  renderBars(r);
  renderKPI(r);
  renderDiag(r);
  renderDecision(r);
  renderSummary(r);
  renderEvidence(data, r);
  renderNav(data);

  const trigBox = $('#trigs');
  if (trigBox) {
    trigBox.textContent = r.triggerHits.length
      ? r.triggerHits.map(t => `${t.qid} · ${t.key} · ${JSON.stringify(t.affect)}`).join('\n')
      : '(无)';
  }
  buildPrompts(data, r);
}

const drop = $('#drop'), fileInput = $('#file');
if (drop) {
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
}
if (fileInput) fileInput.addEventListener('change', e => { const f = e.target.files[0]; if (f) handleFile(f); });

window.downloadText = function (id, filename) {
  const el = document.getElementById(id); if (!el) return;
  const blob = new Blob([el.value || el.textContent || ''], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
};

function copyWithToast(textareaId, btn) {
  const val = (document.getElementById(textareaId)?.value) || '';
  navigator.clipboard.writeText(val).then(() => {
    const old = btn.textContent;
    btn.textContent = '已复制 ✓';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 800);
  });
}
