// ROMA Lab Faculty Analyzer
const DIM = ['BND', 'COM', 'EMP', 'INT', 'CRV'];
const DIM_NAME = {
    BND: 'Boundary',
    COM: 'Communication',
    EMP: 'Empathy',
    INT: 'Integrity',
    CRV: 'Creativity&Resilience'
};
let RULES = null;
(function () {
    const b = document.getElementById('themeBtn');
    const body = document.body;
    let mode = localStorage.getItem('theme') || 'auto';

    function apply() {
        if (mode === 'light') body.classList.add('light'); else body.classList.remove('light');
    }

    if (b) {
        b.onclick = () => {
            mode = (mode === 'light') ? 'auto' : 'light';
            localStorage.setItem('theme', mode);
            apply();
        };
    }
    apply();
})();
const $ = s => document.querySelector(s);

function barRow(label, ratio) {
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = '160px 1fr 40px';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '8px';
    const l = document.createElement('div');
    l.innerHTML = label;
    const b = document.createElement('div');
    b.className = 'bar';
    const fill = document.createElement('div');
    fill.style.width = (isNaN(ratio) ? 0 : ratio) + '%';
    b.appendChild(fill);
    const r = document.createElement('div');
    r.className = 'muted';
    r.style.textAlign = 'right';
    r.textContent = (isNaN(ratio) ? 0 : ratio) + '%';
    wrap.appendChild(l);
    wrap.appendChild(b);
    wrap.appendChild(r);
    return wrap;
}

let BANK = [];

async function loadConfig() {
    try {
        const res = await fetch('rules.weights.json');
        if (res.ok) RULES = await res.json();
    } catch (e) {
        console.warn('No rules.weights.json found');
    }
}

async function loadBank() {
    const files = ['core.zh.json', 'extended.zh.json', 'core.en.json', 'extended.en.json'];
    BANK = [];
    for (const f of files) {
        try {
            const res = await fetch(f);
            if (res.ok) {
                const arr = await res.json();
                BANK = BANK.concat(arr);
            }
        } catch (e) {
        }
    }
}

Promise.all([loadConfig(), loadBank()]);
const drop = $('#drop'), file = $('#file');
if (drop) {
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
        e.preventDefault();
        drop.classList.add('drag');
    }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
        e.preventDefault();
        drop.classList.remove('drag');
    }));
    drop.addEventListener('drop', e => {
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    });
}
if (file) {
    file.addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) handleFile(f);
    });
}

async function handleFile(f) {
    const txt = await f.text();
    let data;
    try {
        data = JSON.parse(txt);
    } catch (e) {
        alert('不是有效的JSON');
        return;
    }
    $('#meta').textContent = `姓名: ${data.name || ''} · 模式: ${data.mode} · 语言: ${data.lang} · 时间: ${data.timestamp}`;
    $('#raw').textContent = JSON.stringify(data, null, 2);
    await ensureReady();
    const result = analyze(data);
    renderBars(result);
    renderKPI(result);
    renderDiag(result);
    renderDecision(result);
    $('#trigs').textContent = (result.triggerHits || []).map(x => `${x.key} +${x.affectVal}`).join('\n') || '(无)';
}

async function ensureReady() {
    if (!BANK.length) await loadBank();
    if (!RULES) await loadConfig();
}

