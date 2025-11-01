/* ROMA Lab — standalone pages shared script (no deps) */
/* ============ Common utilities (once) ============ */

// 获取 ?slug=xxx
function getQueryParam(name){
    const u = new URL(location.href);
    return u.searchParams.get(name) || '';
}

// 与 main.js 一致的 slug 规则
function slugify(s=''){
    return (s||'').toString().trim().toLowerCase()
        .replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-');
}

// 载入站点数据（兼容拆分JSON与旧lab-data.json）
async function loadDataForPages(){
    const safeLoad = async (path) => {
        try{ const r = await fetch(path, {cache:'no-store'}); if (!r.ok) throw 0; return await r.json(); }
        catch{ return null; }
    };
    try{
        const settings  = await safeLoad('../data/settings.json');
        const news      = await safeLoad('../data/news.json');
        const people    = await safeLoad('../data/people.json');
        const projects  = await safeLoad('../data/projects.json');
        const pubs      = await safeLoad('../data/publications.json');
        const gallery   = await safeLoad('../data/gallery.json');

        if (news || people || projects || pubs){
            return {
                manual_url: settings?.manual_url || 'about:blank',
                news: Array.isArray(news) ? news : (news?.items ?? []),
                people: (Array.isArray(people) ? people : (people?.items ?? [])).map(p=>({...p, slug: p.slug || slugify(p.name)})),
                projects: (Array.isArray(projects) ? projects : (projects?.items ?? [])).map(p=>({...p, slug: p.slug || slugify(p.title)})),
                publications: Array.isArray(pubs) ? pubs : (pubs?.items ?? []),
                gallery: Array.isArray(gallery) ? gallery : (gallery?.items ?? [])
            };
        }
        // 退回旧结构
        const res = await fetch('../data/lab-data.json', {cache:'no-store'});
        const legacy = await res.json();
        legacy.people   = (legacy.people||[]).map(p=>({...p, slug: p.slug || slugify(p.name)}));
        legacy.projects = (legacy.projects||[]).map(p=>({...p, slug: p.slug || slugify(p.title)}));
        return legacy;
    }catch(e){
        console.error('[pages] loadData failed', e);
        return {people:[], projects:[], publications:[], news:[], gallery:[]};
    }
}


// DOM helpers
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const fmtDate = d => isNaN(new Date(d)) ? '' : new Date(d).toLocaleDateString();

// 图片占位回退
function applyImageFallbacks(root=document){
    const imgs = root.querySelectorAll('img[data-fallback]');
    imgs.forEach(img=>{
        const kind = img.dataset.fallback;
        if (!img.getAttribute('src')){
            replace(img, kind); return;
        }
        img.addEventListener('error', ()=> replace(img, kind), {once:true});
    });
    function replace(img, kind){
        const repl = document.createElement('div');
        if (kind === 'avatar'){
            repl.className = 'avatar placeholder';
            repl.setAttribute('role','img');
            if (img.alt) repl.setAttribute('aria-label', img.alt);
        } else {
            repl.className = 'project-cover placeholder';
            repl.setAttribute('aria-hidden','true');
        }
        img.replaceWith(repl);
    }
}

/* ============ Data loading (JSON) ============ */
async function loadJSON(path, fallback){
    try{
        const res = await fetch(path, {cache:'no-store'});
        if (!res.ok) throw new Error(res.statusText);
        return await res.json();
    }catch(e){
        console.error('Failed to load', path, e);
        return fallback;
    }
}

async function loadAll(){
    const [settings, news, people, projects, pubs, gallery] = await Promise.all([
        loadJSON('../data/settings.json', {}),
        loadJSON('../data/news.json', {items:[]}),
        loadJSON('../data/people.json', {items:[]}),
        loadJSON('../data/projects.json', {items:[]}),
        loadJSON('../data/publications.json', {items:[]}),
        loadJSON('../data/gallery.json', {items:[]})
    ]);

    return {
        settings,
        news: Array.isArray(news) ? news : (news.items || []),
        people: (Array.isArray(people) ? people : (people.items || [])).map(p=>({ ...p, slug: p.slug || slugify(p.name) })),
        projects: (Array.isArray(projects) ? projects : (projects.items || [])).map(p=>({ ...p, slug: p.slug || slugify(p.title) })),
        publications: Array.isArray(pubs) ? pubs : (pubs.items || []),
        gallery: Array.isArray(gallery) ? gallery : (gallery.items || []),
    };
}

/* ============ BibTeX priority loader (publications) ============ */

