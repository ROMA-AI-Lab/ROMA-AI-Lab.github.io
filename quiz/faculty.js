// ROMA Lab · CIT Faculty Analyzer v2.2 — lang-safe bank, prompts, theme
const DIM = ['BND','COM','EMP','INT','CRV'];
const DIM_NAME = {BND:'Boundary', COM:'Communication', EMP:'Empathy', INT:'Integrity', CRV:'Creativity&Resilience'};
let RULES = null;
let BANK = [];
const $ = (s, r=document)=> r.querySelector(s);

// ---------- Theme (immediate apply) ----------
(function(){
  const b = document.getElementById('themeBtn');
  const body = document.body;
  function applyTheme(mode){
    if(mode==='light'){ body.classList.add('light'); }
    else { body.classList.remove('light'); }
  }
  let mode = localStorage.getItem('theme') || 'auto';
  applyTheme(mode);
  if(b){
    b.onclick = ()=>{
      mode = (mode==='light')?'auto':'light';
      localStorage.setItem('theme', mode);
      applyTheme(mode);
    };
  }
})();

// ---------- Load rules ----------
async function loadConfig(){
  try{ const res = await fetch('rules.weights.json'); if(res.ok) RULES = await res.json(); }
  catch(e){ console.warn('rules.weights.json missing'); }
}

// ---------- Load bank by student lang/mode ----------
async function loadBankFor(rep){
  const lang = (rep.lang==='en')?'en':'zh';
  const mode = (rep.mode==='core')?'core':'full';
  const list = [];
  if(lang==='zh'){
    list.push('core.zh.json');
    if(mode!=='core') list.push('extended.zh.json');
  }else{
    list.push('core.en.json');
    if(mode!=='core') list.push('extended.en.json');
  }
  BANK = [];
  for(const f of list){
    try{ const res = await fetch(f); if(res.ok){ const arr = await res.json(); BANK = BANK.concat(arr); } }
    catch(e){ console.warn('missing bank', f); }
  }
  const badge = document.getElementById('langBadge');
  if(badge) badge.textContent = `Bank: ${lang.toUpperCase()} · ${mode}`;
}
function buildQMap(){
  const map = {}; BANK.forEach(q=>{ map[q.id]=q; }); return map;
}

// ---------- UI helpers ----------
function barRow(label, ratio){
  const wrap=document.createElement('div');
  wrap.style.display='grid'; wrap.style.gridTemplateColumns='160px 1fr 40px';
  wrap.style.alignItems='center'; wrap.style.gap='8px';
  const l=document.createElement('div'); l.innerHTML=label;
  const b=document.createElement('div'); b.className='bar';
  const fill=document.createElement('div'); fill.style.width=(isNaN(ratio)?0:ratio)+'%'; b.appendChild(fill);
  const r=document.createElement('div'); r.className='subtle'; r.style.textAlign='right'; r.textContent=(isNaN(ratio)?0:ratio)+'%';
  wrap.appendChild(l); wrap.appendChild(b); wrap.appendChild(r); return wrap;
}
function clamp(v,min,max){ return Math.max(min, Math.min(max, Math.round(v))); }
function riskClass(v, thr){ return v>=thr.risk_bad?'bad':(v>=thr.risk_warn?'warn':'good'); }
function fitClass(v, thr){ return v>=thr.fit_good?'good':(v>=thr.fit_warn?'warn':'bad'); }

