/* ROMA Lab CIT – v3.2 navigation rules
 * - Auto-advance on select
 * - Arrows only browse answered items (prev/next answered)
 * - Block forward when current is unanswered
 * - Emit detailed navEvents for faculty analyzer
 */

const state = {
    lang: 'zh',
    mode: 'core',
    name: '',
    bank: [],
    idx: 0,
    answers: {},
    pickedHistory: [],
    per: {BND:0, COM:0, EMP:0, INT:0, CRV:0},
    max: {BND:0, COM:0, EMP:0, INT:0, CRV:0},
    pace: { durations:{}, order:[], timestamps:[] },
    _showTs: null,
    _lastBankByLangMode: {},
    // NEW: navigation analytics
    navEvents: [] // {type:'auto'|'next'|'prev'|'blocked_next'|'blocked_prev', from,to, ts, reason?}
};

const BANK_URLS = (lang) => ({
    core:     `quiz/core.${lang}.json`,
    extended: `quiz/extended.${lang}.json`,
});

const T = {
    zh: {
        title: 'ROMA Lab Cultural Insight Test',
        desc: '选择一种模式开始作答。全程不收集任何个人数据，结果只保存在你的浏览器。',
        hint: 'Tips: 作答过程中可随时切换中英文；完成后可导出 JSON 与打印 PDF。',
        congrats: '🎉 恭喜你完成答题！',
        next: '现在你可以查看你的报告（仅保存在本地）。',
        modalTitle: '🎊 恭喜你完成答题！',
        modalDesc: '现在你可以查看你的报告啦～',
        btnReport: '查看报告',
        btnLater: '稍后再看',
        coach: 'AI 助教寄语',
        privacy: '隐私说明：所有数据仅在你的浏览器端运行。',
        radar: '雷达图',
        donut: '维度占比',
        spark: '答题节奏',
        export: '⬇️ 导出 JSON',
        print: '🖨️ 打印 / PDF',
        restart: '↻ 重新开始',
        tagCore: 'Core',
        tagFull: 'Full',
        tagLang: '中文',
        labels: {BND:'分寸感',COM:'沟通',EMP:'同理',INT:'诚信',CRV:'创造韧性'},
        praises: {
            BND:'你对边界的拿捏很细腻，内心有稳定的尺度与秩序感，令人安心。',
            COM:'你的表达清晰而体面，兼顾效率与照顾他人感受，推进感十足。',
            EMP:'你能把人看作一个完整的人，真诚、耐心、细致地理解彼此。',
            INT:'你有稳定的原则感与责任感，愿意为长期与可复现负责。',
            CRV:'你的探索有想象力也有韧性，遇到阻力时依然松弛专注。',
            SUM:'这种组合让你的行动更自洽、更从容，也更有穿透力。'
        }
    },
    en: {
        title: 'ROMA Lab Cultural Insight Test',
        desc: 'Pick a mode to get started. We don’t collect any personal data. Everything stays in your browser.',
        hint: 'Tips: You can switch languages anytime; export JSON or print PDF after finishing.',
        congrats: '🎉 Congrats on finishing!',
        next: 'Your report is ready (stored locally).',
        modalTitle: '🎊 Congrats!',
        modalDesc: 'You can view your report now.',
        btnReport: 'View Report',
        btnLater: 'Later',
        coach: 'AI Coach Note',
        privacy: 'Privacy: everything runs locally in your browser.',
        radar: 'Radar',
        donut: 'Breakdown',
        spark: 'Answer Rhythm',
        export: '⬇️ Export JSON',
        print: '🖨️ Print / PDF',
        restart: '↻ Restart',
        tagCore: 'Core',
        tagFull: 'Full',
        tagLang: 'English',
        labels: {BND:'Boundary',COM:'Communication',EMP:'Empathy',INT:'Integrity',CRV:'Creativity & Resilience'},
        praises: {
            BND:'You have a refined sense of boundaries—steady, respectful, and composed.',
            COM:'Your communication is clear and considerate, moving things forward gracefully.',
            EMP:'You see people in full, with patience and genuine warmth.',
            INT:'You hold steady principles and own long-term, reproducible work.',
            CRV:'You bring imagination with resilience, staying relaxed under pressure.',
            SUM:'Together, these give your work a natural poise and quiet strength.'
        }
    }
};

const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));

function palette(i){ const c=['#60a5fa','#22d3ee','#a3e635','#f59e0b','#ef4444','#c084fc','#10b981']; return c[i%c.length]; }

