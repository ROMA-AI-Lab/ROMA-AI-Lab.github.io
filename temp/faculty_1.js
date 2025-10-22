
// ROMA Lab Faculty Analyzer – v4.3
const DIM = ['BND','COM','EMP','INT','CRV'];
const DIM_NAME = {BND:'Boundary', COM:'Communication', EMP:'Empathy', INT:'Integrity', CRV:'Creativity&Resilience'};
let RULES = null;
let BANK = [];

(function(){ const b=document.getElementById('themeBtn'); const body=document.body; let mode=localStorage.getItem('theme')||'auto'; function apply(){ if(mode==='light') body.classList.add('light'); else body.classList.remove('light'); } if(b){ b.onclick=()=>{ mode=(mode==='light')?'auto':'light'; localStorage.setItem('theme',mode); apply(); }; } apply(); })();

const $=s=>document.querySelector(s);

function barRow(label, ratio){
  const wrap=document.createElement('div'); wrap.style.display='grid'; wrap.style.gridTemplateColumns='160px 1fr 40px'; wrap.style.alignItems='center'; wrap.style.gap='8px';
  const l=document.createElement('div'); l.innerHTML=label;
  const b=document.createElement('div'); b.className='bar';
  const fill=document.createElement('div'); fill.style.width=(isNaN(ratio)?0:ratio)+'%'; b.appendChild(fill);
  const r=document.createElement('div'); r.className='muted'; r.style.textAlign='right'; r.textContent=(isNaN(ratio)?0:ratio)+'%';
  wrap.appendChild(l); wrap.appendChild(b); wrap.appendChild(r); return wrap;
}

async function loadConfig(){ try{ const res=await fetch('rules.weights.json'); if(res.ok) RULES=await res.json(); }catch(e){ console.warn('No rules.weights.json'); } }
async function loadBank(){
  const files=['core.zh.json','extended.zh.json','core.en.json','extended.en.json'];
  BANK=[];
  for(const f of files){ try{ const res=await fetch(f); if(res.ok){ const arr=await res.json(); BANK=BANK.concat(arr); } }catch(e){} }
}
Promise.all([loadConfig(), loadBank()]);

// D&D
const drop=$('#drop'), file=$('#file');
if(drop){
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault(); drop.classList.add('drag');}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault(); drop.classList.remove('drag');}));
  drop.addEventListener('drop', e=>{ const f=e.dataTransfer.files[0]; if(f) handleFile(f); });
}
if(file){
  file.addEventListener('change', e=>{ const f=e.target.files[0]; if(f) handleFile(f); });
}

async function ensureReady(){ if(!BANK.length) await loadBank(); if(!RULES) await loadConfig(); }

async function handleFile(f){
  const txt = await f.text(); let data;
  try{ data=JSON.parse(txt); }catch(e){ alert('不是有效的 JSON'); return; }
  $('#meta').textContent = `姓名: ${data.name||''} · 模式: ${data.mode} · 语言: ${data.lang} · 时间: ${data.timestamp}`;
  $('#raw').textContent = JSON.stringify(data, null, 2);
  await ensureReady();
  const result=analyze(data);
  renderBars(result);
  renderKPI(result);
  renderDiag(result);
  renderDecision(result);
  renderTimeline(data);
  $('#trigs').textContent = (result.triggerHits||[]).map(x=>`${x.key} +${x.affectVal}`).join('\n') || '(无)';
  // prompts
  const {userPrompt, labPrompt} = buildPrompts(data, result);
  $('#promptUser').value = userPrompt;
  $('#promptLab').value  = labPrompt;
  bindPromptButtons(userPrompt, labPrompt);
}