function analyze(rep) {
    const ans = rep.answers || {};
    const qmap = {};
    BANK.forEach(q => qmap[q.id] = q);
    const per = {BND: 0, COM: 0, EMP: 0, INT: 0, CRV: 0};
    const mx = {BND: 0, COM: 0, EMP: 0, INT: 0, CRV: 0};
    const severeFlags = [];
    const weakFlags = [];
    let answered = 0, goodCount = 0;
    let publicityRisk = 0, integrityRisk = 0, volatilityRisk = 0, egoismRisk = 0;
    const triggerHits = [];
    for (const qid in ans) {
        const q = qmap[qid];
        if (!q) continue;
        const sel = ans[qid];
        const opt = (q.options || []).find(o => o.id === sel);
        const best = (q.options || []).reduce((a, b) => b.score > (a ? a.score : -1) ? b : a, null);
        if (opt) {
            answered++;
            if (opt.score > 0) goodCount++;
            for (const k in per) {
                per[k] += (opt.dims?.[k] || 0);
            }
            const dimsSum = Object.values(opt.dims || {}).reduce((a, b) => a + b, 0);
            if (opt.score === 0 && dimsSum === 0) {
                severeFlags.push({qid, title: q.title, choice: sel, label: opt.label});
            } else if (opt.score === 0) {
                weakFlags.push({qid, title: q.title, choice: sel, label: opt.label});
            }
            volatilityRisk += (opt.score === 0) ? 1 : 0;
            if (RULES && RULES.triggers) {
                const blob = (q.title + ' ' + q.scenario + ' ' + opt.label).toLowerCase();
                RULES.triggers.forEach(tg => {
                    if (blob.includes((tg.key || '').toLowerCase())) {
                        const aff = tg.affect || {};
                        if ('publicityRisk' in aff) publicityRisk += aff.publicityRisk;
                        if ('integrityRisk' in aff) integrityRisk += aff.integrityRisk;
                        if ('volatilityRisk' in aff) volatilityRisk += aff.volatilityRisk;
                        if ('egoismRisk' in aff) egoismRisk += aff.egoismRisk;
                        triggerHits.push({key: tg.key, affectVal: JSON.stringify(aff)});
                    }
                });
            }
        }
        if (best) {
            for (const k in mx) {
                mx[k] += (best.dims?.[k] || 0);
            }
        }
    }
    const ratio = {};
    DIM.forEach(k => ratio[k] = Math.round((per[k] / Math.max(1, mx[k])) * 100));
    const completion = Math.round(answered / Math.max(1, Object.keys(qmap).length) * 100);
    const goodRate = Math.round((goodCount / Math.max(1, answered)) * 100);
    publicityRisk = clamp(publicityRisk + (ratio.BND < 60 ? 10 : 0), 0, 100);
    integrityRisk = clamp(integrityRisk + (100 - ratio.INT) * 0.6, 0, 100);
    volatilityRisk = clamp(volatilityRisk * 6 + (100 - goodRate) * 0.3, 0, 100);
    egoismRisk = clamp(egoismRisk + (100 - ratio.EMP) * 0.4 + (100 - ratio.COM) * 0.2 + (100 - ratio.INT) * 0.4, 0, 100);
    const fitW = (RULES && RULES.fit_weights) || {BND: 0.22, COM: 0.22, INT: 0.28, EMP: 0.18, CRV: 0.10};
    const romaFit = clamp(ratio.BND * fitW.BND + ratio.COM * fitW.COM + ratio.INT * fitW.INT + ratio.EMP * fitW.EMP + ratio.CRV * fitW.CRV, 0, 100);
    const pace = rep.pace || {durations: {}, order: [], timestamps: []};
    const ds = Object.values(pace.durations || {}).filter(Boolean);
    let paceTrust = 70, consistency = 70;
    if (ds.length) {
        const avg = ds.reduce((a, b) => a + b, 0) / ds.length;
        const fast = ds.filter(x => x < 900).length / ds.length;
        const slow = ds.filter(x => x > 12000).length / ds.length;
        const varcoef = (function () {
            const m = avg;
            const v = ds.reduce((a, b) => a + (b - m) * (b - m), 0) / ds.length;
            return Math.sqrt(v) / (m || 1);
        })();
        paceTrust = clamp(100 - (fast * 40) - (varcoef * 30) + (slow * 10), 0, 100);
        consistency = clamp(100 - (varcoef * 60), 0, 100);
    }
    return {
        ratio,
        completion,
        goodRate,
        severeFlags,
        weakFlags,
        publicityRisk,
        integrityRisk,
        volatilityRisk,
        egoismRisk,
        romaFit,
        answered,
        triggerHits,
        paceTrust,
        consistency
    };
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, Math.round(v)));
}

function renderBars(r) {
    const box = $('#bars');
    if (!box) return;
    box.innerHTML = '';
    for (const k of DIM) {
        box.appendChild(barRow(`<b>${DIM_NAME[k]}</b>`, r.ratio[k]));
    }
}

function renderKPI(r) {
    const thr = (RULES && RULES.thresholds) || {fit_warn: 55, fit_good: 75, risk_warn: 40, risk_bad: 70};
    const k = $('#kpi');
    if (!k) return;
    k.innerHTML = '';
    const items = [['ROMA Fit', r.romaFit, fitClass(r.romaFit, thr)], ['Publicity Risk', r.publicityRisk, riskClass(r.publicityRisk, thr)], ['Integrity Risk', r.integrityRisk, riskClass(r.integrityRisk, thr)], ['Volatility', r.volatilityRisk, riskClass(r.volatilityRisk, thr)], ['Egoism Risk', r.egoismRisk, riskClass(r.egoismRisk, thr)], ['Pace Trust', r.paceTrust, fitClass(r.paceTrust, thr)], ['Consistency', r.consistency, fitClass(r.consistency, thr)],];
    items.forEach(([name, val, klass]) => {
        const card = document.createElement('div');
        card.className = 'card pad';
        card.innerHTML = `<div class="muted">${name}</div><div><b class="${klass}">${val}</b><sub class="muted">/100</sub></div>`;
        k.appendChild(card);
    });
}

