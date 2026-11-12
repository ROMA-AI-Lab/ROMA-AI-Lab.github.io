/* CIT v5.0 端到端测试（真实浏览器）
 * 运行：node tests/e2e.mjs
 * 做的事：起静态服务 → Chrome 无头打开学生端 → 真实点击答完 50 题 → 取报告
 *        → 打开导师端 → 载入该报告 → 核对六维/指纹/提示词
 *        → 再载入一份 v4.3 旧报告 → 核对迁移告警
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUIZ = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const PORT = 8971;
const CDP_PORT = 9333;
// Chrome 路径：默认 macOS 本机；CI（Linux）用环境变量 CIT_CHROME 指定（如 /usr/bin/google-chrome）
const CHROME = process.env.CIT_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { console.log('  ✓ ' + name); pass++; }
  else { console.log('  ✗ ' + name + (extra ? '\n     ' + extra : '')); fail++; }
};

/* ---------- CDP 客户端 ---------- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression, awaitPromise = true) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise, returnByValue: true, allowUnsafeEvalBlockedByCSP: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error');
    return r.result?.value;
  }
}

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
        const cdp = new CDP(ws);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        return cdp;
      }
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('无法连接 Chrome 调试端口');
}

async function navigate(cdp, url) {
  await cdp.send('Page.navigate', { url });
  for (let i = 0; i < 80; i++) {
    await sleep(150);
    const state = await cdp.eval('document.readyState');
    if (state === 'complete') return;
  }
  throw new Error('页面加载超时：' + url);
}

/* ---------- 主流程 ---------- */
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: QUIZ, stdio: 'ignore'
});
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--no-sandbox',
  `--remote-debugging-port=${CDP_PORT}`, '--user-data-dir=/tmp/cit-e2e-profile',
  '--window-size=1280,900', 'about:blank'
], { stdio: 'ignore' });

