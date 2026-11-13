/* ROMA Lab CIT · 学生端 v5.3
 * 计分逻辑全部来自 scoring.js（与导师端共用），本文件只负责交互与呈现。
 * 题库（dims）与口味（preference）是两个文件，这里只负责把它们一起载入。
 */
const CIT = window.CIT;
const DIMS = CIT.DIMS;
const LABEL = CIT.DIM_LABEL;

// 进度暂存的 localStorage 键（见 saveProgress / restoreProgress）
const PROGRESS_KEY = 'romaCIT.progress.v1';

const state = {
  bank: [],
  taste: null,
  idx: 0,
  answers: {},
  pickedHistory: [],
  pace: { durations: {}, order: [], timestamps: [] },
  score: null,
  name: '',
  _showTs: null,
  navEvents: []
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const T = {
  title: 'ROMA Lab Cultural Insight Test (v5.3)',
  about_title: 'ROMA Lab · 六维科研气质评估模型（CIT v5.3）',
  about_html: `
<p><b>ROMA Lab 自主研发</b>的轻量评估模型，帮助你了解自己的科研气质，并与实验室文化做自我参照。</p>
<ul>
  <li><b>没有标准答案：</b>每个选项都是在真实情境里成立的做法，你多半会纠结——这是刻意的。</li>
  <li><b>纯前端脚本：</b>不采集、不上传数据，结果仅存于你的浏览器。</li>
  <li><b>固定 50 题：</b>六个维度都要有足够题量才测得出差异，所以不设简版。</li>
  <li><b>六个维度：</b>分寸感（BND）、沟通（COM）、同理（EMP）、诚信（INT）、创造（CRE）、抗压（RES）。</li>
</ul>
<p><b>为什么每个选项看起来都对？</b>因为如果某道题里有一个明显"更正确"的选项，它就变成了常识题——你只要照着说得最漂亮的那句选，我们就在测你的应试技巧，而不是你真实的处事方式。所以这里的每一道题都尽量让四个选项各有各的道理：区别不在"对错"，在你愿意付出哪一种代价、先照顾哪一件事。你纠结的那一刻，恰恰是这道题最有信息量的时候。</p>
<p>分数怎么读：<b>50 分</b>相当于「与随意作答的期望水平相当」，<b>100 分</b>表示该维度每道题都选了最能体现这一特质的选项，<b>0 分</b>表示每道题都选了最差的那个。所以 60 分以上已经是明显高于基线的表现。</p>
<p class="small">说明：部分题目里「最稳妥的答案」并不是该维度最突出的答案，因此六个维度不会同时满分——这是题目设计使然，不是扣分。</p>
<p>完成后将生成你的可视化画像与助教寄语，供你自我评估是否与 ROMA Lab 的工作方式契合。</p>
<p class="small muted">© 2026 ROMA Lab. All rights reserved.</p>`,
  desc: '50 道情境题，约 12–15 分钟。四个选项往往都说得通，请凭第一反应选你真正会做的那个。全程不收集任何个人数据，结果只保存在你的浏览器。',
  hint: '完成可导出 JSON 与打印 PDF；如需导师做进一步分析，可将导出的 JSON 交给导师。',
  congrats: '🎉 恭喜你完成答题！',
  next: '现在你可以查看你的报告（仅保存在本地）。',
  modalTitle: '🎊 恭喜你完成答题！',
  modalDesc: '现在你可以查看你的报告啦～',
  btnReport: '查看报告',
  btnLater: '稍后再看',
  coach: '助教寄语',
  privacy: '隐私说明：所有计算都在你的浏览器端完成，本页不上传任何数据；导出的 JSON 由你自行决定是否交给导师。若交给导师，导师端分析在本地进行；如导师使用 AI 生成测评报告，你的作答数据（不含姓名）会被发送至相应的模型服务商处理。',
  radar: '六维雷达图',
  donut: '维度占比',
  spark: '答题节奏',
  praises: {
    BND: '你对边界的拿捏很细腻，知道什么该共享、什么该先确认。',
    COM: '你的表达清晰而体面，兼顾效率与照顾他人感受。',
    EMP: '你能把人看作一个完整的人，愿意先理解再推进。',
    INT: '你有稳定的原则感，愿意为可复现、可追溯负责。',
    CRE: '你会主动设计替代方案，而不是只在既定选项里挑。',
    RES: '遇到阻力时你能稳住并继续推进，而不是先撤。',
    SUM: '这种组合让你的行动更自洽，也更有穿透力。'
  }
};

/* ---------- 导航辅助 ---------- */
const isAnswered = i => state.bank[i] && !!state.answers[state.bank[i].id];
const findPrevAnsweredIndex = cur => { for (let i = cur - 1; i >= 0; i--) if (isAnswered(i)) return i; return -1; };
const findNextAnsweredIndex = cur => { for (let i = cur + 1; i < state.bank.length; i++) if (isAnswered(i)) return i; return -1; };
const allAnswered = () => state.bank.every(q => !!state.answers[q.id]);

/* ---------- 图形 ---------- */
const palette = i => ['#60a5fa', '#22d3ee', '#a3e635', '#f59e0b', '#c084fc', '#fb7185'][i % 6];

function radarSVG(per) {
  const keys = DIMS.filter(d => per[d] !== null);
  const N = keys.length, size = 280, r = 96, cx = 140, cy = 140;
  const angle = i => -Math.PI / 2 + i * 2 * Math.PI / N;

  const grid = [1, 0.75, 0.5, 0.25].map(k => {
    const ring = Array.from({ length: N }, (_, i) => {
      const a = angle(i);
      return [(cx + r * k * Math.cos(a)).toFixed(1), (cy + r * k * Math.sin(a)).toFixed(1)].join(',');
    }).join(' ');
    return `<polygon points="${ring}" fill="none" stroke="currentColor" opacity="0.12"/>`;
  }).join('');

  // 50 分基线环 = 随意作答的期望水平
  const baseRing = Array.from({ length: N }, (_, i) => {
    const a = angle(i);
    return [(cx + r * 0.5 * Math.cos(a)).toFixed(1), (cy + r * 0.5 * Math.sin(a)).toFixed(1)].join(',');
  }).join(' ');
  const dotsBase = keys.map((k, i) => {
    const a = angle(i), rr = r * 0.5;
    return `<circle cx="${(cx + rr * Math.cos(a)).toFixed(1)}" cy="${(cy + rr * Math.sin(a)).toFixed(1)}" r="1.6" fill="currentColor" opacity="0.35"/>`;
  }).join('');

  const pts = keys.map((k, i) => {
    const a = angle(i);
    const rr = r * (per[k] || 0) / 100;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  });
  const poly = pts.map(p => p.join(',')).join(' ');
  const labels = keys.map((k, i) => {
    const a = angle(i);
    const lx = cx + (r + 24) * Math.cos(a), ly = cy + (r + 24) * Math.sin(a);
    const anchor = Math.abs(Math.cos(a)) < 0.25 ? 'middle' : (Math.cos(a) > 0 ? 'start' : 'end');
    return `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" font-size="11" text-anchor="${anchor}" fill="currentColor">${LABEL[k]}</text>`;
  }).join('');
  const dots = pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${palette(DIMS.indexOf(keys[i]))}"/>`).join('');

  return `<svg viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee" stop-opacity="0.32"/><stop offset="1" stop-color="#a3e635" stop-opacity="0.32"/></linearGradient></defs>
    ${grid}
    <polygon points="${baseRing}" fill="none" stroke="currentColor" stroke-dasharray="3 3" opacity="0.45"/>
    ${dotsBase}
    <polygon points="${poly}" fill="url(#rg)" stroke="currentColor" stroke-width="1.6" opacity="0.9"/>
    ${dots}${labels}
  </svg>`;
}

function arcPath(R, r, a0, a1) {
  const x0 = R * Math.cos(a0), y0 = R * Math.sin(a0), x1 = R * Math.cos(a1), y1 = R * Math.sin(a1),
    xl = r * Math.cos(a0), yl = r * Math.sin(a0), xr = r * Math.cos(a1), yr = r * Math.sin(a1),
    large = (a1 - a0) > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${xr} ${yr} A ${r} ${r} 0 ${large} 0 ${xl} ${yl} Z`;
}

function donutSVG(per) {
  const keys = DIMS.filter(d => per[d] !== null);
  const total = keys.reduce((a, k) => a + per[k], 0) || 1;
  let acc = 0;
  const R = 86, r = 40;
  const segs = keys.map(k => {
    const v = per[k] / total;
    const a0 = acc * 2 * Math.PI, a1 = (acc + v) * 2 * Math.PI;
    acc += v;
    return `<path d="${arcPath(R, r, a0, a1)}" fill="${palette(DIMS.indexOf(k))}" opacity="0.65"><title>${LABEL[k]} ${per[k]}</title></path>`;
  }).join('');
  return `<svg viewBox="0 0 220 220"><g transform="translate(110,110)">${segs}</g></svg>`;
}

function sparkSVG(arr, durs) {
  if (!arr.length) return '<svg viewBox="0 0 260 60"></svg>';
  const w = 260, h = 60, m = 10, step = (w - 2 * m) / Math.max(1, arr.length - 1);
  const y = v => h - m - v * (h - 2 * m);
  let d = '';
  arr.forEach((v, i) => { d += (i ? 'L' : 'M') + (m + i * step) + ' ' + y(v * 0.8 + 0.1) + ' '; });
  // 颜色按答题速度分档，比「按题号彩虹色」有信息量：一眼看出哪几题是秒选、哪几题卡住
  const speedColor = ms => (!Number.isFinite(ms) || ms <= 0) ? '#64748b'
    : ms < 1200 ? '#fb923c' : (ms > 12000 ? '#38bdf8' : '#a5b4fc');
  const bars = arr.map((v, i) => {
    const x = m + i * step;
    const ms = durs ? durs[i] : NaN;
    return `<line x1="${x}" y1="${h - m}" x2="${x}" y2="${y(v * 0.8 + 0.1)}" stroke="${speedColor(ms)}" stroke-width="2" opacity="0.85"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="#e5e7eb" stroke-width="1.4" opacity="0.35"/>${bars}</svg>`;
}

/* ---------- 助教寄语：只取可测维度 ---------- */
function buildCoach(score) {
  const per = score.per;
  const keys = DIMS.filter(d => per[d] !== null).sort((a, b) => per[b] - per[a]);
  const band = p => p >= 80 ? '很稳，已经可以依赖。'
    : p >= 65 ? '明显高于基线。'
      : p >= 50 ? '在基线附近，属于正常区间。'
        : p >= 40 ? '略低于基线。'
          : '明显低于基线。';
  const items = keys.map(k => `${LABEL[k]}：${per[k].toFixed(1)} 分 — ${T.praises[k]}${band(per[k])}`);

  const gap = DIMS.filter(d => per[d] === null);
  const gapNote = gap.length
    ? `本次「${gap.map(d => LABEL[d]).join('、')}」未纳入评估（当前题库该维度的区分题不足）。`
    : '';
  const low = keys[keys.length - 1];
  const focus = low && per[low] < 50
    ? `如果只挑一件事练，可以先从「${LABEL[low]}」入手——它是这次相对最低的一项。`
    : '';
  const coarse = DIMS.filter(d => per[d] !== null && score.resolution && score.resolution[d] === 'coarse');
  const coarseNote = coarse.length
    ? `提醒：「${coarse.map(d => LABEL[d]).join('、')}」的分数可以看趋势、不宜当精确值。`
    : '';
  // 题量固定后正常不会出现不可测维度；留一条兜底，防止将来改题库时静默少测一维
  const top2 = keys.length >= 2
    ? `「${LABEL[keys[0]]}」与「${LABEL[keys[1]]}」`
    : `「${LABEL[keys[0]]}」`;
  const summary = `在你的画像里，${top2}相对突出。`
    + T.praises.SUM + focus + gapNote + coarseNote
    + '（想获得更深入的分析，可以把导出的 JSON 交给 ROMA Lab。）';
  return { items, summary };
}

/* ---------- 题库 ---------- */
async function loadBank() {
  let out = [];
  for (const f of CIT.BANK_FILES) {
    const res = await fetch(f, { cache: 'no-store' });
    if (!res.ok) throw new Error(`题库加载失败：${f}`);
    out = out.concat(await res.json());
  }
  if (out.length !== CIT.TOTAL_ITEMS) {
    throw new Error(`题库题量异常：${out.length} 题，应为 ${CIT.TOTAL_ITEMS} 题`);
  }
  return out;
}

async function loadTaste() {
  const res = await fetch(`${CIT.TASTE_DIR}/${CIT.DEFAULT_TASTE}.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error('口味文件加载失败');
  return res.json();
}

/* ---------- 进度暂存（刷新/误关页面不丢进度） ---------- */
function saveProgress() {
  try {
    if (!state.bank.length) return;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      v: 1,
      bankHash: CIT.hashBank(state.bank),
      tasteHash: state.taste ? CIT.hashTaste(state.taste) : null,
      name: state.name,
      idx: state.idx,
      answers: state.answers,
      pickedHistory: state.pickedHistory,
      pace: state.pace,
      navEvents: state.navEvents,
      savedAt: Date.now()
    }));
  } catch (e) { /* 隐私模式等场景下静默失败，不影响作答 */ }
}

function loadSavedProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function clearProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch (e) { /* ignore */ }
}

function resetQuizState() {
  state.answers = {};
  state.pickedHistory = [];
  state.pace = { durations: {}, order: [], timestamps: [] };
  state.navEvents = [];
  state.idx = 0;
}

async function start() {
  try {
    state.bank = await loadBank();
    state.taste = await loadTaste();
    const bind = CIT.bindTaste(state.taste, state.bank);
    if (!bind.ok) {
      // 拿旧口味套新题会静默算错分，必须挡住而不是警告了事
      throw new Error('题库与口味文件不匹配：' + bind.issues.map(i => i.msg).join('；'));
    }
    resetQuizState();
    // 有未提交的暂存且题库/口味未变 → 询问是否继续；指纹对不上（升级过）直接丢弃
    const saved = loadSavedProgress();
    if (saved) {
      const sameBank = saved.bankHash === CIT.hashBank(state.bank);
      const sameTaste = saved.tasteHash === CIT.hashTaste(state.taste);
      const savedN = saved.answers ? Object.keys(saved.answers).length : 0;
      if (sameBank && sameTaste && savedN > 0) {
        const resume = window.confirm(
          `检测到你上次答到 ${savedN}/${state.bank.length} 题（未提交）。\n点「确定」继续上次作答，点「取消」重新开始。`
        );
        if (resume) {
          state.answers = saved.answers || {};
          state.pickedHistory = saved.pickedHistory || [];
          state.pace = saved.pace || { durations: {}, order: [], timestamps: [] };
          state.navEvents = saved.navEvents || [];
          state.idx = Math.min(saved.idx || 0, state.bank.length - 1);
          if (saved.name && !state.name) {
            state.name = saved.name;
            const ni = $('#nameInput');
            if (ni) ni.value = saved.name;
          }
        } else {
          clearProgress();
        }
      } else {
        clearProgress();
      }
    }
    state.score = CIT.compute(state.bank, state.answers, state.taste);
    $('#quiz').classList.remove('hidden');
    $('#setup').classList.add('hidden');
    const about = $('#aboutBox');
    if (about) about.open = false;   // 开始答题后收起说明，别挡题
    $('#modeTag').textContent = `50 题`;
    renderAll();
  } catch (e) {
    alert(e.message || '题库加载失败');
  }
}