function analyze(rep){
  const ans=rep.answers||{}; const qmap={}; BANK.forEach(q=>qmap[q.id]=q);
  const per={BND:0,COM:0,EMP:0,INT:0,CRV:0}, mx={BND:0,COM:0,EMP:0,INT:0,CRV:0};
  const severeFlags=[], weakFlags=[]; let answered=0, goodCount=0;
  let publicityRisk=0, integrityRisk=0, volatilityRisk=0, egoismRisk=0;
  const triggerHits=[];

  for(const qid in ans){
    const q=qmap[qid]; if(!q) continue;
    const sel=ans[qid]; const opt=(q.options||[]).find(o=>o.id===sel);
    const best=(q.options||[]).reduce((a,b)=> b.score>(a?a.score:-1)?b:a, null);
    if(opt){
      answered++; if(opt.score>0) goodCount++;
      for(const k in per){ per[k]+= (opt.dims?.[k]||0); }
      const dimsSum=Object.values(opt.dims||{}).reduce((a,b)=>a+b,0);
      if(opt.score===0 && dimsSum===0){ severeFlags.push({qid,title:q.title,choice:sel,label:opt.label}); }
      else if(opt.score===0){ weakFlags.push({qid,title:q.title,choice:sel,label:opt.label}); }
      volatilityRisk += (opt.score===0)?1:0;
      if(RULES && RULES.triggers){
        const blob=(q.title+' '+q.scenario+' '+opt.label).toLowerCase();
        RULES.triggers.forEach(tg=>{
          if(blob.includes((tg.key||'').toLowerCase())){
            const aff=tg.affect||{};
            if('publicityRisk' in aff) publicityRisk+=aff.publicityRisk;
            if('integrityRisk' in aff) integrityRisk+=aff.integrityRisk;
            if('volatilityRisk' in aff) volatilityRisk+=aff.volatilityRisk;
            if('egoismRisk' in aff) egoismRisk+=aff.egoismRisk;
            triggerHits.push({key:tg.key, affectVal:JSON.stringify(aff)});
          }
        });
      }
    }
    if(best){ for(const k in mx){ mx[k]+= (best.dims?.[k]||0); } }
  }

  const ratio={}; DIM.forEach(k=> ratio[k]=Math.round((per[k]/Math.max(1,mx[k]))*100));
  const completion = Math.round(answered / Math.max(1,Object.keys(qmap).length) * 100);
  const goodRate = Math.round((goodCount/Math.max(1,answered))*100);

  publicityRisk = clamp(publicityRisk + (ratio.BND<60?10:0), 0, 100);
  integrityRisk = clamp(integrityRisk + (100-ratio.INT)*0.6, 0, 100);
  volatilityRisk = clamp(volatilityRisk*6 + (100-goodRate)*0.3, 0, 100);
  egoismRisk = clamp(egoismRisk + (100-ratio.EMP)*0.4 + (100-ratio.COM)*0.2 + (100-ratio.INT)*0.4, 0, 100);

  const fitW=(RULES && RULES.fit_weights) || {BND:0.22,COM:0.22,INT:0.28,EMP:0.18,CRV:0.10};
  const romaFit = clamp( ratio.BND*fitW.BND + ratio.COM*fitW.COM + ratio.INT*fitW.INT + ratio.EMP*fitW.EMP + ratio.CRV*fitW.CRV, 0, 100 );

  // pace metrics
  const pace = rep.pace || {durations:{}, order:[], timestamps:[]};
  const ds = Object.values(pace.durations||{}).filter(Boolean);
  let paceTrust=70, consistency=70;
  if(ds.length){
    const avg = ds.reduce((a,b)=>a+b,0)/ds.length;
    const fast = ds.filter(x=>x<900).length/ds.length;
    const slow = ds.filter(x=>x>12000).length/ds.length;
    const varcoef = (function(){ const m=avg; const v=ds.reduce((a,b)=>a+(b-m)*(b-m),0)/ds.length; return Math.sqrt(v)/(m||1); })();
    paceTrust = clamp(100 - (fast*40) - (varcoef*30) + (slow*10), 0, 100);
    consistency = clamp(100 - (varcoef*60), 0, 100);
  }

  return { ratio, completion, goodRate, severeFlags, weakFlags, publicityRisk, integrityRisk, volatilityRisk, egoismRisk, romaFit, answered, triggerHits, pace, paceTrust, consistency };
}