// ---------- Analysis ----------
function analyze(rep){
  const qmap = buildQMap();
  const ans = rep.answers||{};
  const per={BND:0,COM:0,EMP:0,INT:0,CRV:0}, mx={BND:0,COM:0,EMP:0,INT:0,CRV:0};
  const severeFlags=[], weakFlags=[], triggerHits=[];
  let answered=0, goodCount=0;
  let publicityRisk=0, integrityRisk=0, volatilityRisk=0, egoismRisk=0;

  Object.keys(ans).forEach(qid=>{
    const q=qmap[qid]; if(!q) return;
    const sel=ans[qid];
    const opt=(q.options||[]).find(o=>o.id===sel);
    const best=(q.options||[]).reduce((a,b)=> b.score>(a?a.score:-1)?b:a, null);
    if(opt){
      answered++; if(opt.score>0) goodCount++;
      for(const k in per){ per[k]+= (opt.dims?.[k]||0); }
      const dimsSum = Object.values(opt.dims||{}).reduce((a,b)=>a+b,0);
      if(opt.score===0 && dimsSum===0){ severeFlags.push({qid, title:q.title, choice:sel, label:opt.label}); }
      else if(opt.score===0){ weakFlags.push({qid, title:q.title, choice:sel, label:opt.label}); }
      if(RULES && RULES.triggers){
        const blob=(q.title+' '+q.scenario+' '+opt.label).toLowerCase();
        RULES.triggers.forEach(tg=>{
          if(blob.includes((tg.key||'').toLowerCase())){
            const aff=tg.affect||{};
            if('publicityRisk' in aff) publicityRisk += aff.publicityRisk;
            if('integrityRisk' in aff) integrityRisk += aff.integrityRisk;
            if('volatilityRisk' in aff) volatilityRisk += aff.volatilityRisk;
            if('egoismRisk' in aff) egoismRisk += aff.egoismRisk;
            triggerHits.push({key:tg.key, affectVal:JSON.stringify(aff)});
          }
        });
      }
    }
    if(best){ for(const k in mx){ mx[k]+= (best.dims?.[k]||0); } }
  });

  const ratio={}; DIM.forEach(k=> ratio[k]= Math.round((per[k]/Math.max(1,mx[k]))*100));
  const completion = Math.round( (answered/Math.max(1,Object.keys(buildQMap()).length))*100 );
  const goodRate = Math.round((goodCount/Math.max(1,answered))*100);

  // pace
  const pace = rep.pace||{durations:{}, order:[], timestamps:[]};
  const ds = Object.values(pace.durations||{}).filter(Boolean);
  let paceTrust=70, consistency=70, avgMs=null, medianMs=null, fastRate=0, slowRate=0, varcoef=0;
  if(ds.length){
    const avg = ds.reduce((a,b)=>a+b,0)/ds.length;
    const sorted = ds.slice().sort((a,b)=>a-b);
    avgMs = Math.round(avg);
    medianMs = Math.round(sorted[Math.floor(sorted.length/2)]);
    fastRate = ds.filter(x=>x<900).length/ds.length;
    slowRate = ds.filter(x=>x>12000).length/ds.length;
    varcoef = (function(){ const m=avg; const v=ds.reduce((a,b)=>a+(b-m)*(b-m),0)/ds.length; return Math.sqrt(v)/(m||1); })();
    paceTrust = clamp(100 - fastRate*40 - varcoef*30 + slowRate*10, 0, 100);
    consistency = clamp(100 - varcoef*60, 0, 100);
  }

  publicityRisk = clamp(publicityRisk + (ratio.BND<60?10:0), 0, 100);
  integrityRisk = clamp(integrityRisk + (100-ratio.INT)*0.6, 0, 100);
  volatilityRisk = clamp(volatilityRisk*6 + (100-goodRate)*0.3, 0, 100);
  egoismRisk = clamp(egoismRisk + (100-ratio.EMP) *0.4 + (100-ratio.COM)*0.2 + (100-ratio.INT)*0.4, 0, 100);

  const fitW = (RULES && RULES.fit_weights) || {BND:0.22,COM:0.22,INT:0.28,EMP:0.18,CRV:0.10};
  const romaFit = clamp( ratio.BND*fitW.BND + ratio.COM*fitW.COM + ratio.INT*fitW.INT + ratio.EMP*fitW.EMP + ratio.CRV*fitW.CRV, 0, 100 );

  return {ratio, completion, goodRate, severeFlags, weakFlags, triggerHits,
          publicityRisk, integrityRisk, volatilityRisk, egoismRisk, romaFit,
          paceTrust, consistency, avgMs, medianMs, fastRate, slowRate, varcoef};
}