/* ---------- 渲染 ---------- */
function renderAll() { renderProgress(); renderQuestion(); }

function renderProgress() {
  const answered = Object.keys(state.answers).length;
  const total = state.bank.length || 1;
  const bar = $('#bar');
  if (bar) bar.style.width = Math.round(answered / total * 100) + '%';
}

function renderQuestion() {
  const q = state.bank[state.idx];
  if (!q) return;
  state._showTs = Date.now();
  $('#idx').textContent = `${state.idx + 1} / ${state.bank.length}`;
  $('#chapter').textContent = (q.tags || []).join(' / ');
  $('#qtitle').textContent = q.title || '情境题';
  $('#qsc').textContent = q.scenario;

  const opts = $('#opts');
  opts.innerHTML = '';
  q.options.forEach(o => {
    const d = document.createElement('div');
    d.className = 'opt';
    d.setAttribute('data-opt', o.id);
    if (state.answers[q.id] === o.id) d.classList.add('selected');
    d.textContent = o.label;
    d.onclick = () => {
      const now = Date.now();
      if (!Object.prototype.hasOwnProperty.call(state.pace.durations, q.id)) {
        state.pace.durations[q.id] = now - (state._showTs || now);
        state.pace.order.push(q.id);
        state.pace.timestamps.push(now);
      }
      state.answers[q.id] = o.id;
      state.pickedHistory.push({ qid: q.id, optionId: o.id, ts: now });
      $$('#opts .opt').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
      state.score = CIT.compute(state.bank, state.answers, state.taste);
      renderProgress();
      saveProgress();

      if (allAnswered()) { onSubmit(); return; }
      if (state.idx < state.bank.length - 1) {
        // 点选即跳下一题（v5.3 回退：停留窗口会掩盖「快速糊弄」的作答信号；
        // 改答通过「上一题」回退完成，navEvents 里的 prev 记录就是真实改答数据）。
        const from = state.idx;
        state.idx += 1;
        state.navEvents.push({ type: 'auto', from, to: state.idx, ts: Date.now() });
        renderQuestion();
      }
    };
    opts.appendChild(d);
  });

  const prevBtn = $('#prevBtn'), nextBtn = $('#nextBtn');
  const prevIdx = findPrevAnsweredIndex(state.idx);
  const nextIdx = findNextAnsweredIndex(state.idx);
  prevBtn.disabled = prevIdx === -1;
  nextBtn.disabled = !state.answers[q.id] || nextIdx === -1;
  prevBtn.onclick = () => {
    if (prevIdx === -1) return;
    state.navEvents.push({ type: 'prev', from: state.idx, to: prevIdx, ts: Date.now() });
    state.idx = prevIdx;
    renderQuestion();
  };
  nextBtn.onclick = () => {
    if (!state.answers[q.id] || nextIdx === -1) return;
    state.navEvents.push({ type: 'next', from: state.idx, to: nextIdx, ts: Date.now() });
    state.idx = nextIdx;
    renderQuestion();
  };
}