function clamp(v,min,max){ return Math.max(min, Math.min(max, Math.round(v))); }

function renderBars(r){
  const box=$('#bars'); if(!box) return; box.innerHTML='';
  for(const k of DIM){ box.appendChild(barRow(`<b>${DIM_NAME[k]}</b>`, r.ratio[k])); }
}

function riskClass(v, thr){ return v>=thr.risk_bad?'bad':(v>=thr.risk_warn?'warn':'good'); }
function fitClass(v, thr){ return v>=thr.fit_good?'good':(v>=thr.fit_warn?'warn':'bad'); }

function renderKPI(r){
  const thr=(RULES&&RULES.thresholds)||{fit_warn:55,fit_good:75,risk_warn:40,risk_bad:70};
  const k=$('#kpi'); if(!k) return; k.innerHTML='';
  const nav = r.pace?.order||[];
  const blocks = nav.filter(e=>e && e.type==='block').length;
  const jumps  = nav.filter(e=>e && e.type==='jump').length;
  const revisits = (function(){ const seen=new Set(); let cnt=0; nav.forEach(e=>{ if(!e||!e.qid) return; if(seen.has(e.qid)) cnt++; else seen.add(e.qid); }); return cnt; })();
  const items = [
    ['ROMA Fit', r.romaFit, fitClass(r.romaFit, thr)],
    ['Publicity Risk', r.publicityRisk, riskClass(r.publicityRisk, thr)],
    ['Integrity Risk', r.integrityRisk, riskClass(r.integrityRisk, thr)],
    ['Volatility', r.volatilityRisk, riskClass(r.volatilityRisk, thr)],
    ['Egoism Risk', r.egoismRisk, riskClass(r.egoismRisk, thr)],
    ['Pace Trust', r.paceTrust, fitClass(r.paceTrust, thr)],
    ['Consistency', r.consistency, fitClass(r.consistency, thr)],
    ['Nav Jumps', jumps, ''],
    ['Blocks', blocks, blocks>0?'warn':'good'],
    ['Revisit Count', revisits, '']
  ];
  items.forEach(([name,val,klass])=>{
    const card=document.createElement('div'); card.className='card pad';
    card.innerHTML=`<div class="muted">${name}</div><div><b class="${klass}">${val}</b></div>`;
    k.appendChild(card);
  });
}

function renderDiag(r){
  const ul=$('#diag'); if(!ul) return; ul.innerHTML='';
  const add=(html)=>{ const li=document.createElement('li'); li.innerHTML=html; ul.appendChild(li); };
  add(`综合契合度（ROMA Fit）：<b class="${fitClass(r.romaFit,(RULES&&RULES.thresholds)||{fit_warn:55,fit_good:75})}">${r.romaFit}/100</b>`);
  add(`公开表达风险：<b class="${riskClass(r.publicityRisk,(RULES&&RULES.thresholds)||{risk_warn:40,risk_bad:70})}">${r.publicityRisk}/100</b> · 诚信风险：<b class="${riskClass(r.integrityRisk,(RULES&&RULES.thresholds)||{risk_warn:40,risk_bad:70})}">${r.integrityRisk}/100</b>`);
  add(`波动（Volatility）：<b class="${riskClass(r.volatilityRisk,(RULES&&RULES.thresholds)||{risk_warn:40,risk_bad:70})}">${r.volatilityRisk}/100</b> · 精致利己：<b class="${riskClass(r.egoismRisk,(RULES&&RULES.thresholds)||{risk_warn:40,risk_bad:70})}">${r.egoismRisk}/100</b>`);

  const traces=[];
  (r.severeFlags||[]).slice(0,2).forEach(it=>traces.push(`【高风险】${it.qid} · ${it.title} · 选项 ${it.choice}：${it.label}`));
  (r.weakFlags||[]).slice(0,2).forEach(it=>traces.push(`【中风险】${it.qid} · ${it.title} · 选项 ${it.choice}：${it.label}`));
  if(traces.length){
    const li=document.createElement('li'); li.innerHTML='证据样例：'; const ol=document.createElement('ol');
    traces.forEach(t=>{ const x=document.createElement('li'); x.textContent=t; ol.appendChild(x); });
    li.appendChild(ol); ul.appendChild(li);
  }

  const s = buildSummaryText(r);
  $('#summary').innerHTML = s;
}