// ---------- Renders ----------
function renderBars(r){
  const box = $('#bars'); if(!box) return; box.innerHTML='';
  for(const k of DIM){ box.appendChild(barRow(`<b>${DIM_NAME[k]}</b>`, r.ratio[k])); }
}
function renderKPI(r){
  const thr=(RULES && RULES.thresholds)||{fit_warn:55,fit_good:75,risk_warn:40,risk_bad:70};
  const k=$('#kpi'); if(!k) return; k.innerHTML='';
  const items=[
    ['ROMA Fit', r.romaFit, fitClass(r.romaFit,thr)],
    ['Publicity Risk', r.publicityRisk, riskClass(r.publicityRisk,thr)],
    ['Integrity Risk', r.integrityRisk, riskClass(r.integrityRisk,thr)],
    ['Volatility', r.volatilityRisk, riskClass(r.volatilityRisk,thr)],
    ['Egoism Risk', r.egoismRisk, riskClass(r.egoismRisk,thr)],
    ['Pace Trust', r.paceTrust, fitClass(r.paceTrust,thr)],
    ['Consistency', r.consistency, fitClass(r.consistency,thr)]
  ];
  items.forEach(([name,val,klass])=>{
    const card=document.createElement('div'); card.className='card pad';
    card.innerHTML=`<div class="subtle">${name}</div><div><b class="${klass}">${val}</b><sub class="subtle">%</sub></div>`;
    k.appendChild(card);
  });
}
function renderDiag(r){
  const ul=$('#diag'); if(!ul) return; ul.innerHTML='';
  const thr=(RULES && RULES.thresholds)||{fit_warn:55,fit_good:75,risk_warn:40,risk_bad:70};
  const add=txt=>{ const li=document.createElement('li'); li.innerHTML=txt; ul.appendChild(li); };
  add(`综合契合度（ROMA Fit）：<b class="${fitClass(r.romaFit,thr)}">${r.romaFit}%</b>`);
  add(`公开表达风险：<b class="${riskClass(r.publicityRisk,thr)}">${r.publicityRisk}%</b>；诚信风险：<b class="${riskClass(r.integrityRisk,thr)}">${r.integrityRisk}%</b>`);
  add(`波动（Volatility）：<b class="${riskClass(r.volatilityRisk,thr)}">${r.volatilityRisk}%</b>；精致利己：<b class="${riskClass(r.egoismRisk,thr)}">${r.egoismRisk}%</b>`);
  add(`作答节奏：Pace Trust <b class="${fitClass(r.paceTrust,thr)}">${r.paceTrust}%</b> · Consistency <b class="${fitClass(r.consistency,thr)}">${r.consistency}%</b>`);
}
function renderDecision(r){
  const thr=(RULES && RULES.thresholds)||{fit_warn:55,fit_good:75,risk_warn:40,risk_bad:70};
  const d=$('#decision'); if(!d) return;
  const lines=[];
  lines.push(`ROMA Fit: ${r.romaFit}%`);
  lines.push(`Risks: Integrity ${r.integrityRisk}% · Publicity ${r.publicityRisk}% · Egoism ${r.egoismRisk}% · Volatility ${r.volatilityRisk}%`);
  lines.push(`建议：当 Fit < ${thr.fit_warn} 或 Integrity ≥ ${thr.risk_warn} 时列入复核；Publicity ≥ ${thr.risk_warn} 时面试聚焦对外表达边界。`);
  d.textContent = lines.join('\n');
}

// ---- Summary synthesis ----
function renderSummary(r, rep){
  const box = document.getElementById('summary');
  if(!box) return;
  const topSorted = Object.entries(r.ratio).sort((a,b)=>b[1]-a[1]);
  const top2 = topSorted.slice(0,2).map(([k,v])=>`${DIM_NAME[k]} ${v}%`).join(' · ');
  const low2 = topSorted.slice(-2).map(([k,v])=>`${DIM_NAME[k]} ${v}%`).join(' / ');
  const paceTxt = (r.avgMs && r.medianMs)
      ? `作答中位≈${r.medianMs}ms，平均≈${r.avgMs}ms；超快(<900ms) ${(r.fastRate*100|0)}%，超慢(>12s) ${(r.slowRate*100|0)}%。`
      : '作答节奏数据有限。';
  box.innerHTML = [
    `ROMA Fit ${r.romaFit}%；完成度 ${rep.answered||0}/${rep.total||0}。${paceTxt}`,
    `画像亮点：${top2}；相对弱项：${low2}。`,
    `初步印象：整体风格较为${r.ratio.INT>=r.ratio.CRV?'稳健理性':'探索开放'}，在人际与流程上${r.ratio.COM>=60 && r.ratio.EMP>=60?'更注重协作体验':'更强调目标推进'}；建议结合项目复盘与冲突化解案例核验。`
  ].join('\n');
}

// ---- Evidence samples (respect language) ----
// function renderEvidence(rep){
//   const list = document.getElementById('evidenceList');
//   if(!list) return;
//   list.innerHTML='';
//   const qmap = buildQMap();
//   // choose first 6 answered qids in report order
//   const pairs = Object.entries(rep.answers||{}).slice(0,6);
//   // const pairs = Object.entries(rep.answers||{}); // 显示全部
//
//     pairs.forEach(([qid,oid])=>{
//     const q=qmap[qid]; if(!q) return;
//     const o=(q.options||[]).find(x=>x.id===oid);
//     const li=document.createElement('li');
//     li.innerHTML = `<b>${qid}</b> · ${q.title}<div class="subtle" style="margin:4px 0">${q.scenario||''}</div><div class="pill">选择：${oid}</div><div style="margin-top:4px">${o?o.label:'(missing option)'}</div>`;
//     list.appendChild(li);
//   });
// }
//