function onSubmit() {
  state.score = CIT.compute(state.bank, state.answers, state.taste);
  clearProgress();   // 已完成作答，清掉暂存，下次进来是全新的一份
  showModal();
  confettiBurst();
}

function showModal() {
  $('#t_modal_title').textContent = T.modalTitle;
  $('#t_modal_desc').textContent = T.modalDesc;
  $('#goReport').textContent = T.btnReport;
  $('#stayBtn').textContent = T.btnLater;
  $('#doneModal').classList.add('show');
  $('#goReport').onclick = () => { $('#doneModal').classList.remove('show'); renderReport(); };
  $('#stayBtn').onclick = () => $('#doneModal').classList.remove('show');
}

function renderReport() {
  const score = state.score || CIT.compute(state.bank, state.answers, state.taste);
  $('#setup').classList.add('hidden');
  $('#quiz').classList.add('hidden');
  $('#result').classList.remove('hidden');
  $('#t_congrats').textContent = T.congrats;
  $('#t_next').textContent = T.next;
  $('#t_coach').textContent = T.coach;
  $('#t_privacy').textContent = T.privacy;
  $('#radarTitle').textContent = T.radar;
  $('#donutTitle').textContent = T.donut;
  $('#sparkTitle').textContent = T.spark;

  $('#radar').innerHTML = radarSVG(score.per);
  $('#donut').innerHTML = donutSVG(score.per);

  $('#donutLegend').innerHTML = DIMS.filter(d => score.per[d] !== null).map(d =>
    `<span class="item"><span class="dot" style="background:${palette(DIMS.indexOf(d))}"></span>${LABEL[d]}</span>`
  ).join('');

  const ids = state.bank.map(q => q.id);
  const durs = ids.map(id => state.pace.durations[id]).filter(d => Number.isFinite(d) && d > 0);
  const minD = durs.length ? Math.min.apply(null, durs) : 0;
  const maxD = durs.length ? Math.max.apply(null, durs) : 0;
  const span = maxD - minD;
  const arr = ids.map(id => {
    const d = state.pace.durations[id];
    if (!Number.isFinite(d) || d <= 0) return 0;
    if (span <= 0) return 0.5;
    return 0.1 + (1 - (d - minD) / span) * 0.9;
  });
  $('#spark').innerHTML = sparkSVG(arr, ids.map(id => state.pace.durations[id]));
  $('#sparkLegend').innerHTML = [
    '<span class="item"><span class="dot" style="background:#fb923c"></span>1.2 秒内（偏快）</span>',
    '<span class="item"><span class="dot" style="background:#a5b4fc"></span>正常</span>',
    '<span class="item"><span class="dot" style="background:#38bdf8"></span>12 秒以上（偏慢）</span>',
    '<span class="item">柱高与速度成正比</span>'
  ].join('');
  $('#sparkHint').textContent = '横轴：题目顺序（1→N）；柱越高表示该题答得越快。秒选较多的报告，作答可信度会相应下降。';

  const coach = buildCoach(score);
  const ul = $('#coachList');
  ul.innerHTML = '';
  coach.items.forEach(s => {
    const li = document.createElement('li');
    li.textContent = s;
    ul.appendChild(li);
  });
  const li = document.createElement('li');
  li.className = 'muted';
  li.textContent = coach.summary;
  ul.appendChild(li);

  $('#exportBtn').onclick = exportJSON;
  $('#printBtn').onclick = () => window.print();
  $('#restartBtn').onclick = () => { clearProgress(); location.reload(); };
}