let code = 0;
try {
  const cdp = await connect();
  console.log('\n[1] 学生端：真实点击答完 50 题');
  await navigate(cdp, `http://127.0.0.1:${PORT}/index.html`);

  const boot = await cdp.eval(`({
    hasCIT: typeof CIT === 'object',
    version: (typeof CIT==='object') ? CIT.VERSION : null,
    verTag: document.querySelector('#verTag')?.textContent,
    hasLangBtn: !!document.querySelector('#langBtn')
  })`);
  ok('scoring.js 已加载', boot.hasCIT, JSON.stringify(boot));
  ok('页头版本号与内核一致', boot.verTag === 'v' + boot.version, `界面 ${boot.verTag} / 内核 v${boot.version}`);
  ok('语言切换按钮已移除', boot.hasLangBtn === false);

  const setupUi = await cdp.eval(`({
    start: !!document.querySelector('#startBtn'),
    core: !!document.querySelector('#coreBtn'),
    full: !!document.querySelector('#fullBtn'),
    tag: document.querySelector('#modeTag')?.textContent
  })`);
  ok('只有单一「开始作答」入口，无模式选择', setupUi.start && !setupUi.core && !setupUi.full, JSON.stringify(setupUi));
  ok('页头标注固定 50 题', setupUi.tag === '50 题', String(setupUi.tag));

  // 复用的浏览器 profile 里可能有陈旧暂存，先清掉，避免触发「继续上次作答」确认框
  await cdp.eval(`localStorage.clear(); true`, false);

  await cdp.eval(`document.querySelector('#startBtn').click(); true`);
  await sleep(400);

  const q = await cdp.eval(`({ n: state.bank.length, idx: state.idx, opts: document.querySelectorAll('#opts .opt').length })`);
  ok('载入 50 题（唯一模式）', q.n === 50, JSON.stringify(q));
  ok('每题渲染 4 个选项', q.opts === 4);

  // M1：选后停留窗口——未开 __CIT_FAST 时，选中不立即跳题，约 700ms 后自动跳
  const hold = await cdp.eval(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const before = state.idx;
    document.querySelector('#opts .opt').click();
    const immediate = state.idx;
    await sleep(950);
    return { before, immediate, after: state.idx };
  })()`);
  ok('选中后停留确认窗口（不立即跳，~700ms 自动跳下一题）',
    hold.immediate === hold.before && hold.after === hold.before + 1, JSON.stringify(hold));

  // M2：答过的题应已暂存到 localStorage（刷新可恢复）
  const savedN = await cdp.eval(`(() => {
    const s = JSON.parse(localStorage.getItem('romaCIT.progress.v1') || 'null');
    return s && s.answers ? Object.keys(s.answers).length : 0;
  })()`);
  ok('答题进度已暂存 localStorage', savedN >= 1, String(savedN));

  // 后续 50 题流程打开测试钩子，跳过停留窗口（否则整套测试要多等 35 秒）
  await cdp.eval(`window.__CIT_FAST = true; true`, false);

  // 真实点击：每题选「契合度最高」的选项，模拟一个成熟作答者
  const done = await cdp.eval(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let guard = 0;
    while (document.querySelector('#result').classList.contains('hidden')) {
      if (++guard > 400) return { error: 'loop' };
      const cur = state.bank[state.idx];
      const best = cur.options.reduce((a, b) =>
        (CIT.prefOf(state.taste, cur.id, b.id) ?? 0) > (CIT.prefOf(state.taste, cur.id, a.id) ?? 0) ? b : a,
        cur.options[0]);
      const el = document.querySelector('#opts .opt[data-opt="' + best.id + '"]');
      if (!el) return { error: 'no option ' + best.id };
      el.click();
      await sleep(12);
      // 完成时会弹窗，点「查看报告」
      const go = document.querySelector('#goReport');
      if (go && document.querySelector('#doneModal').classList.contains('show')) go.click();
    }
    await sleep(200);
    return { answered: Object.keys(state.answers).length };
  })()`);
  await sleep(300);
  ok('50 题全部作答并自动进入报告', done && done.answered === 50, JSON.stringify(done));

  const progressCleared = await cdp.eval(`localStorage.getItem('romaCIT.progress.v1') === null`);
  ok('提交后暂存进度已清除', progressCleared === true);

  const view = await cdp.eval(`({
    radarLabels: [...document.querySelectorAll('#radar text')].map(t => t.textContent),
    legend: [...document.querySelectorAll('#donutLegend .item')].map(x => x.textContent.trim()),
    coach: [...document.querySelectorAll('#coachList li')].map(x => x.textContent),
    per: state.score.per,
    hasNull: Object.values(state.score.per).some(v => v === null)
  })`);
  ok('雷达图有 6 个维度标签', view.radarLabels.length === 6, view.radarLabels.join(','));
  ok('图例 6 项', view.legend.length === 6, view.legend.join(' / '));
  ok('六维分数均非空', view.hasNull === false, JSON.stringify(view.per));
  ok('助教寄语含 6 条维度 + 1 条总结', view.coach.length === 7, '实际 ' + view.coach.length);
  ok('寄语里不再出现「创造韧性」', !view.coach.join('').includes('创造韧性'));
  // v5.2 起最优解唯一：逐题押中口味可达六维 100，这是设计而非 bug。
  // 真正要防的回归是 v4.3 的「恒满分」（随便答都 100）——用朴素作答在页面里重算验证。
  const guard = await cdp.eval(`(() => {
    const naive = {};
    state.bank.forEach(q => { naive[q.id] = q.options[0].id; });
    const s = CIT.compute(state.bank, naive, state.taste);
    return { best: Object.values(state.score.per), naivePer: Object.values(s.per) };
  })()`);
  ok('逐题押中口味可达满分（v5.2 设计：最优解唯一）',
    guard.best.filter(v => v >= 99.9).length === 6, JSON.stringify(guard.best));
  ok('朴素作答不会六维全 100（恒满分缺陷回归守卫）',
    guard.naivePer.filter(v => v >= 99.9).length < 6, JSON.stringify(guard.naivePer));

  const report = await cdp.eval(`buildReport()`);
  ok('导出的报告带题库指纹', typeof report.bankHash === 'string' && report.bankHash.length === 8, report.bankHash);
  ok('导出的报告带口味指纹与口味名',
    typeof report.tasteHash === 'string' && report.tasteHash.length === 8 && report.tasteId === 'roma',
    JSON.stringify({ tasteId: report.tasteId, tasteHash: report.tasteHash }));

  console.log('\n[2] 导师端：载入该报告');
  await navigate(cdp, `http://127.0.0.1:${PORT}/faculty.html`);
  await cdp.eval(`document.querySelector('#verBadge')?.textContent`, false);
  await cdp.eval(`handleFile(new File([${JSON.stringify(JSON.stringify(report))}], 'r.json')); true`);
  await sleep(700);

  const fac = await cdp.eval(`({
    bars: [...document.querySelectorAll('#bars > div')].map(d => d.textContent.replace(/\\s+/g,' ').trim()).filter(t => t.includes('BND')||t.includes('COM')),
    barCount: document.querySelectorAll('#bars > div').length,
    kpi: document.querySelectorAll('#kpi .card').length,
    diag: document.querySelector('#diag').innerText,
    decision: document.querySelector('#decision').innerText,
    badge: document.querySelector('#verBadge').textContent,
    prompt: (() => { try { return JSON.parse(document.querySelector('#promptFacultyJSON').value); } catch(e) { return null; } })(),
    meta: document.querySelector('#meta').innerText,
    privacyNote: (document.querySelector('.ai-privacy-note') || {}).textContent || ''
  })`);
  ok('六维画像渲染 6 行 + 1 行说明', fac.barCount === 7, '实际 ' + fac.barCount);
  ok('关键信号 6 张卡', fac.kpi === 6, '实际 ' + fac.kpi);
  ok('指纹一致时不出告警', !fac.diag.includes('指纹不一致'), fac.diag.slice(0, 80));
  ok('诊断含 Fit 与风险', /ROMA Fit/.test(fac.diag) && /诚信风险/.test(fac.diag));
  ok('决策文案含免责说明', fac.decision.includes('不是人格测评结论'));
  ok('提示词为 v3 且六维', fac.prompt && fac.prompt.schema_version === 'roma-cit-faculty-prompt-v3'
    && Object.keys(fac.prompt.scoring_model.dimensions).length === 6,
    fac.prompt ? fac.prompt.schema_version : 'null');
  ok('提示词声明的权重与内核一致',
    fac.prompt && Math.abs(Object.values(fac.prompt.scoring_model.fit_weights).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  ok('导师端显示当前口味与绑定状态',
    /ROMA Lab 口味/.test(fac.badge) && /口味/.test(fac.meta),
    `badge=${fac.badge} | meta=${fac.meta}`);
  ok('提示词记录口味指纹，便于判断契合度口径',
    fac.prompt && fac.prompt.data.verification.taste_id === 'roma'
    && fac.prompt.data.verification.current_taste_hash === report.tasteHash
    && fac.prompt.data.verification.taste_binding_ok === true,
    JSON.stringify(fac.prompt?.data.verification));
  ok('导师端重算结果与学生端一致',
    fac.prompt && Object.keys(fac.prompt.data.computed_metrics.dimension).every(k => {
      const a = fac.prompt.data.computed_metrics.dimension[k];
      return Math.abs(a - report.per[k]) < 0.101;
    }), JSON.stringify(fac.prompt?.data.computed_metrics.dimension));
  ok('全中最优报告触发押中红旗',
    fac.diag.includes('疑似预先获取评分表') && fac.diag.includes('押中最优解'),
    fac.diag.slice(0, 200));
  ok('决策建议包含押中核验', fac.decision.includes('押中'), fac.decision.slice(0, 150));
  ok('提示词 payload 记录押中判定',
    fac.prompt && fac.prompt.data.computed_metrics.gaming_suspicion
    && fac.prompt.data.computed_metrics.gaming_suspicion.level === 'alert',
    JSON.stringify(fac.prompt && fac.prompt.data.computed_metrics.gaming_suspicion));
  ok('AI 区域有数据去向告知（DeepSeek · 不含姓名）',
    /DeepSeek/.test(fac.privacyNote) && /不含姓名/.test(fac.privacyNote), fac.privacyNote.slice(0, 80));

  console.log('\n[3] 导师端：载入 v4.3 旧报告（应迁移 + 告警）');
  const LEGACY_SAMPLE = '/Users/xiangguosun/Downloads/各种材料/ROMA_CIT_full_zh_1770481890666.json';
  if (!fs.existsSync(LEGACY_SAMPLE)) {
    console.log('  （跳过：本机没有 v4.3 样本报告）');
  } else {
  const old = JSON.parse(fs.readFileSync(LEGACY_SAMPLE, 'utf8'));
  await cdp.eval(`handleFile(new File([${JSON.stringify(JSON.stringify(old))}], 'old.json')); true`);
  await sleep(700);
  const legacy = await cdp.eval(`({
    diag: document.querySelector('#diag').innerText,
    per: (() => { try { return JSON.parse(document.querySelector('#promptFacultyJSON').value).data.computed_metrics.dimension; } catch(e) { return null; } })(),
    migrated: (() => { try { return JSON.parse(document.querySelector('#promptFacultyJSON').value).data.verification.migrated_from_v4_3; } catch(e) { return null; } })()
  })`);
  ok('旧报告被识别并迁移', legacy.migrated === true, String(legacy.migrated));
  ok('旧报告给出明确告警', legacy.diag.includes('v4.3 旧报告'), legacy.diag.slice(0, 60));
  ok('旧报告重算后出现 CRE / RES 两维',
    legacy.per && legacy.per.CRE !== undefined && legacy.per.RES !== undefined, JSON.stringify(legacy.per));
  ok('旧报告的 CRV 100 不再被沿用', legacy.per && !(legacy.per.CRE >= 99.9 && legacy.per.RES >= 99.9),
    JSON.stringify(legacy.per));
  }

  console.log('\n[4] 旧版 20 题简版报告：必须被标注为不可比');
  // 构造一份 v4.3 时代常见的简版报告：只答了前 20 题、无题库指纹
  const shortBank = JSON.parse(fs.readFileSync(path.join(QUIZ, 'core.zh.json'), 'utf8'));
  const shortAnswers = {};
  shortBank.forEach(q => { shortAnswers[q.id] = q.options[0].id; });
  const shortReport = {
    schema: 'roma-cit-report', version: '4.3.0', mode: 'core', name: '',
    answered: 20, total: 20, answers: shortAnswers,
    pace: { durations: {}, order: [], timestamps: [] }, picked: [],
    timestamp: new Date().toISOString()
  };
  await cdp.eval(`handleFile(new File([${JSON.stringify(JSON.stringify(shortReport))}], 'short.json')); true`);
  await sleep(600);
  const short = await cdp.eval(`({
    diag: document.querySelector('#diag').innerText,
    meta: document.querySelector('#meta').innerText
  })`);
  ok('旧简版被识别（20 题）', short.diag.includes('旧版简版报告'), short.diag.slice(0, 80));
  ok('旧简版明确标注不可横向比较', short.diag.includes('不可'), short.diag.slice(0, 120));
  ok('旧简版不再被当成「缺答 30 题」', !short.diag.includes('缺答 30'), short.diag.slice(0, 120));
} catch (e) {
  console.error('\n运行异常：', e.message);
  fail++;
  code = 1;
} finally {
  try { chrome.kill('SIGKILL'); } catch (e) {}
  try { server.kill('SIGKILL'); } catch (e) {}
  await sleep(600);
  try { fs.rmSync('/tmp/cit-e2e-profile', { recursive: true, force: true, maxRetries: 5 }); } catch (e) { /* chrome 退出时可能仍在写 */ }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
process.exit(fail ? 1 : code);