function riskClass(v, thr) {
    return v >= thr.risk_bad ? 'bad' : (v >= thr.risk_warn ? 'warn' : 'good');
}

function fitClass(v, thr) {
    return v >= thr.fit_good ? 'good' : (v >= thr.fit_warn ? 'warn' : 'bad');
}

function renderDiag(r) {
    const ul = $('#diag');
    if (!ul) return;
    ul.innerHTML = '';
    const add = (txt) => {
        const li = document.createElement('li');
        li.innerHTML = txt;
        ul.appendChild(li);
    };
    add(`综合契合度（ROMA Fit）：<b class="${fitClass(r.romaFit, (RULES && RULES.thresholds) || {
        fit_warn: 55,
        fit_good: 75
    })}">${r.romaFit}/100</b>。`);
    add(`公开表达/社媒风险（Publicity Risk）：<b class="${riskClass(r.publicityRisk, (RULES && RULES.thresholds) || {
        risk_warn: 40,
        risk_bad: 70
    })}">${r.publicityRisk}/100</b>`);
    add(`诚信与流程风险（Integrity Risk）：<b class="${riskClass(r.integrityRisk, (RULES && RULES.thresholds) || {
        risk_warn: 40,
        risk_bad: 70
    })}">${r.integrityRisk}/100</b>`);
    add(`冲突波动（Volatility）：<b class="${riskClass(r.volatilityRisk, (RULES && RULES.thresholds) || {
        risk_warn: 40,
        risk_bad: 70
    })}">${r.volatilityRisk}/100</b>`);
    add(`精致利己取向（Egoism Risk）：<b class="${riskClass(r.egoismRisk, (RULES && RULES.thresholds) || {
        risk_warn: 40,
        risk_bad: 70
    })}">${r.egoismRisk}/100</b>`);
    add(`作答节奏（Pace）：Pace Trust = <b class="${fitClass(r.paceTrust, (RULES && RULES.thresholds) || {
        fit_warn: 55,
        fit_good: 75
    })}">${r.paceTrust}/100</b> · Consistency = <b class="${fitClass(r.consistency, (RULES && RULES.thresholds) || {
        fit_warn: 55,
        fit_good: 75
    })}">${r.consistency}/100</b>。提示：大量 <900ms 的连续作答或极端波动可能意味着“走形式”或“漫无目的的来回点选”。`);
    if (r.severeFlags.length) {
        const li = document.createElement('li');
        li.innerHTML = '高风险选择（样例，供复核）：';
        const ol = document.createElement('ol');
        r.severeFlags.slice(0, 6).forEach(it => {
            const x = document.createElement('li');
            x.textContent = `${it.qid} · ${it.title} · 选项 ${it.choice}：${it.label}`;
            ol.appendChild(x);
        });
        li.appendChild(ol);
        ul.appendChild(li);
    }
    if (r.weakFlags.length) {
        const li = document.createElement('li');
        li.innerHTML = '中风险选择（样例，供复核）：';
        const ol = document.createElement('ol');
        r.weakFlags.slice(0, 6).forEach(it => {
            const x = document.createElement('li');
            x.textContent = `${it.qid} · ${it.title} · 选项 ${it.choice}：${it.label}`;
            ol.appendChild(x);
        });
        li.appendChild(ol);
        ul.appendChild(li);
    }
}

function renderDecision(r) {
    const thr = (RULES && RULES.thresholds) || {fit_warn: 55, fit_good: 75, risk_warn: 40, risk_bad: 70};
    const d = $('#decision');
    if (!d) return;
    const suggest = [];
    suggest.push(`ROMA Fit: ${r.romaFit}/100`);
    suggest.push(`Integrity Risk: ${r.integrityRisk}/100 | Publicity Risk: ${r.publicityRisk}/100 | Egoism Risk: ${r.egoismRisk}/100`);
    suggest.push(`Severe flags: ${r.severeFlags.length} · Weak flags: ${r.weakFlags.length}`);
    suggest.push(`建议：当 Fit < ${thr.fit_warn} 或 Integrity Risk ≥ ${thr.risk_warn} 时，进入重点复核名单；Publicity ≥ ${thr.risk_warn} 时，面试重点讨论对外表达边界。`);
    d.textContent = suggest.join('\\n');
}