/* 报告载荷的唯一构造函数：导出与端到端测试都走这里，避免字段漂移 */
function buildReport() {
  const score = state.score || CIT.compute(state.bank, state.answers, state.taste);
  return {
    schema: 'roma-cit-report',
    version: CIT.VERSION,
    bankVersion: (state.taste && state.taste.bank_binding && state.taste.bank_binding.bank_version) || CIT.VERSION,
    bankHash: CIT.hashBank(state.bank),
    // 口味：报告必须记下用的是哪一套偏好，否则导师端无法判断契合度是否同一把尺子
    tasteId: state.taste ? state.taste.taste_id : null,
    tasteVersion: state.taste ? state.taste.version : null,
    tasteHash: state.taste ? CIT.hashTaste(state.taste) : null,
    mode: 'full',           // 兼容字段：v5.0 起只有 50 题一种模式，恒为 'full'
    items: state.bank.length,
    name: state.name || '',
    answered: score.answered,
    total: score.total,
    per: score.per,
    raw: score.raw,
    coverage: score.coverage,
    usable: score.usable,
    resolution: score.resolution,
    quality: score.quality,
    flags: { severe: score.flags.severe, weak: score.flags.weak },
    answers: state.answers,
    picked: state.pickedHistory,
    pace: state.pace,
    navEvents: state.navEvents,
    timestamp: new Date().toISOString()
  };
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(buildReport(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ROMA_CIT_zh_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function confettiBurst() {
  const c = document.getElementById('confetti');
  if (!c) return;
  const ctx = c.getContext('2d');
  const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
  resize();
  const parts = Array.from({ length: 100 }, () => ({
    x: Math.random() * c.width, y: -10,
    vx: (Math.random() - 0.5) * 2, vy: Math.random() * 2 + 2,
    s: Math.random() * 6 + 4, a: 1
  }));
  let t = 0;
  (function frame() {
    ctx.clearRect(0, 0, c.width, c.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.a -= 0.008;
      ctx.fillStyle = `hsla(${(t + p.x) % 360},80%,60%,${Math.max(0, p.a)})`;
      ctx.fillRect(p.x, p.y, p.s, p.s * 0.6);
    });
    t += 2;
    if (parts.some(p => p.a > 0 && p.y < c.height + 20)) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, c.width, c.height);
  })();
}

/* ---------- 启动 ---------- */
function initCIT() {
  document.title = T.title;
  const set = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
  set('#t_title', T.title);
  set('#t_desc', T.desc);
  set('#t_hint', T.hint);
  set('#t_about_title', T.about_title);
  $('#verTag').textContent = 'v' + CIT.VERSION;
  $('#modeTag').textContent = '50 题';
  const ac = $('#aboutContent'); if (ac) ac.innerHTML = T.about_html;

  $('#themeBtn').onclick = () => document.body.classList.toggle('light');
  $('#startBtn').onclick = () => start();
  const nameInput = $('#nameInput');
  if (nameInput) nameInput.addEventListener('input', e => { state.name = e.target.value.trim(); saveProgress(); });
}

document.addEventListener('DOMContentLoaded', initCIT);