function renderDecision(r){
  const thr=(RULES&&RULES.thresholds)||{fit_warn:55,fit_good:75,risk_warn:40,risk_bad:70};
  const d=$('#decision'); if(!d) return;
  const suggest=[];
  suggest.push(`ROMA Fit: ${r.romaFit}/100`);
  suggest.push(`Integrity Risk: ${r.integrityRisk}/100 | Publicity: ${r.publicityRisk}/100 | Egoism: ${r.egoismRisk}/100`);
  suggest.push(`Flags – Severe: ${r.severeFlags.length}, Weak: ${r.weakFlags.length}`);
  suggest.push(`面试关注建议：当 Fit < ${thr.fit_warn} 或 Integrity ≥ ${thr.risk_warn} 时进入重点复核；Publicity ≥ ${thr.risk_warn} 时重点讨论对外表达边界与分寸。`);
  d.textContent=suggest.join('\n');
}

// ---------- Timeline (navEvents) ----------
function renderTimeline(rep){
  const c=document.getElementById('timeline'); if(!c) return;
  const ctx=c.getContext('2d'); const w=c.width=c.clientWidth; const h=c.height=c.clientHeight;
  ctx.clearRect(0,0,w,h);
  const events = (rep.navEvents && rep.navEvents.length)? rep.navEvents : [];
  if(!events.length){ ctx.fillStyle='#94a3b8'; ctx.fillText('没有 navEvents', 10, 20); $('#tlMeta').textContent=''; return; }
  const t0 = events[0].ts, t1 = events[events.length-1].ts, span=Math.max(1, t1-t0);
  events.forEach((e,i)=>{
    const x = ( (e.ts - t0) / span ) * (w-20) + 10;
    const y = h - 20 - (e.type==='block'?12: (e.type==='jump'?8:4));
    ctx.fillStyle = e.type==='block' ? '#f59e0b' : (e.type==='jump' ? '#22d3ee' : '#a3e635');
    ctx.fillRect(x-2, y, 4, (e.type==='block'?18:12));
  });
  const jumps = events.filter(e=>e.type==='jump').length;
  const blocks = events.filter(e=>e.type==='block').length;
  const revisits = (function(){ const seen=new Set(); let cnt=0; events.forEach(e=>{ if(!e.qid) return; if(seen.has(e.qid)) cnt++; else seen.add(e.qid); }); return cnt; })();
  $('#tlMeta').textContent = `跳转: ${jumps} · 阻断: ${blocks} · 回看: ${revisits}`;
}

// ---------- Natural language summary ----------
function buildSummaryText(r){
  const toneFit = r.romaFit>=80?'契合度很高':(r.romaFit>=60?'总体较为匹配':'契合度有待观察');
  const riskPub = r.publicityRisk>=70?'外部表达需严格把控':(r.publicityRisk>=40?'外部表达边界需提示':'外部表达稳健');
  const riskInt = r.integrityRisk>=70?'流程与诚信需重点追问':(r.integrityRisk>=40?'建议在面试核验流程意识':'流程与诚信稳定');
  const paceTone = (r.paceTrust>=75 && r.consistency>=75)?'节奏稳定自然':(r.paceTrust<50?'节奏可信度偏低，可能存在走形式迹象':'节奏基本可信');
  return [
    `<p>综合来看，候选人与 ROMA Lab 的 <b>${toneFit}</b>。在对外表达方面，<b>${riskPub}</b>；在诚信与流程方面，<b>${riskInt}</b>；作答节奏显示 <b>${paceTone}</b>。</p>`,
    `<p>维度比例：Boundary ${r.ratio.BND}% · Communication ${r.ratio.COM}% · Empathy ${r.ratio.EMP}% · Integrity ${r.ratio.INT}% · Creativity&Resilience ${r.ratio.CRV}%。</p>`
  ].join('');
}