async function loadPublicationsUnified(){
    // 允许 settings.json 指定路径
    let settings = {};
    try{
        const r = await fetch('../data/settings.json', {cache:'no-store'});
        if (r.ok) settings = await r.json();
    }catch{}

    const bibPath = settings.publications_bib || '../data/publications.bib';

    // 1) 先尝试 bib
    try{
        const r = await fetch(bibPath, {cache:'no-store'});
        if (r.ok){
            const bibText = await r.text();
            const pubs = parseBibTeXToPubs(bibText) || [];
            console.info('[pubs] loaded from BibTeX:', pubs.length);
            return pubs;
        }
    }catch(e){
        console.warn('[pubs] bib load failed:', e);
    }

    // 2) 回退 publications.json
    try{
        const r = await fetch('../data/publications.json', {cache:'no-store'});
        if (r.ok){
            const j = await r.json();
            const pubs = Array.isArray(j) ? j : (j.items || []);
            console.info('[pubs] loaded from JSON:', pubs.length);
            return pubs;
        }
    }catch(e){
        console.warn('[pubs] json load failed:', e);
    }

    console.warn('[pubs] no publications loaded');
    return [];
}



/* ============ Lightweight BibTeX parser ============ */
function parseBibTeXToPubs(bibText){
    if (!bibText || typeof bibText !== 'string') return [];

    // 按条目切分：@type{key, ...}
    const entryRe = /@(\w+)\s*\{\s*([^,]+)\s*,([\s\S]*?)\}\s*(?=@|\s*$)/g;
    const pubs = [];
    let m;
    while ((m = entryRe.exec(bibText)) !== null){
        const typeRaw = m[1].trim();
        const key = m[2].trim();
        const body = m[3].trim();

        // 顶层逗号安全切分 k = {...} 或 "..."
        const fields = {};
        const parts = splitTopLevel(body, ',');
        for (const part of parts){
            const kv = part.split(/=(.+)/); // 只分第一个 "="
            if (kv.length < 2) continue;
            const k = kv[0].trim().toLowerCase();        // ← 统一小写
            let v = kv[1].trim();

            // 去掉收尾逗号
            if (v.endsWith(',')) v = v.slice(0, -1).trim();

            // 去掉外层引号/花括号（保留内容）
            if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('"') && v.endsWith('"'))){
                v = v.slice(1, -1).trim();
            }
            // 兼容多行，合并空白
            v = v.replace(/\s+\n\s+/g, ' ').replace(/\s{2,}/g, ' ').trim();

            fields[k] = v;
        }

        pubs.push(mapBibToPub(typeRaw, key, fields));
    }
    return pubs;

    // 在顶层分隔符切分（忽略花括号/引号内的分隔符）
    function splitTopLevel(s, sepChar=','){
        const out = [];
        let buf = '';
        let depth = 0;
        let inQuote = false;
        for (let i=0;i<s.length;i++){
            const c = s[i];
            if (c === '"' && s[i-1] !== '\\') inQuote = !inQuote;
            else if (!inQuote){
                if (c === '{') depth++;
                else if (c === '}') depth = Math.max(0, depth-1);
            }
            if (c === sepChar && !inQuote && depth === 0){
                if (buf.trim()) out.push(buf.trim());
                buf = '';
            } else {
                buf += c;
            }
        }
        if (buf.trim()) out.push(buf.trim());
        return out;
    }
}




// 解析 key = {…} / "…" / 裸值
function parseBibFields(body){
    const out = {};
    let i = 0, k = '', v = '', mode = 'key', depth = 0;

    const commit = ()=>{
        if (!k) return;
        out[k.trim().toLowerCase()] = (v || '').trim().replace(/,$/,'');
        k = ''; v = ''; mode = 'key'; depth = 0;
    };

    while (i < body.length){
        const ch = body[i];

        if (mode === 'key'){
            if (ch === '=') mode = 'preval';
            else if (ch === '}') break;
            else k += ch;
        }
        else if (mode === 'preval'){
            if (ch === '{'){ mode = 'brace'; depth = 1; v=''; }
            else if (ch === '"'){ mode = 'quote'; v=''; }
            else if (/\S/.test(ch)){ mode = 'bare'; v = ch; }
        }
        else if (mode === 'brace'){
            if (ch === '{') depth++;
            if (ch === '}'){
                depth--;
                if (depth === 0){ commit(); i++; continue; }
            }
            v += ch;
        }
        else if (mode === 'quote'){
            if (ch === '"' && body[i-1] !== '\\'){ commit(); i++; continue; }
            v += ch;
        }
        else if (mode === 'bare'){
            if (ch === ','){ commit(); }
            else if (ch === '}'){ commit(); break; }
            else { v += ch; }
        }
        i++;
    }

    // 去除外层大括号
    for (const kk in out){
        const vv = out[kk].trim();
        out[kk] = (vv.startsWith('{') && vv.endsWith('}')) ? vv.slice(1,-1) : vv;
    }
    return out;
}