// ---- Evidence samples (representative by pace, with expand/collapse) ----
// function renderEvidence(rep){
//     const list = document.getElementById('evidenceList');
//     if(!list) return;
//
//     // 初始化
//     list.innerHTML = '';
//     const qmap = buildQMap();
//     const durations = rep?.pace?.durations || {}; // { qid: ms }
//     const entries = Object.entries(rep.answers || {}); // [ [qid, optionId], ... ]
//
//     // 1) 依据耗时构建排序视图
//     const byDurDesc = entries.slice().sort((a,b)=>(durations[b[0]]||0) - (durations[a[0]]||0)); // 慢 -> 快
//     const byDurAsc  = entries.slice().sort((a,b)=>(durations[a[0]]||0) - (durations[b[0]]||0)); // 快 -> 慢
//
//     // 2) 代表性样例：slowTop3 + fastTop3（去重，保持顺序）
//     const pickN = 3;
//     const slowTop = byDurDesc.slice(0, pickN);
//     const fastTop = byDurAsc.slice(0, pickN);
//
//     const seen = new Set();
//     const representative = [];
//     for (const p of [...slowTop, ...fastTop]) {
//         if (!seen.has(p[0])) { representative.push(p); seen.add(p[0]); }
//     }
//
//     // 若不足 6 条，用“未入选”的其它题（按耗时从慢到快）补齐
//     const PAGE_SIZE = 6;
//     if (representative.length < PAGE_SIZE) {
//         for (const p of byDurDesc) {
//             if (representative.length >= PAGE_SIZE) break;
//             if (!seen.has(p[0])) { representative.push(p); seen.add(p[0]); }
//         }
//     }
//
//     // 3) 全量视图：代表性样例在前，其余题按耗时从慢到快排在后面
//     const rest = byDurDesc.filter(p => !seen.has(p[0]));
//     const allItems = [...representative, ...rest];
//
//     // 4) 渲染函数（根据 showAll 切换“仅代表性6条”/“全部”）
//     const moreBtn = ensureEvidenceMoreButton(); // 确保按钮存在
//     let showAll = false;
//
//     function draw(){
//         list.innerHTML = '';
//         const toShow = showAll ? allItems : representative;
//
//         toShow.forEach(([qid, oid])=>{
//             const q = qmap[qid]; if(!q) return;
//             const o = (q.options || []).find(x => x.id === oid);
//             const ms = durations[qid] || 0;
//
//             const li = document.createElement('li');
//             li.innerHTML = `
//         <b>${qid}</b> · ${q.title}
//         <div class="subtle" style="margin:4px 0">${q.scenario || ''}</div>
//         <div class="pill">选择：${oid} · <span class="subtle">耗时≈${ms}ms</span></div>
//         <div style="margin-top:4px">${o ? o.label : '(missing option)'}</div>
//       `;
//             list.appendChild(li);
//         });
//
//         // 更新按钮文案与显隐
//         if (!moreBtn) return;
//         if (allItems.length <= representative.length) {
//             moreBtn.style.display = 'none';
//         } else {
//             moreBtn.style.display = '';
//             moreBtn.textContent = showAll ? '收起' : '展开更多';
//         }
//     }
//
//     // 5) 绑定事件并首渲染
//     if (moreBtn) {
//         moreBtn.onclick = ()=> { showAll = !showAll; draw(); };
//     }
//     draw();
// }


// 新增：专用于“传入字符串内容”的下载函数，避免与 window.downloadText 冲突
function downloadString(text, filename, mime){
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}