// ---------- Prompt builders ----------
function buildPrompts(rep, result){
  const mode = rep.mode || (Object.keys(rep.answers||{}).length<=22?'core':'full');
  const lang = rep.lang || 'zh';
  const dimLine = `BND:${result.ratio.BND} COM:${result.ratio.COM} EMP:${result.ratio.EMP} INT:${result.ratio.INT} CRV:${result.ratio.CRV}`;
  const risks = `Publicity:${result.publicityRisk} Integrity:${result.integrityRisk} Volatility:${result.volatilityRisk} Egoism:${result.egoismRisk}`;
  const pace  = `PaceTrust:${result.paceTrust} Consistency:${result.consistency}`;
  const evid = [];
  (result.severeFlags||[]).slice(0,2).forEach(it=> evid.push(`Severe · ${it.qid} · ${it.title} · ${it.label}`));
  (result.weakFlags||[]).slice(0,2).forEach(it=> evid.push(`Weak · ${it.qid} · ${it.title} · ${it.label}`));
  const evidence = evid.join('\n');

  const userPrompt = `
SYSTEM (User-Facing, Praise-First)
You are a warm, supportive assistant tasked to write a short celebratory summary for a student's ROMA Lab Cultural Insight Test (CIT). Never criticize or advise changes. Only highlight strengths with positive, human language.

Context:
- Name: ${rep.name||'Candidate'}
- Mode: ${mode} · Language: ${lang}
- Completion: ${result.answered} answered
- Dimension ratios: ${dimLine}
- Pace: ${pace}

Requirements:
1) Keep tone gentle, respectful, and inspiring. 2) Use natural, non-template phrasing. 3) Mention two strongest dimensions and describe their feel in daily lab scenarios (communication, collaboration, writing, reviews). 4) Close with an uplifting line.

Return a concise paragraph in the report language (${lang}).
`.trim();

  const labPrompt = `
SYSTEM (Lab-Facing, Internal Insight)
You are an analytical assistant for ROMA Lab faculty. Produce a precise, evidence-linked assessment of a student's CIT results to support recruiting decisions. Do not praise-please; be clear and grounded.

Context:
- Name: ${rep.name||'Candidate'}
- Mode: ${mode} · Language: ${lang}
- Dimension ratios: ${dimLine}
- Risks: ${risks}
- Pace: ${pace}
- Trigger hits (if any): ${(result.triggerHits||[]).map(x=>x.key).join(', ')||'none'}
- Evidence samples:
${evidence || '(no notable flags; use dimension/pace patterns instead)'}

Guidelines:
1) Summarize overall fit succinctly (0-100 implied by ratios/ROMA Fit). 
2) Discuss potential risks (publicity, integrity, volatility, egoism) and what interview probes could confirm or disconfirm them.
3) Highlight 2–3 notable behaviors inferred from choices (e.g., tendency to rush decisions, boundary awareness) and cite the above evidence lines by their short text.
4) Conclude with a clear recommendation bucket: Strong Proceed / Proceed with Checks / Waitlist / Decline, with one-sentence rationale.

Return in Chinese (faculty use).
`.trim();

  return {userPrompt, labPrompt};
}

function bindPromptButtons(userPrompt, labPrompt){
  const copy = (text)=> navigator.clipboard?.writeText(text).then(()=>alert('已复制到剪贴板')).catch(()=>alert('复制失败'));
  document.getElementById('copyUser').onclick = ()=> copy(userPrompt);
  document.getElementById('copyLab').onclick  = ()=> copy(labPrompt);
  document.getElementById('downloadUser').onclick = ()=> downloadTxt('CIT_user_prompt.txt', userPrompt);
  document.getElementById('downloadLab').onclick  = ()=> downloadTxt('CIT_lab_prompt.txt',  labPrompt);
}

function downloadTxt(name, text){
  const blob=new Blob([text], {type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