// 将 "Last, First Middle" → "First Middle Last"
// 若无逗号或是组织名（大括号包裹），保持原样
function normalizeAuthorName(raw=''){
    let s = String(raw).trim();
    // 去掉外围大括号（例如 {ROMA Lab}），仅去一层
    const wasBraced = /^\{.*\}$/.test(s);
    if (wasBraced) s = s.slice(1, -1).trim();

    if (s.includes(',')){
        const parts = s.split(',').map(t => t.trim()).filter(Boolean);
        const last = parts.shift();                    // 第一段是 last name
        const rest = parts.join(' ').trim();           // 其余合并成 first/middle
        s = (rest ? (rest + ' ' + last) : last).replace(/\s+/g, ' ');
    } else {
        s = s.replace(/\s+/g, ' ');
    }
    return s;
}


function mapBibToPub(typeRaw, key, f){
    // authors：支持 author/authors，用 " and " 拆分，数组化
    // authors：支持 author/authors，用 " and " 拆分，并将 "Last, First" → "First Last"
    const authorField = f.author || f.authors || '';
    const authors = authorField
        ? authorField
            .split(/\s+and\s+/i)
            .map(a => normalizeAuthorName(a))
            .filter(Boolean)
        : [];


    // venue：优先识别 arXiv；否则 journal/booktitle/school/publisher
    const isArxiv = String(f.archiveprefix || f.archivePrefix || '').toLowerCase() === 'arxiv'
        || /arxiv/i.test(String(f.journal || ''))
        || !!f.eprint;
    const venue = isArxiv
        ? 'arXiv'
        : (f.journal || f.booktitle || f['book title'] || f.school || f.publisher || '');

    // year：取4位数字
    const year = Number((f.year || '').match(/\d{4}/)?.[0] || 0);

    // type：BibTeX → 站内
    const t = (typeRaw || '').toLowerCase();
    let type = 'Preprint';
    if (t === 'article') type = 'Journal';
    if (t === 'inproceedings' || t === 'proceedings') type = 'Conference';

    // pdf/code：优先显式字段；其次 url 若明显是 pdf（也放行 arxiv/pdf 这种即使没 .pdf 扩展名）
    const url = f.url || '';
    const pdfFromUrl = (/\.pdf(\?|$)/i.test(url) || /arxiv\.org\/pdf\//i.test(url)) ? url : '';
    const pdf = f.pdf || pdfFromUrl || '';
    const code = f.code || f.github || f.repository || '';

    // featured：默认 false；true/1/yes 视为 true（你 bib 里的 featured={true} 会被识别）
    const featured = ('featured' in f) ? /^y(es)?|true|1$/i.test(String(f.featured).trim()) : false;

    return {
        key,
        title: f.title || '',
        authors,                        // 数组
        venue,
        year,
        type,
        pdf,                            // 允许为空字符串（按钮仍渲染）
        code,                           // 允许为空字符串（按钮仍渲染）
        image: f.image || '',
        abstract: f.abstract || '',
        featured,
        ccf: f.ccf || f['ccf-rank'] || f.rank || '',   // ← 新增这一行
        note:f.note || '',
        bibtex: rebuildBibtex(typeRaw, key, f)
    };
}

function rebuildBibtex(typeRaw, key, f){
    const lines = Object.entries(f).map(([k,v])=>`  ${k} = {${v}}`);
    return `@${typeRaw}{${key},\n${lines.join(',\n')}\n}`;
}


/* ============ Markdown support ============ */




// 读取 Markdown（不存在时返回 null）
async function fetchMarkdown(path){
    try{
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.text();
    }catch{ return null; }
}

// 高级 Markdown（若第三方库存在）；否则退回轻量版
function renderMarkdown(mdText){
    if (!mdText) return '';
    const hasMarked = (typeof window !== 'undefined' && window.marked);
    const hasPurify = (typeof window !== 'undefined' && window.DOMPurify);

    if (hasMarked && hasPurify){
        // Marked 配置
        marked.setOptions({
            gfm: true,
            breaks: true,
            smartypants: true,
            headerIds: true,
            mangle: false
        });

        const raw = marked.parse(mdText);
        const clean = DOMPurify.sanitize(raw, {
            USE_PROFILES: { html: true },
            ADD_ATTR: ['target','rel','class','id','style']
        });

        const wrap = document.createElement('div');
        wrap.innerHTML = clean;

        // 代码高亮
        try{
            if (window.hljs){
                wrap.querySelectorAll('pre code').forEach(block => { hljs.highlightElement(block); });
            }
        }catch(_){}

        // KaTeX
        try{
            if (window.renderMathInElement){
                renderMathInElement(wrap, {
                    delimiters: [
                        {left:"$$", right:"$$", display:true},
                        {left:"$",  right:"$",  display:false},
                        {left:"\\(", right:"\\)", display:false},
                        {left:"\\[", right:"\\]", display:true}
                    ],
                    throwOnError:false
                });
            }
        }catch(_){}

        // Mermaid：支持 ```mermaid / .mermaid
        try{
            if (window.mermaid){
                if (!renderMarkdown._mInited){
                    mermaid.initialize({ startOnLoad:false, securityLevel:'strict' });
                    renderMarkdown._mInited = true;
                }
                const blocks = wrap.querySelectorAll('code.language-mermaid, pre.mermaid, .mermaid');
                blocks.forEach(codeEl=>{
                    const holder = document.createElement('div');
                    holder.className = 'mermaid';
                    holder.textContent = codeEl.textContent;
                    const pre = codeEl.closest('pre');
                    (pre || codeEl).replaceWith(holder);
                });
                mermaid.run({ querySelector: '.mermaid' });
            }
        }catch(_){}

        return wrap.innerHTML;
    }

    // —— 轻量回退（你原来的实现） ——
    return markdownToHTML(mdText);
}

// 轻量 Markdown → HTML（安全：先整体转义，再做白名单替换）
function markdownToHTML(mdRaw){
    if (!mdRaw) return '';
    let s = mdRaw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    // code block
    s = s.replace(/```([\s\S]*?)```/g, (_, code) => `<pre class="code"><code>${code.replace(/\n$/,'')}</code></pre>`);
    // inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // images
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />');
    // links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // bold / italic
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // headings
    s = s.replace(/^\s*######\s*(.+)$/gm, '<h6>$1</h6>');
    s = s.replace(/^\s*#####\s*(.+)$/gm, '<h5>$1</h5>');
    s = s.replace(/^\s*####\s*(.+)$/gm, '<h4>$1</h4>');
    s = s.replace(/^\s*###\s*(.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^\s*##\s*(.+)$/gm, '<h2>$1</h2>');
    s = s.replace(/^\s*#\s*(.+)$/gm, '<h1>$1</h1>');
    // unordered list
    s = s.replace(/(?:^(?:\s*[-*+]\s.+)\n?)+/gm, block=>{
        const lis = block.trim().split('\n').map(line => line.replace(/^\s*[-*+]\s(.+)$/, '<li>$1</li>')).join('');
        return `<ul>${lis}</ul>`;
    });
    // ordered list
    s = s.replace(/(?:^(?:\s*\d+\.\s.+)\n?)+/gm, block=>{
        const lis = block.trim().split('\n').map(line => line.replace(/^\s*\d+\.\s(.+)$/, '<li>$1</li>')).join('');
        return `<ol>${lis}</ol>`;
    });
    // hr
    s = s.replace(/^\s*(?:---|\*\*\*|___)\s*$/gm, '<hr/>');

    // paragraph wrap
    const lines = s.split(/\n{2,}/).map(chunk=>{
        if (/^\s*<(h\d|ul|ol|li|pre|img|hr)/i.test(chunk.trim())) return chunk;
        return `<p>${chunk.trim().replace(/\n+/g,'<br/>')}</p>`;
    });
    return lines.join('\n');
}

/* -------------------- All News -------------------- */
async function initNewsPage(){
    const {news} = await loadAll();
    const items = news.slice().sort((a,b)=> (b.date||'').localeCompare(a.date||''));
    const list = $('#news-all-list');
    const years = Array.from(new Set(items.map(n=> String(new Date(n.date).getFullYear())))).filter(y=>y!=='NaN').sort((a,b)=> b-a);
    $('#news-year').innerHTML = '<option value="">All years</option>' + years.map(y=>`<option value="${y}">${y}</option>`).join('');

    function draw(){
        const q = ($('#news-search').value||'').toLowerCase();
        const y = $('#news-year').value;
        list.innerHTML = items.filter(n=>{
            const okYear = !y || String(new Date(n.date).getFullYear())===y;
            const okQ = !q || (n.text||'').toLowerCase().includes(q);
            return okYear && okQ;
        }).map(n=>`
      <li class="card news-card">
        <div class="body">
          <div class="news-date">${fmtDate(n.date)}</div>
          <div class="news-text">${n.text}</div>
        </div>
      </li>
    `).join('');
    }
    $('#news-search').oninput = draw;
    $('#news-year').onchange = draw;
    draw();
}

/* -------------------- All People -------------------- */
function personCard(p){
    const tags = (Array.isArray(p.topics)?p.topics:String(p.topics||'').split(/[;,]/))
        .map(t=>t.trim()).filter(Boolean)
        .map(t=>`<span class="tag">${t}</span>`).join('');
    const personURL = `person.html?slug=${encodeURIComponent(p.slug)}`;
    const avatar = p.avatar
        ? `<a class="avatar-link" href="${personURL}" target="_blank" rel="noopener"><img class="avatar" src="${p.avatar}" alt="${p.name}" loading="lazy" data-fallback="avatar" /></a>`
        : `<a class="avatar-link" href="${personURL}" target="_blank" rel="noopener"><div class="avatar placeholder" role="img" aria-label="${p.name}"></div></a>`;

    const email = p.email ? `<a class="btn ghost" href="mailto:${p.email}">Email</a>` : '';
    const profile = `<a class="btn ghost" href="${personURL}" target="_blank" rel="noopener">Profile</a>`;

    return `
  <article class="card person-card" data-name="${p.name}" data-role="${p.role||''}" data-topics="${(p.topics||[]).join(' ')}" data-status="${p.status||''}">
    ${avatar}
    <div class="body">
      <div class="meta">${p.role||''}</div>
      <h3 style="margin:.2rem 0 .3rem">${p.name}</h3>
      <div class="meta">${p.affiliation||'—'}</div>
      <div class="tags">${tags}</div>
      <div class="actions-row">${email}${profile}</div>
    </div>
  </article>`;
}

async function initPeoplePage(){
    const {people} = await loadAll();
    const grid = $('#people-all-grid');

    const roles = Array.from(new Set(people.map(p=>p.role).filter(Boolean))).sort();
    $('#people-role').innerHTML = '<option value="">All roles</option>' + roles.map(r=>`<option>${r}</option>`).join('');

    function draw(){
        const q = ($('#people-all-search').value||'').toLowerCase();
        const role = $('#people-role').value;
        const status = $('#people-status').value;
        grid.innerHTML = people.filter(p=>{
            const okRole = !role || p.role===role;
            const okStatus = !status || p.status===status;
            const hay = (p.name+' '+(p.role||'')+' '+(p.topics||[]).join(' ')+' '+(p.affiliation||'')).toLowerCase();
            const okQ = !q || hay.includes(q);
            return okRole && okStatus && okQ;
        }).map(personCard).join('');
        applyImageFallbacks(grid);
    }
    $('#people-all-search').oninput = draw;
    $('#people-role').onchange = draw;
    $('#people-status').onchange = draw;
    draw();
}

/* -------------------- All Projects -------------------- */
function projectCard(p){
    const cover = p.cover
        ? `<img class="project-cover" src="${p.cover}" alt="${p.title}" loading="lazy" data-fallback="cover" />`
        : `<div class="project-cover placeholder" aria-hidden="true"></div>`;
    const chips = (Array.isArray(p.highlights)?p.highlights:String(p.highlights||'').split(/[;,]/))
        .map(h=>h.trim()).filter(Boolean)
        .map(h=>`<span class="tag">${h}</span>`).join('');
    const links = (p.links||[]).map(l=>`<a class="btn ghost" href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`).join('');
    const detailURL = `project.html?slug=${encodeURIComponent(p.slug)}`;
    return `
    <article class="card" data-area="${p.area||''}">
      <a href="${detailURL}" target="_blank" rel="noopener" aria-label="${p.title}">${cover}</a>
      <div class="body">
        <div class="meta">${p.area||''}</div>
        <h3 style="margin:.2rem 0 .3rem"><a href="${detailURL}" target="_blank" rel="noopener">${p.title}</a></h3>
        <p>${p.summary||''}</p>
        <div class="tags">${chips}</div>
        <div class="actions-row">${links}</div>
      </div>
    </article>`;
}

async function initProjectsPage(){
    const {projects} = await loadAll();
    const grid = $('#proj-all-grid');
    const areas = Array.from(new Set(projects.map(p=>p.area).filter(Boolean))).sort();
    $('#proj-all-area').innerHTML = '<option value="">All areas</option>' + areas.map(a=>`<option>${a}</option>`).join('');

    function draw(){
        const q = ($('#proj-all-search').value||'').toLowerCase();
        const a = $('#proj-all-area').value;
        grid.innerHTML = projects.filter(p=>{
            const okA = !a || p.area===a;
            const hay = (p.title+' '+(p.summary||'')+' '+(p.highlights||[]).join(' ')).toLowerCase();
            const okQ = !q || hay.includes(q);
            return okA && okQ;
        }).map(projectCard).join('');
        applyImageFallbacks(grid);
    }
    $('#proj-all-search').oninput = draw;
    $('#proj-all-area').onchange = draw;
    draw();
}

/* -------------------- All Publications -------------------- */
function pubHTML(p, idx){
    const authorsText = Array.isArray(p.authors) ? p.authors.join(', ')
        : (typeof p.authors === 'string' ? p.authors : '');
    const yearTag = p.year ? `<span class="tag">${p.year}</span>` : '';
    const ccf = p.ccf ? `· <span class="tag">${p.ccf}</span>` : '';
    const note = p.note ? `· <span class="tag">${p.note}</span>` : '';
    const abstract = p.abstract ? `<p class="pub-abstract">${p.abstract}</p>` : '';

    // PDF / Code 按钮始终出现（没值时 href 为空字符串）
    const btnPdf  = `<a class="btn" href="${p.pdf || ''}" target="_blank" rel="noopener">PDF</a>`;
    const btnCode = `<a class="btn ghost" href="${p.code || ''}" target="_blank" rel="noopener">Code</a>`;

    return `
  <div class="pub-item" data-year="${p.year||''}" data-type="${p.type||''}" data-hay="${(p.title+' '+authorsText+' '+(p.venue||'')+' '+(p.type||'')).toLowerCase()}">
    <div class="pub-mid">
      <div class="title">${p.title}</div>
      <div class="authors">${authorsText}</div>
      <div class="venue">${p.venue||''} · <span class="tag">${p.type||''}</span> · ${yearTag}${ccf}${note}</div>
      ${abstract}
      <pre class="bibtex" id="bib-${idx}" aria-hidden="true">${p.bibtex || ''}</pre>
    </div>
    <div class="pub-actions">
      ${btnPdf}${btnCode}
      <button class="btn ghost copy-bib" data-bib="${idx}">Copy BibTeX</button>
    </div>
  </div>`;
}


function wireCopyBib(root=document){
    $$('.copy-bib', root).forEach(btn=>{
        btn.addEventListener('click', async ()=>{
            const id = btn.getAttribute('data-bib');
            const el = document.getElementById('bib-'+id);
            const text = (el && el.textContent) ? el.textContent.trim() : '';
            try{
                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
                else {
                    const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select();
                    document.execCommand('copy'); document.body.removeChild(ta);
                }
                const old=btn.textContent; btn.textContent='Copied!'; setTimeout(()=>btn.textContent=old,1200);
            }catch(e){ console.error(e); }
        });
    });
}

async function initPublicationsPage(){
    // 使用 BibTeX 优先加载
    const publications = await loadPublicationsUnified();

    const list = $('#pub-all-list');
    const items = publications.slice().sort((a,b)=> (Number(b.year||0) - Number(a.year||0)) || String(a.title||'').localeCompare(String(b.title||'')));
    list.innerHTML = items.map(pubHTML).join('');
    wireCopyBib(list);

    const years = Array.from(new Set(publications.map(p=>p.year).filter(Boolean))).sort((a,b)=>b-a);
    $('#pub-all-year').innerHTML = '<option value="">All years</option>' + years.map(y=>`<option>${y}</option>`).join('');

    function draw(){
        const q = ($('#pub-all-search').value||'').toLowerCase();
        const y = $('#pub-all-year').value;
        const t = $('#pub-all-type').value;
        $$('#pub-all-list .pub-item').forEach(item=>{
            const byQ = item.dataset.hay.includes(q);
            const byY = !y || String(item.dataset.year)===y;
            const byT = !t || item.dataset.type===t;
            item.style.display = (byQ && byY && byT) ? '' : 'none';
        });
        const count = $$('#pub-all-list .pub-item').filter(x=>x.style.display!=='none').length;
        $('#pub-all-count').textContent = count;
    }
    $('#pub-all-search').oninput = draw;
    $('#pub-all-year').onchange = draw;
    $('#pub-all-type').onchange = draw;
    draw();

    $('#pub-export-bib').onclick = ()=>{
        const bibs = $$('#pub-all-list .pub-item').filter(x=>x.style.display!=='none')
            .map(x => x.querySelector('.bibtex')?.textContent?.trim() || '')
            .filter(Boolean).join('\n\n');
        const blob = new Blob([bibs], {type:'text/plain;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'roma-publications.bib'; a.click();
        URL.revokeObjectURL(url);
    };
}

/* -------------------- Life (gallery) -------------------- */

function wireLightbox(root){

    // 确保全局只存在一个 lightbox dialog
    let dialog = document.querySelector('dialog.lightbox');
    if (!dialog){
        dialog = document.createElement('dialog');
        dialog.className = 'lightbox';
        document.body.appendChild(dialog);

        // 点击背景关闭
        dialog.addEventListener('click', (e)=>{
            if (e.target === dialog) dialog.close();
        });

        // 点击图片也关闭
        dialog.addEventListener('click', (e)=>{
            if (e.target && e.target.tagName === 'IMG') dialog.close();
        });

        // ESC 键关闭
        document.addEventListener('keydown', (e)=>{
            if (e.key === 'Escape' && dialog.open) dialog.close();
        });

    }

    // 防止重复绑定事件
    // 给 root 元素添加标记，避免重复绑定
    if (root.hasAttribute('data-lightbox-bound')) {
        return; // 已经绑定过，直接返回
    }

    root.setAttribute('data-lightbox-bound', 'true');

    // 监听缩略图点击：填充大图并打开
    root.addEventListener('click', (e)=>{
        const img = e.target.closest('img');
        if (!img) return;

        const fullSrc = img.getAttribute('data-full') || img.getAttribute('src') || '';
        if (!fullSrc) return;

        const alt = img.getAttribute('alt') || '';
        dialog.innerHTML = `<img src="${fullSrc}" alt="${alt}">`;
        if (!dialog.open) dialog.showModal();
    });
}



async function initLifePage(){
    const {gallery} = await loadAll();
    const grid = $('#life-grid');

    const years = Array.from(new Set(gallery.map(g => (g.date ? new Date(g.date).getFullYear() : null)).filter(Boolean))).sort((a,b)=>b-a);
    $('#life-year').innerHTML = '<option value="">All years</option>' + years.map(y=>`<option value="${y}">${y}</option>`).join('');
    const tags = Array.from(new Set(gallery.flatMap(g => g.tags || []))).sort();
    $('#life-tag').innerHTML = '<option value="">All tags</option>' + tags.map(t=>`<option>${t}</option>`).join('');

    function draw(){
        const y = $('#life-year').value;
        const t = $('#life-tag').value;
        grid.innerHTML = gallery.filter(g=>{
            const gy = g.date ? String(new Date(g.date).getFullYear()) : '';
            const okY = !y || gy===y;
            const okT = !t || (g.tags||[]).includes(t);
            return okY && okT;
        }).map(g=>{
            const src = g.src || '';
            const title = g.title || '';
            const date = g.date ? `<div class="meta">${fmtDate(g.date)}</div>` : '';
            const img = src
                ? `<img class="project-cover" src="${src}" alt="${title}" loading="lazy" data-fallback="cover" />`
                : `<div class="project-cover placeholder" aria-hidden="true"></div>`;
            return `
        <article class="card">
          ${img}
          <div class="body">
            <div class="meta">${(g.tags||[]).map(x=>`<span class="tag">${x}</span>`).join(' ')}</div>
            <h3 style="margin:.2rem 0 .3rem" class="life-title">${title}</h3>
            ${date}
          </div>
        </article>`;
        }).join('');
        applyImageFallbacks(grid);
        // ← 移除这里的 wireLightbox(grid) 调用
    }

    $('#life-year').onchange = draw;
    $('#life-tag').onchange = draw;
    draw();

    // ← 只在这里调用一次
    wireLightbox(grid);
}

/* ============ Person detail ============ */
async function initPersonDetail(){
    const body = document.getElementById('person-detail-body');
    if (!body) return;

    const slug = getQueryParam('slug');
    const DATA = await loadDataForPages();
    const person = (DATA.people || []).find(p => (p.slug || slugify(p.name)) === slug);

    if (!person){
        body.innerHTML = `<div class="meta">Person not found.</div>`;
        return;
    }

    const avatarEl = person.avatar
        ? `<img class="avatar" src="${person.avatar}" alt="${person.name}" loading="lazy" />`
        : `<div class="avatar placeholder" role="img" aria-label="${person.name}"></div>`;

    const tags = (Array.isArray(person.topics)?person.topics:String(person.topics||'').split(/[;,]/))
        .map(t=>t.trim()).filter(Boolean)
        .map(t=>`<span class="tag">${t}</span>`).join('');
    const emailBtn = person.email ? `<a class="btn" href="mailto:${person.email}">Email</a>` : '';
    const siteBtn  = person.site  ? `<a class="btn ghost" href="${person.site}" target="_blank" rel="noopener">External Profile</a>` : '';

    body.innerHTML = `
    ${avatarEl}
    <div class="body">
      <div class="meta">${person.role || ''}</div>
      <h2 style="margin:.2rem 0 .3rem">${person.name}</h2>
      <div class="meta">Affiliation: ${person.affiliation || '—'}</div>
      <div class="tags" style="margin-top:8px">${tags}</div>
      <div class="actions-row" style="margin-top:10px">${emailBtn}${siteBtn}</div>

      ${renderPersonExtraBlocks(person)}
    </div>
  `;

    // ⬇️ 附加 Markdown （content/people/slug.md）
    const md = await fetchMarkdown(`../content/people/${slug}.md`);
    if (md){
        const html = renderMarkdown(md);
        const wrap = document.createElement('section');
        wrap.className = 'prose';
        wrap.innerHTML = `${html}`;
        body.appendChild(wrap);
    }
}

function renderPersonExtraBlocks(p){
    const edu = (p.education||[]).map(e=>`<li>${e}</li>`).join('');
    const awards = (p.awards||[]).map(a=>`<li>${a}</li>`).join('');
    const pubs = (p.selected_publications||[]).map(t=>`<li>${t}</li>`).join('');
    const placement = (p.placement||[]).map(e=>`<li>${e}</li>`).join('');

    return `
    ${edu ? `<h3>Education</h3><ul>${edu}</ul>` : ''}
    ${awards ? `<h3>Awards</h3><ul>${awards}</ul>` : ''}
    ${pubs ? `<h3>Selected Publications</h3><ul>${pubs}</ul>` : ''}
    ${placement ? `<h3>Working Experience</h3><ul>${placement}</ul>` : ''}
  `;
}

/* ============ Project detail ============ */
async function initProjectDetail(){
    const body = document.getElementById('proj-detail-body');
    if (!body) return;

    const slug = getQueryParam('slug');
    const DATA = await loadDataForPages();
    const project = (DATA.projects || []).find(p => (p.slug || slugify(p.title)) === slug);

    if (!project){
        body.innerHTML = `<div class="meta">Project not found.</div>`;
        return;
    }

    const cover = project.cover
        ? `<img class="project-cover" src="${project.cover}" alt="${project.title}" loading="lazy" />`
        : `<div class="project-cover placeholder" aria-hidden="true"></div>`;

    const chips = (Array.isArray(project.highlights)?project.highlights:String(project.highlights||'').split(/[;,]/))
        .map(h=>h.trim()).filter(Boolean)
        .map(h=>`<span class="tag">${h}</span>`).join('');
    const links = (project.links||[]).map(l=>`<a class="btn ghost" href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`).join('');

    body.innerHTML = `
    ${cover}
    <div class="body">
      <div class="meta">${project.area || ''}</div>
      <h2 style="margin:.2rem 0 .3rem">${project.title}</h2>
      <p>${project.summary || ''}</p>
      <div class="tags">${chips}</div>
      <div class="actions-row" style="margin-top:10px">${links}</div>
    </div>
  `;

    // ⬇️ 附加 Markdown （content/projects/slug.md）
    const md = await fetchMarkdown(`../content/projects/${slug}.md`);
    if (md){
        const html = renderMarkdown(md);
        const wrap = document.createElement('section');
        wrap.className = 'prose';
        wrap.innerHTML = `${html}`;
        body.appendChild(wrap);
    }
}

function renderProjectGallery(p){
    const imgs = (p.images || []).map(src => `
    <figure style="margin:.6em 0">
      <img class="project-cover" src="${src}" alt="" loading="lazy"/>
    </figure>
  `).join('');
    return imgs ? `<h3>Gallery</h3>${imgs}` : '';
}

/* -------------------- Entrypoint by data-page attr -------------------- */
document.addEventListener('DOMContentLoaded', ()=>{
    const page = document.body.dataset.page;

    // 轻量主题切换（独立页）
    const saved = localStorage.getItem('roma-theme');
    if (saved === 'light') document.body.classList.add('light');
    const t = document.getElementById('theme-toggle');
    if (t){
        t.addEventListener('click', ()=>{
            document.body.classList.toggle('light');
            localStorage.setItem('roma-theme', document.body.classList.contains('light') ? 'light' : 'dark');
        });
    }

    if (page === 'news')          initNewsPage();
    else if (page === 'people')   initPeoplePage();
    else if (page === 'projects') initProjectsPage();
    else if (page === 'pubs')     initPublicationsPage();
    else if (page === 'life')     initLifePage();
    else if (page === 'person')   initPersonDetail();
    else if (page === 'project')  initProjectDetail();
});

/* ---- Back-to-top injector for subpages (robust) ---- */
(function(){
    function inject(){
        // 避免重复
        if (document.getElementById('to-top')) return;

        // body 仍不存在的话再等等
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', inject, { once: true });
            return;
        }

        const btn = document.createElement('button');
        btn.id = 'to-top';
        btn.className = 'btn ghost hidden cta';
        btn.setAttribute('aria-label', 'Back to top');
        btn.title = 'Back to top';
        btn.textContent = '↑';
        document.body.appendChild(btn);

        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        function show(v){ btn.classList.toggle('hidden', !v); }
        function onScroll(){
            const y = window.scrollY || document.documentElement.scrollTop || 0;
            const threshold = (window.innerWidth >= 721) ? 900 : 600;
            // 若首页里的 drawerOpen 不存在，这里不会报错
            if (typeof window.drawerOpen !== 'undefined' && window.drawerOpen) return show(false);
            show(y > threshold);
        }

        btn.addEventListener('click', ()=>{
            window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
        });

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);

        // 初次计算（页面够长时，刷新后就能马上出现/隐藏）
        onScroll();

        // 可选：Shift+T 快捷键
        document.addEventListener('keydown', (e)=>{
            if (e.shiftKey && (e.key === 'T' || e.key === 't')) {
                window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
            }
        });
    }

    // 若脚本放在 <head> 且无 defer，确保等 DOM 就绪
    if (document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }
})();