// ---- Evidence samples (representative by pace) with pagination & export ----
function renderEvidence(rep){
    const list = document.getElementById('evidenceList');
    if(!list) return;

    // 清空并准备数据
    list.innerHTML = '';
    const qmap = buildQMap();
    const durations = rep?.pace?.durations || {}; // { qid: ms }
    const entries = Object.entries(rep.answers || {}); // [ [qid, optionId], ... ]

    // 1) 依据耗时构建排序视图
    const byDurDesc = entries.slice().sort((a,b)=>(durations[b[0]]||0)-(durations[a[0]]||0)); // 慢->快
    const byDurAsc  = entries.slice().sort((a,b)=>(durations[a[0]]||0)-(durations[b[0]]||0)); // 快->慢

    // 2) 代表性样例：慢 Top3 + 快 Top3（去重，保持顺序）
    const pickN = 3;
    const slowTop = byDurDesc.slice(0, pickN);
    const fastTop = byDurAsc.slice(0, pickN);

    const seen = new Set();
    const representative = [];
    for (const p of [...slowTop, ...fastTop]) {
        if (!seen.has(p[0])) { representative.push(p); seen.add(p[0]); }
    }

    // 若不足 6 条，用“未入选”的其它题（按耗时从慢到快）补齐
    const PAGE_SIZE = 6;
    if (representative.length < PAGE_SIZE) {
        for (const p of byDurDesc) {
            if (representative.length >= PAGE_SIZE) break;
            if (!seen.has(p[0])) { representative.push(p); seen.add(p[0]); }
        }
    }

    // 3) 全量列表：代表性样例在前，其余题按耗时从慢到快排在后
    const rest = byDurDesc.filter(p => !seen.has(p[0]));
    const allItems = [...representative, ...rest];

    // 4) 分页状态
    let currentPage = 1;
    const pageSize = PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));

    // 5) 控件（上一页/下一页/页码 + 导出）
    const controls = ensureEvidenceControls(); // {prevBtn,nextBtn,pageLab,expMdBtn,expCsvBtn}
    function updateControls(){
        if(!controls) return;
        controls.pageLab.textContent = `${currentPage} / ${totalPages}`;
        controls.prevBtn.disabled = (currentPage <= 1);
        controls.nextBtn.disabled = (currentPage >= totalPages);
        // 如果不足一页，隐藏分页控件但保留导出
        controls.wrap.classList.toggle('is-single', totalPages <= 1);
    }

    // 6) 渲染当前页
    function getSliceForPage(p){
        const start = (p - 1) * pageSize;
        const end   = start + pageSize;
        return allItems.slice(start, end);
    }

    function draw(){
        list.innerHTML = '';
        const pageItems = getSliceForPage(currentPage);

        pageItems.forEach(([qid, oid], idx) => {
            const q = qmap[qid]; if(!q) return;
            const o = (q.options || []).find(x => x.id === oid);
            const ms = durations[qid] || 0;

            const li = document.createElement('li');
            li.innerHTML = `
        <b>${qid}</b> · ${q.title}
        <div class="subtle" style="margin:4px 0">${q.scenario || ''}</div>
        <div class="pill">选择：${oid} · <span class="subtle">耗时≈${ms}ms</span></div>
        <div style="margin-top:4px">${o ? o.label : '(missing option)'}</div>
      `;
            list.appendChild(li);
        });

        updateControls();
    }

    // 7) 导出（仅导出“当前页”）
    function exportMarkdown(){
        // const items = getSliceForPage(currentPage); // <-- 修正：传 currentPage
        const items = byDurDesc;
        const rows = items.map(([qid, oid]) => {
            const q = qmap[qid] || {};
            const o = (q.options || []).find(x => x.id === oid);
            const ms = durations[qid] || 0;
            return `| ${qid} | ${escapeMd(q.title||'')} | ${oid} | ${escapeMd(o?o.label:'')} | ${ms} | ${escapeMd(q.scenario||'')} |`;
        });
        const header = '| QID | Title | OptionID | OptionLabel | Duration(ms) | Scenario |\n|---|---|---|---|---:|---|';
        const md = [header, ...rows].join('\n');
        // downloadString(md, `evidence_page_${currentPage}.md`, 'text/markdown;charset=utf-8'); // <-- 改用 downloadString
        downloadString(md, `evidence_page_all.md`, 'text/markdown;charset=utf-8'); // <-- 改用 downloadString
    }


    function exportCSV(){
        // const items = getSliceForPage(currentPage); // <-- 修正：传 currentPage
        const items = byDurDesc;
        const header = ['QID','Title','OptionID','OptionLabel','Duration(ms)','Scenario'];
        const lines = [header].concat(items.map(([qid, oid])=>{
            const q = qmap[qid] || {};
            const o = (q.options || []).find(x => x.id === oid);
            const ms = durations[qid] || 0;
            return [qid, q.title||'', oid, o?o.label:'', ms, q.scenario||''].map(csvEscape).join(',');
        }));
        const csv = lines.join('\n');
        downloadString(csv, `evidence_page_all.csv`, 'text/csv;charset=utf-8'); // <-- 改用 downloadString
        // downloadString(csv, `evidence_page_${currentPage}.csv`, 'text/csv;charset=utf-8'); // <-- 改用 downloadString
    }


    // 8) 事件绑定
    if (controls) {
        controls.prevBtn.onclick = ()=>{ if(currentPage>1){ currentPage--; draw(); } };
        controls.nextBtn.onclick = ()=>{ if(currentPage<totalPages){ currentPage++; draw(); } };
        controls.expMdBtn.onclick = exportMarkdown;
        controls.expCsvBtn.onclick = exportCSV;
    }

    // 9) 首渲染
    draw();
}