/* ---------- Charts ---------- */
function radarSVG(p, labels){
    const keys=['BND','COM','EMP','INT','CRV']; const N=keys.length;
    const size=260, r=95, cx=130, cy=130;
    const grid = Array.from({length:5},(_,j)=>{
        const rr=r*(1-(j)/5);
        const ring = keys.map((k,i)=>{const a=-Math.PI/2+i*2*Math.PI/N;return[ cx+rr*Math.cos(a), cy+rr*Math.sin(a) ]})
            .map(pt=>pt.join(',')).join(' ');
        return `<polygon points="${ring}" fill="none" stroke="currentColor" opacity="${0.10+(j*0.06)}"/>`;
    }).join('');
    const polyPts = keys.map((k,i)=>{ const a=-Math.PI/2+i*2*Math.PI/N; const rr=r*((p[k]||0)/100); return [cx+rr*Math.cos(a), cy+rr*Math.sin(a)];});
    const poly = polyPts.map(pt=>pt.join(',')).join(' ');
    const labelsSVG = keys.map((k,i)=>{ const a=-Math.PI/2+i*2*Math.PI/N; const lx=cx+(r+16)*Math.cos(a), ly=cy+(r+16)*Math.sin(a);
        return `<text x="${lx}" y="${ly}" font-size="10" text-anchor="middle">${labels[k]}</text>`;}).join('');
    const dots = polyPts.map((pt,i)=>`<circle cx="${pt[0]}" cy="${pt[1]}" r="3" fill="${palette(i)}"/>`).join('');
    return `<svg viewBox="0 0 ${size} ${size}"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee" stop-opacity="0.35"/><stop offset="1" stop-color="#a3e635" stop-opacity="0.35"/></linearGradient></defs>${grid}<polygon points="${poly}" fill="url(#rg)" stroke="currentColor" stroke-width="1.6" opacity="0.9"/>${dots}${labelsSVG}</svg>`;
}
function arcPath(R,r,a0,a1){ const x0=R*Math.cos(a0),y0=R*Math.sin(a0),x1=R*Math.cos(a1),y1=R*Math.sin(a1),xl=r*Math.cos(a0),yl=r*Math.sin(a0),xr=r*Math.cos(a1),yr=r*Math.sin(a1),large=(a1-a0)>Math.PI?1:0; return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${xr} ${yr} A ${r} ${r} 0 ${large} 0 ${xl} ${yl} Z`; }
function donutSVG(p,labels){ const k=['BND','COM','EMP','INT','CRV']; const tot=k.reduce((a,x)=>a+(p[x]||0),0)||1; let acc=0; const R=86,r=40,segs=[]; k.forEach((x,i)=>{const v=(p[x]||0)/tot, a0=acc*2*Math.PI, a1=(acc+v)*2*Math.PI; acc+=v; segs.push(`<path d="${arcPath(R,r,a0,a1)}" fill="${palette(i)}" opacity="0.65"><title>${labels[x]} ${(p[x]||0).toFixed(0)}%</title></path>`);}); return `<svg viewBox="0 0 220 220"><g transform="translate(110,110)">${segs.join('')}</g></svg>`; }
function sparkSVG(arr){ if(!arr.length) return '<svg viewBox="0 0 260 60"></svg>'; const w=260,h=60,m=10,step=(w-2*m)/Math.max(1,arr.length-1),y=v=>h-m-v*(h-2*m); let d=''; arr.forEach((v,i)=>{const x=m+i*step, yy=y(v*0.8+0.1); d+=(i?'L':'M')+x+' '+yy+' ';}); const bars=arr.map((v,i)=>{const x=m+i*step, y0=h-m, y1=y(v*0.8+0.1); return `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${palette(i)}" stroke-width="2" opacity="0.7"/>`;}).join(''); return `<svg viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="#e5e7eb" stroke-width="1.4" opacity="0.35"/>${bars}</svg>`; }

/* ---------- AI Coach ---------- */
function buildCoach(per, lang){
    const L=T[lang]; const keys=['BND','COM','EMP','INT','CRV']; const ranked=keys.slice().sort((a,b)=>per[b]-per[a]); const lead=ranked[0], second=ranked[1];
    function line(k){ const pct=Math.round(per[k]); const label=L.labels[k]; const p=T[lang].praises[k];
        const addon=pct>=85?(lang==='zh'?' 展现出稳定而自洽的气场。':' with a steady, self-assured presence.'):
            pct>=70?(lang==='zh'?' 流畅自然，令人舒适。':' that feels natural and easy to work with.'):
                pct>=55?(lang==='zh'?' 轻松松弛、耐心从容。':' with a relaxed and patient tone.'):
                    (lang==='zh'?' 含蓄内敛，细水长流。':' with a quiet, enduring quality.');
        return `${label}: ${pct}% — ${p}${addon}`;}
    const items=ranked.map(line);
    const topDesc=(lang==='zh')?`在你的画像里，“${L.labels[lead]}”与“${L.labels[second]}”构成了你独特的亮点。`:`In your profile, “${L.labels[lead]}” and “${L.labels[second]}” stand out beautifully.`;
    const close=(lang==='zh')?`愿你把这种气质带到更广阔的舞台：在专注里沉稳，在热爱里发光。每一步都算数。`:`Carry this energy forward—steady in focus, quietly radiant in passion. Every step counts.`;
    return {items, summary: topDesc+' '+T[lang].praises.SUM+' '+close};
}

/* ---------- Loaders ---------- */
async function loadBank(lang,mode){ const u=BANK_URLS(lang); const core=await fetch(u.core).then(r=>r.json()); if(mode==='core') return core; const ext=await fetch(u.extended).then(r=>r.json()); return core.concat(ext); }

async function applyLangMode(lang, mode, keepAnswers=true){
    const prevAnswers={...state.answers}; const prevIdxQid=state.bank[state.idx]?.id; const prevPace={...state.pace}; const prevNav=[...state.navEvents];

    state.lang=lang; state.mode=mode; state.bank=await loadBank(lang,mode); state._lastBankByLangMode[`${lang}:${mode}`]=state.bank;
    const valid=new Set(state.bank.map(q=>q.id));
    state.answers = keepAnswers ? Object.fromEntries(Object.entries(prevAnswers).filter(([id])=>valid.has(id))) : {};
    // keep durations for still-valid ids
    const newDur={}; Object.keys(prevPace.durations||{}).forEach(id=>{ if(valid.has(id)) newDur[id]=prevPace.durations[id]; });
    state.pace={durations:newDur, order:[], timestamps:[]};
    state.navEvents=prevNav;

    let newIdx=0; if(prevIdxQid){ const i=state.bank.findIndex(q=>q.id===prevIdxQid); if(i>=0) newIdx=i; }
    state.idx=newIdx;

    computeScore(); renderAll();
}

/* ---------- Score ---------- */
function computeScore(){
    const per={BND:0,COM:0,EMP:0,INT:0,CRV:0}, max={BND:0,COM:0,EMP:0,INT:0,CRV:0};
    state.bank.forEach(q=>{
        const dmax={BND:0,COM:0,EMP:0,INT:0,CRV:0};
        (q.options||[]).forEach(o=>{ Object.entries(o.dims||{}).forEach(([k,v])=> dmax[k]=Math.max(dmax[k],v||0)); });
        Object.keys(max).forEach(k=> max[k]+=dmax[k]);
        const pick=state.answers[q.id]; if(pick){ const opt=(q.options||[]).find(o=>o.id===pick); if(opt){ Object.entries(opt.dims||{}).forEach(([k,v])=> per[k]+=v||0); } }
    });
    Object.keys(per).forEach(k=>{ const m=max[k]||1; per[k]=clamp((per[k]/m)*100,0,100); });
    state.per=per; state.max=max;
}

/* ---------- Helpers (answered navigation) ---------- */
const isAnswered = (i)=>{ const q=state.bank[i]; return q && state.answers[q.id]; };
function findPrevAnsweredIndex(curr){ for(let i=curr-1;i>=0;i--){ if(isAnswered(i)) return i; } return -1; }
function findNextAnsweredIndex(curr){ for(let i=curr+1;i<state.bank.length;i++){ if(isAnswered(i)) return i; } return -1; }
const allAnswered = ()=> state.bank.every(q=> !!state.answers[q.id]);

/* ---------- Render ---------- */
function renderAll(){ renderHeader(); renderProgress(); renderQuestion(); }

function renderHeader(){
    $('#t_title').textContent=T[state.lang].title;
    $('#t_desc').textContent=T[state.lang].desc;
    $('#t_hint').textContent=T[state.lang].hint;
    $('#modeTag').textContent = state.mode==='core'? T[state.lang].tagCore : T[state.lang].tagFull;
    $('#langTag').textContent = state.lang==='zh'? '中文' : 'English';

    $('#langBtn').onclick = async ()=>{ state.lang=(state.lang==='zh')?'en':'zh'; await applyLangMode(state.lang,state.mode,true); };
    $('#themeBtn').onclick = ()=> document.body.classList.toggle('light');
    $('#coreBtn').onclick = async ()=>{ state.mode='core'; await applyLangMode(state.lang,state.mode,true); $('#quiz').classList.remove('hidden'); $('#setup').classList.add('hidden'); };
    $('#fullBtn').onclick = async ()=>{ state.mode='full'; await applyLangMode(state.lang,state.mode,true); $('#quiz').classList.remove('hidden'); $('#setup').classList.add('hidden'); };
    $('#nameInput')?.addEventListener('input', e=> state.name=e.target.value.trim());
}

function renderProgress(){
    const answered=Object.keys(state.answers).length, total=state.bank.length||1, pct=Math.round((answered/total)*100);
    $('#bar').style.width=pct+'%';
}

function renderQuestion(){
    const q=state.bank[state.idx]; if(!q) return;
    state._showTs = Date.now();

    $('#idx').textContent = `${state.idx+1} / ${state.bank.length}`;
    $('#chapter').textContent = q.tags?.join(' / ')||'';
    $('#qtitle').textContent = q.title;
    $('#qsc').textContent = q.scenario;

    const opts=$('#opts'); opts.innerHTML='';
    (q.options||[]).forEach(o=>{
        const d=document.createElement('div');
        d.className='opt'; d.setAttribute('data-opt',o.id);
        if(state.answers[q.id]===o.id) d.classList.add('selected');
        d.textContent=o.label;
        d.onclick=()=> onPick(q,o,d);
        opts.appendChild(d);
    });

    // nav arrows (answered-only travel)
    const prevBtn=$('#prevBtn'), nextBtn=$('#nextBtn');
    const prevIdx=findPrevAnsweredIndex(state.idx);
    const nextIdx=findNextAnsweredIndex(state.idx);

    prevBtn.disabled = (prevIdx===-1);
    nextBtn.disabled = (nextIdx===-1);

    prevBtn.onclick = ()=>{
        if(prevIdx===-1){
            state.navEvents.push({type:'blocked_prev', from:state.idx, to:null, ts:Date.now(), reason:'no_prev_answered'});
            return;
        }
        state.navEvents.push({type:'prev', from:state.idx, to:prevIdx, ts:Date.now()});
        state.idx=prevIdx; renderQuestion();
    };
    nextBtn.onclick = ()=>{
        if(nextIdx===-1){
            // If current unanswered, we block forward
            if(!state.answers[q.id]){
                state.navEvents.push({type:'blocked_next', from:state.idx, to:null, ts:Date.now(), reason:'current_unanswered'});
            }else{
                state.navEvents.push({type:'blocked_next', from:state.idx, to:null, ts:Date.now(), reason:'no_next_answered'});
            }
            return;
        }
        state.navEvents.push({type:'next', from:state.idx, to:nextIdx, ts:Date.now()});
        state.idx=nextIdx; renderQuestion();
    };
}

/* ---------- On pick (auto-advance) ---------- */
function onPick(q,opt,el){
    if(!state.pace.durations[q.id]) state.pace.durations[q.id] = Date.now() - (state._showTs||Date.now());
    state.answers[q.id]=opt.id;
    state.pickedHistory.push({qid:q.id, optionId:opt.id, ts:Date.now()});
    $$('#opts .opt').forEach(x=>x.classList.remove('selected'));
    el.classList.add('selected');

    computeScore(); renderProgress();

    // auto-advance to next question (index+1), or if finished -> modal
    if(allAnswered()){
        // stay on current for a moment then show completion
        showCompletion();
        return;
    }
    const from = state.idx;
    if(state.idx < state.bank.length-1){
        state.idx = state.idx + 1;
        state.navEvents.push({type:'auto', from, to:state.idx, ts:Date.now()});
        renderQuestion();
    }else{
        // last item answered but not all (shouldn't happen if allAnswered() is false)
        state.navEvents.push({type:'auto', from, to:state.idx, ts:Date.now(), reason:'last_item'});
    }
}

/* ---------- Completion ---------- */
function showCompletion(){
    showModal();
    confettiBurst();
}

/* ---------- Modal & Report ---------- */
function showModal(){
    $('#t_modal_title').textContent = (state.lang==='zh')? T.zh.modalTitle : T.en.modalTitle;
    $('#t_modal_desc').textContent = (state.lang==='zh')? T.zh.modalDesc : T.en.modalDesc;
    $('#goReport').textContent     = (state.lang==='zh')? T.zh.btnReport  : T.en.btnReport;
    $('#stayBtn').textContent      = (state.lang==='zh')? T.zh.btnLater   : T.en.btnLater;
    $('#doneModal').classList.add('show');
    $('#goReport').onclick = ()=>{ $('#doneModal').classList.remove('show'); renderReport(); };
    $('#stayBtn').onclick = ()=>{ $('#doneModal').classList.remove('show'); };
}

function renderReport(){
    $('#setup').classList.add('hidden'); $('#quiz').classList.add('hidden'); $('#result').classList.remove('hidden');

    $('#t_congrats').textContent = (state.lang==='zh')? T.zh.congrats : T.en.congrats;
    $('#t_next').textContent     = (state.lang==='zh')? T.zh.next    : T.en.next;
    $('#t_coach').textContent    = (state.lang==='zh')? T.zh.coach   : T.en.coach;
    $('#t_privacy').textContent  = (state.lang==='zh')? T.zh.privacy : T.en.privacy;
    $('#radarTitle').textContent = (state.lang==='zh')? T.zh.radar   : T.en.radar;
    $('#donutTitle').textContent = (state.lang==='zh')? T.zh.donut   : T.en.donut;
    $('#sparkTitle').textContent = (state.lang==='zh')? T.zh.spark   : T.en.spark;

    const labels=(state.lang==='zh')? T.zh.labels : T.en.labels;
    $('#radar').innerHTML = radarSVG(state.per, labels);
    $('#donut').innerHTML = donutSVG(state.per, labels);

    const ids=state.bank.map(q=>q.id);
    const ds=ids.map(id=> state.pace.durations[id]||0);
    const maxd=Math.max(1,...ds);
    const arr=ds.map(d=> maxd? (1-d/maxd):0.5);
    $('#spark').innerHTML = sparkSVG(arr);

    const coach=buildCoach(state.per,state.lang);
    const ul=$('#coachList'); ul.innerHTML='';
    coach.items.forEach(s=>{ const li=document.createElement('li'); li.textContent=s; ul.appendChild(li); });
    const li=document.createElement('li'); li.className='muted'; li.textContent=coach.summary; ul.appendChild(li);

    $('#exportBtn').onclick = exportJSON;
    $('#printBtn').onclick  = ()=> window.print();
    $('#restartBtn').onclick= ()=> location.reload();
}

/* ---------- Export ---------- */
function exportJSON(){
    const answered=Object.keys(state.answers).length, total=state.bank.length;
    const payload={
        version:'v3.2-nav',
        lang:state.lang, mode:state.mode, name:state.name||'',
        answered, total, per:state.per, max:state.max,
        picked:state.pickedHistory, answers:state.answers,
        pace:state.pace,
        // NEW: nav events for faculty analyzer
        navEvents: state.navEvents,
        timestamp:new Date().toISOString(),
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`ROMA_CIT_${state.mode}_${state.lang}_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(a.href);
}

/* ---------- Confetti ---------- */
function confettiBurst(){
    const c=document.getElementById('confetti'); const ctx=c.getContext('2d');
    resize(); window.addEventListener('resize',resize);
    const parts=Array.from({length:100},()=>({x:Math.random()*c.width,y:-10,vx:(Math.random()-0.5)*2,vy:Math.random()*2+2,s:Math.random()*6+4,a:1}));
    let t=0;
    (function frame(){
        ctx.clearRect(0,0,c.width,c.height);
        parts.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.a-=0.008; ctx.fillStyle=`hsla(${(t+p.x)%360},80%,60%,${Math.max(0,p.a)})`; ctx.fillRect(p.x,p.y,p.s,p.s*0.6); });
        t+=2;
        if(parts.some(p=>p.a>0 && p.y<c.height+20)) requestAnimationFrame(frame); else ctx.clearRect(0,0,c.width,c.height);
    })();
    function resize(){ c.width=window.innerWidth; c.height=window.innerHeight; }
}

/* ---------- Bootstrap ---------- */
async function initCIT(){ renderHeader(); await applyLangMode(state.lang,state.mode,true); }
document.addEventListener('DOMContentLoaded', initCIT);