/** 创建/复用 证据区控件（分页 + 导出） */
function ensureEvidenceControls(){
    const container = document.querySelector('#evidenceList')?.parentElement;
    if(!container) return null;

    let wrap = container.querySelector('.evidence-controls');
    if(!wrap){
        wrap = document.createElement('div');
        wrap.className = 'evidence-controls';

        const left = document.createElement('div');
        left.className = 'controls-left';
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn small ghost';
        prevBtn.id = 'evidencePrev';
        prevBtn.textContent = '上一页';
        const pageLab = document.createElement('span');
        pageLab.id = 'evidencePage';
        pageLab.className = 'page-indicator';
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn small ghost';
        nextBtn.id = 'evidenceNext';
        nextBtn.textContent = '下一页';
        left.append(prevBtn, pageLab, nextBtn);

        const right = document.createElement('div');
        right.className = 'controls-right';
        const expMdBtn = document.createElement('button');
        expMdBtn.className = 'btn small';
        expMdBtn.id = 'evidenceExportMd';
        expMdBtn.textContent = '导出 MD';
        const expCsvBtn = document.createElement('button');
        expCsvBtn.className = 'btn small';
        expCsvBtn.id = 'evidenceExportCsv';
        expCsvBtn.textContent = '导出 CSV';
        right.append(expMdBtn, expCsvBtn);

        wrap.append(left, right);
        container.appendChild(wrap);

        return {wrap, prevBtn, pageLab, nextBtn, expMdBtn, expCsvBtn};
    }else{
        const prevBtn = wrap.querySelector('#evidencePrev') || Object.assign(document.createElement('button'), {id:'evidencePrev', className:'btn small ghost', textContent:'上一页'});
        const nextBtn = wrap.querySelector('#evidenceNext') || Object.assign(document.createElement('button'), {id:'evidenceNext', className:'btn small ghost', textContent:'下一页'});
        const pageLab = wrap.querySelector('#evidencePage') || Object.assign(document.createElement('span'), {id:'evidencePage', className:'page-indicator'});
        const expMdBtn = wrap.querySelector('#evidenceExportMd') || Object.assign(document.createElement('button'), {id:'evidenceExportMd', className:'btn small', textContent:'导出 MD'});
        const expCsvBtn = wrap.querySelector('#evidenceExportCsv') || Object.assign(document.createElement('button'), {id:'evidenceExportCsv', className:'btn small', textContent:'导出 CSV'});
        return {wrap, prevBtn, pageLab, nextBtn, expMdBtn, expCsvBtn};
    }
}

/** 简单的 Markdown 转义 */
function escapeMd(s){
    return String(s).replaceAll('|','\\|').replaceAll('\n',' ');
}

/** CSV 字段转义 */
function csvEscape(s){
    const v = String(s).replaceAll('"','""');
    return /[",\n]/.test(v) ? `"${v}"` : v;
}

/** 触发本地下载 */
function downloadText(text, filename, mime){
    const blob = new Blob([text], {type: mime || 'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}



// 确保“展开更多”按钮存在（放在 evidenceList 下方），返回按钮引用
function ensureEvidenceMoreButton(){
    const body = document.querySelector('#evidenceList')?.parentElement;
    if (!body) return null;

    // 若已有按钮容器则复用
    let actions = body.querySelector('.evidence-actions');
    if (!actions) {
        actions = document.createElement('div');
        actions.className = 'evidence-actions';
        const btn = document.createElement('button');
        btn.id = 'evidenceMore';
        btn.className = 'btn small ghost';
        btn.textContent = '展开更多';
        actions.appendChild(btn);
        body.appendChild(actions);
        return btn;
    } else {
        let btn = actions.querySelector('#evidenceMore');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'evidenceMore';
            btn.className = 'btn small ghost';
            btn.textContent = '展开更多';
            actions.appendChild(btn);
        }
        return btn;
    }
}


// ---- Nav heat + timeline + tooltip ----
const NAV_DATA = {heat:null,timeline:null};
function setupHiDPI(canvas, desiredW, desiredH){
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(desiredW * dpr);
  canvas.height = Math.round(desiredH * dpr);
  canvas.style.width = desiredW+'px';
  canvas.style.height = desiredH+'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return ctx;
}
function attachTooltip(canvas, boxes, toText){
  const tip = document.getElementById('tip'); if(!tip) return;
  function hit(x,y){ for(const b of boxes){ if(x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h) return b; } return null; }
  canvas.onmousemove = (e)=>{
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const box = hit(x,y);
    if(box){ tip.textContent=''; tip.innerText = toText(box); tip.style.left = e.clientX+'px'; tip.style.top = e.clientY+'px'; tip.classList.add('show'); }
    else { tip.classList.remove('show'); }
  };
  canvas.onmouseleave = ()=> tip.classList.remove('show');
}
function renderNav(rep){
  const heat = document.getElementById('navHeat');
  if(heat && heat.getContext){
    // const durs = rep.pace?.durations||{};
    // const ids = Object.keys(durs);


    const durs = rep.pace?.durations || {};
    const seq = Array.from(new Set((rep.picked || []).map(p => p.qid))); // 以作答顺序去重
    const ids = seq.filter(id => id in durs); // 只保留有时长的题目
    const vals = ids.map(id=>durs[id]||0);

    const max = Math.max(1, ...vals);
    const w = Math.max(300, ids.length*12 + 40), h=120;
    const ctx = setupHiDPI(heat, w, h);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='rgba(226,232,240,0.08)'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(148,163,184,0.35)'; ctx.beginPath(); ctx.moveTo(20,h-20); ctx.lineTo(w-10,h-20); ctx.stroke();
    const rects=[];
    ids.forEach((id,idx)=>{
      const v = durs[id]||0; const t = (v/max);
      const bh = Math.max(4, t*(h-40));
      const x = 24 + idx*12; const y = (h-20) - bh;
      const grad = ctx.createLinearGradient(0,y,0,y+bh); grad.addColorStop(0,'#93c5fd'); grad.addColorStop(1,'#60a5fa');
      ctx.fillStyle = grad; ctx.fillRect(x, y, 8, bh);
      rects.push({x,y,w:8,h:bh, id, ms:v});
    });
    NAV_DATA.heat = {rects};
    attachTooltip(heat, rects, (r)=>`题目 ${r.id}\n耗时 ${r.ms} ms`);
  }
  const tl = document.getElementById('navTimeline');
  if(tl && tl.getContext){
    const picks = rep.picked||[];
    const w = Math.max(300, picks.length*10 + 40), h=80;
    const ctx = setupHiDPI(tl, w, h);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='rgba(226,232,240,0.08)'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(148,163,184,0.35)'; ctx.beginPath(); ctx.moveTo(20,h/2); ctx.lineTo(w-10,h/2); ctx.stroke();
    const ticks=[];
    picks.forEach((p,i)=>{
      const x = 24 + i*10;
      ctx.strokeStyle='rgba(100,116,139,.7)'; ctx.beginPath(); ctx.moveTo(x, h/2 - 12); ctx.lineTo(x, h/2 + 12); ctx.stroke();
      ticks.push({x: x-4, y: h/2 - 12, w:8, h:24, idx:i, qid:p.qid, opt:p.optionId, ts:p.ts});
    });
    NAV_DATA.timeline = {ticks};
    attachTooltip(tl, ticks, (t)=>`事件 #${t.idx+1}\nQID ${t.qid}\n选项 ${t.opt}\n时间戳 ${t.ts}`);
  }
}

// ---- Prompt builders ----
function compressBankForPrompt(){
  // keep only id, title, scenario, options:{id,label,dims}
  return BANK.map(q=>({
    id:q.id, title:q.title, scenario:q.scenario||'',
    options:(q.options||[]).map(o=>({id:o.id, label:o.label, dims:o.dims||{}}))
  }));
}
function buildPrompts(rep, r){
  const userBox = $('#promptUser');
  const facText = $('#promptFacultyText');
  const facJSON = $('#promptFacultyJSON');
  if(!userBox || !facText || !facJSON) return;

  // student-facing (plain text)
  const dims = r.ratio;
  const top = Object.entries(dims).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${DIM_NAME[k]} ${v}%`).join(', ');
  const auto_summary = $('#summary')?.textContent || '';
  const studentPrompt = [
    '[SYSTEM] You are ROMA Lab CIT coach. Praise-first, supportive, conversational.',
    '[INSTRUCTION] Write the report in Chinese. Do not give rigid advice; celebrate strengths with concrete observations sounding human and lab-contextual.',
    `[SCORES] ROMA Fit ${r.romaFit}%; top signals: ${top}.`,
    '[OUTPUT] 6–9 short bullets of appreciation + a warm closing paragraph.',
    '[NOTE] Keep privacy and ethics reminders subtle.'
  ].join('\n');
  userBox.value = studentPrompt;

  // faculty-facing (text + JSON)
  const bank = compressBankForPrompt();
  const payload = {
    system: 'You are the evaluator for ROMA Lab admissions. Produce a deep, evidence-based analysis in Chinese.',
    inputs: {
      student_report: rep,
      auto_summary: auto_summary,
      scoring_model: {
        dims: ['BND','COM','EMP','INT','CRV'],
        weights: (RULES && RULES.fit_weights) || {BND:0.22,COM:0.22,INT:0.28,EMP:0.18,CRV:0.10}
      },
      question_bank_compact: bank
    },
    requirements: [
      'Write the final report entirely in Chinese (保持中文输出)。',
      'Include an evidence chain: for each key claim, cite question id, title/scenario (原始语言), chosen option text, and the behavior interpretation.',
      'Diagnose potential risks (publicity, integrity, volatility, egoism) and explain why with references to answers.',
      'Analyze behavior patterns to see whether this report is trustworthy (pace trust, timeduration, consistency, etc)',
      'Provide concrete interview probes tailored to this student.',
      'Incorporate answering behavior (pace, consistency, jump patterns if any).',
      'Do not expose internal weights; no moralizing tone; be specific and fair.'
    ],
    expected_sections: [
      '核心画像与维度概览',
      '关键证据链（逐条列出，含题号/题干/选项/解释）',
      '潜在风险与成因分析',
        '这份测试结果的可信度（根据Pace Trust、答题时间节奏、一致性、波动性等数据）',
      '面试核验建议（提问清单）',
      '综合结论与录取建议（如需分情境给出建议）'
    ]
  };
  facJSON.value = JSON.stringify(payload, null, 2);

  const facTextPrompt = [
    '[SYSTEM] You are the evaluator for ROMA Lab admissions. Generate a detailed Chinese report.',
    '[DATA] 以下为学生本地导出的 JSON 报告（原样）：',
    JSON.stringify(rep),
    '[AUTO_SUMMARY] 由系统生成的综合分析报告：',
    auto_summary || '(无)',
    '[BANK] 仅保留必要字段（id, title, scenario, options.label, options.dims）：',
    JSON.stringify(bank).slice(0, 100000), // safeguard very long
    '[REQUIREMENTS] 输出必须为中文，包含：核心画像、证据链（题号/题干/选项/行为解释）、潜在风险与成因分析、这份测试结果的可信度(（根据Pace Trust、答题时间节奏、一致性、波动性等数据）)、面试核验建议（提问清单）、综合结论与录取建议（如需分情境给出建议）。请结合作答节奏等行为数据给出洞察。'
  ].join('\n');
  facText.value = facTextPrompt;
}

// ---------- Flow ----------
async function handleFile(f){
  const txt = await f.text();
  let data; try{ data=JSON.parse(txt);}catch(e){ alert('不是有效的JSON'); return; }
  const metaEl = $('#meta'); if(metaEl) metaEl.textContent = `姓名: ${data.name||''} · 模式: ${data.mode} · 语言: ${data.lang} · 时间: ${data.timestamp}`;
  const rawEl = $('#raw'); if(rawEl) rawEl.textContent = JSON.stringify(data, null, 2);
  await loadConfig();
  await loadBankFor(data); // language/mode aware bank
  const result = analyze(data);
  renderBars(result); renderKPI(result); renderDiag(result); renderDecision(result);
  renderSummary(result, data); renderEvidence(data); renderNav(data);
  const trigBox = $('#trigs'); if(trigBox) trigBox.textContent = (result.triggerHits||[]).map(x=>`${x.key} ${x.affectVal}`).join('\n') || '(无)';
  buildPrompts(data, result);
}

async function ensureReady(){ if(!RULES) await loadConfig(); }
const drop = $('#drop'), file = $('#file');
if(drop){
  ['dragenter','dragover'].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev=> drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e=>{ const f=e.dataTransfer.files[0]; if(f) handleFile(f); });
}
if(file){ file.addEventListener('change', e=>{ const f=e.target.files[0]; if(f) handleFile(f); }); }

// download helper
window.downloadText = function(id, filename){
  const el = document.getElementById(id); if(!el) return;
  const blob = new Blob([el.value||el.textContent||''], {type:'text/plain'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
  URL.revokeObjectURL(a.href);
};

function copyWithToast(textareaId, btn){
    const val = (document.getElementById(textareaId)?.value) || '';
    navigator.clipboard.writeText(val).then(()=>{
        const old = btn.textContent;
        btn.textContent = '已复制 ✓';
        btn.disabled = true;
        setTimeout(()=>{ btn.textContent = old; btn.disabled = false; }, 300);
    });
}

(function(){
    const box = document.getElementById('facJSONBox');
    if(!box) return;
    const sum = box.querySelector('summary');
    box.addEventListener('toggle', ()=>{
        if(!sum) return;
        sum.textContent = box.open ? '收起 JSON' : '显示 JSON';
    });
})();


