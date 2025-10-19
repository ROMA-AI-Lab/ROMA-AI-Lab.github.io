/* ROMA Lab — main client script (no deps) */

/* ----------------- Utilities ----------------- */
const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const slugify = (s='') =>
    (s||'').toString().trim().toLowerCase()
        .replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-');

/* ----------------- State ----------------- */
let DATA = null;
let stopNewsScroll = null;
let stopPeopleScroll = null;
let stopResearchScroll = null;
let stopPubScroll = null;

function smoothScrollTo(targetEl, duration=900, easingFn=(t)=>1-(1-t)**5 ){ // easeOutQuint
//
//     惯性效果想更明显，就把 duration 加到 1400–1600；
// 想要不同的缓动，可把 easing 换成：1-(1-t)**5  easeOutQuint
// t*t（easeInQuad）、
// t*(2-t)（easeOutQuad）、
// 或者 t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2（easeInOutCubic）。
    const start = window.scrollY || document.documentElement.scrollTop;
    const rect = targetEl.getBoundingClientRect();
    const headerOffset = 0; // 若有吸顶高度，可填入比如 64
    const to = rect.top + start - headerOffset;
    const startTime = performance.now();

    function step(now){
        const t = Math.min(1, (now - startTime) / duration);
        const eased = easingFn(t);
        window.scrollTo(0, start + (to - start) * eased);
        if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}


/* ----------------- Hash Router (only for # links) ----------------- */
function setActive(hash) {
    const id = (hash || '#home').replace('#','') || 'home';
    // 标记激活项（只针对 # 锚点链接）
    $$('a[data-link][href^="#"]').forEach(a => a.classList.toggle('active', a.getAttribute('href') === hash));
    const target = document.getElementById(id);
    // if (target && !prefersReduced) target.scrollIntoView({behavior:'smooth', block:'start'});
    if (target && !prefersReduced) smoothScrollTo(target, 100); // 1000ms 可自行调慢/调快
    history.replaceState(null, '', hash);
}
function wireHashRouter(){
    // 只注册 href 以 # 开头的锚点；不会拦截独立页链接
    $$('a[data-link][href^="#"]').forEach(a=>{
        a.addEventListener('click', (e)=>{
            e.preventDefault();
            setActive(a.getAttribute('href'));
            closeMobileMenu(); // 点击后收起移动端菜单
        });
    });
    window.addEventListener('hashchange', ()=> setActive(location.hash || '#home'));
}

/* ----------------- Theme toggle (persist) ----------------- */
function applySavedTheme(){
    const saved = localStorage.getItem('roma-theme');
    document.body.classList.toggle('light', saved === 'light');
}
function wireThemeToggle(){
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', ()=>{
        const toLight = !document.body.classList.contains('light');
        document.body.classList.toggle('light', toLight);
        localStorage.setItem('roma-theme', toLight ? 'light' : 'dark');
    });
}

/* ----------------- Footer year ----------------- */
function setYear(){ const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear(); }


// --- Body-level scroll lock helpers ---
let _savedScrollY = 0;
function lockBodyScroll() {
    const body = document.body;
    _savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    body.style.position = 'fixed';
    body.style.top = `-${_savedScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    // 可选：补偿桌面端滚动条宽度，避免布局抖动
    const sw = window.innerWidth - document.documentElement.clientWidth;
    if (sw > 0) body.style.paddingRight = sw + 'px';
}
function unlockBodyScroll() {
    const body = document.body;
    const y = _savedScrollY || 0;
    body.style.position = '';
    body.style.top = '';
    body.style.left = '';
    body.style.right = '';
    body.style.width = '';
    body.style.paddingRight = '';
    window.scrollTo(0, y);
}


/* ----------------- Mobile menu (drawer overlay) ----------------- */
let drawerOpen = false;
function openMobileMenu(){
    const drawer = $('#mobile-drawer');
    const overlay = $('#nav-overlay');
    const menuBtn = $('#menu');
    if (!drawer || !overlay) return;
    drawer.classList.add('show');
    overlay.classList.add('show');
    drawer.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true');

    lockBodyScroll();   // 打开时
    // unlockBodyScroll(); // 关闭时

    drawerOpen = true;
}

function closeMobileMenu(){
    const drawer = $('#mobile-drawer');
    const overlay = $('#nav-overlay');
    const menuBtn = $('#menu');
    if (!drawer || !overlay) return;
    drawer.classList.remove('show');
    overlay.classList.remove('show');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');

    // lockBodyScroll();   // 打开时
    unlockBodyScroll(); // 关闭时

    drawerOpen = false;
}

// function openMobileMenu(){
//     const drawer = $('#mobile-drawer');
//     const overlay = $('#nav-overlay');
//     if (!drawer || !overlay) return;
//     drawer.classList.add('show');
//     overlay.classList.add('show');
//     document.documentElement.style.overflow = 'hidden';
//     drawerOpen = true;
// }
// function closeMobileMenu(){
//     const drawer = $('#mobile-drawer');
//     const overlay = $('#nav-overlay');
//     if (!drawer || !overlay) return;
//     drawer.classList.remove('show');
//     overlay.classList.remove('show');
//     document.documentElement.style.overflow = '';
//     drawerOpen = false;
// }


function wireMobileMenu(){
    const menuBtn = document.getElementById('menu');
    const overlay = $('#nav-overlay');
    const drawer  = $('#mobile-drawer');

    if (menuBtn){
        menuBtn.addEventListener('click', ()=>{
            drawerOpen ? closeMobileMenu() : openMobileMenu();
        });
    }
    if (overlay){
        overlay.addEventListener('click', (e)=>{
            if (e.target === overlay) closeMobileMenu();
        });
    }
    document.addEventListener('keydown', (e)=>{
        if (e.key === 'Escape' && drawerOpen) closeMobileMenu();
    });

    // 只在切回桌面端时收起抽屉；隐藏/显示内联导航交给 CSS。
    function handleResize(){
        const isSmall = window.innerWidth < 720;
        if (!isSmall) closeMobileMenu();
    }
    window.addEventListener('resize', handleResize);
    handleResize();
}

// function wireMobileMenu(){
//     const menuBtn = document.getElementById('menu');
//     const overlay = $('#nav-overlay');
//     if (menuBtn){
//         menuBtn.addEventListener('click', ()=>{
//             drawerOpen ? closeMobileMenu() : openMobileMenu();
//         });
//     }
//     if (overlay){
//         overlay.addEventListener('click', (e)=>{
//             // 点击遮罩任意位置关闭
//             if (e.target === overlay) closeMobileMenu();
//         });
//     }
//     // Esc 关闭
//     document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && drawerOpen) closeMobileMenu(); });
//
//     // 小屏显示 menu 按钮；宽屏显示常规导航
//     function handleResize(){
//         const isSmall = window.innerWidth < 720;
//         const navInline = $('.nav-links-inline');
//         if (navInline) navInline.style.display = isSmall ? 'none' : '';
//         if (!isSmall) closeMobileMenu();
//     }
//     window.addEventListener('resize', handleResize);
//     handleResize();
// }

/* ----------------- Image fallback helper ----------------- */
function applyImageFallbacks(root=document){
    const imgs = root.querySelectorAll('img[data-fallback]');
    imgs.forEach(img=>{
        if (!img.getAttribute('src')) return replace(img);
        img.addEventListener('error', ()=> replace(img), {once:true});
    });
    function replace(img){
        const kind = img.dataset.fallback;
        let repl;
        if (kind === 'avatar'){
            repl = document.createElement('div');
            repl.className = 'avatar placeholder';
            repl.setAttribute('role','img');
            if (img.alt) repl.setAttribute('aria-label', img.alt);
        } else {
            repl = document.createElement('div');
            repl.className = 'project-cover placeholder';
            repl.setAttribute('aria-hidden','true');
        }
        img.replaceWith(repl);
    }
}

/* ----------------- Paged auto-scroll (shared) ----------------- */
function setupStepScroll(el, {
    axis='y', pause=2200, duration=600, selector=':scope > *', pauseOnHover=true
} = {}){
    if (!el || prefersReduced) return () => {};
    let timer = null;
    let dir = 1;

    function items() {
        return Array.from(el.querySelectorAll(selector)).filter(n => n.offsetParent !== null);
    }
    function atTop()  { return el[axis === 'y' ? 'scrollTop' : 'scrollLeft'] <= 0; }
    function atEnd()  {
        return axis === 'y'
            ? el.scrollTop + el.clientHeight >= el.scrollHeight - 1
            : el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    }
    function scrollToItem(i){
        const arr = items();
        if (!arr.length) return;
        const safe = Math.max(0, Math.min(i, arr.length - 1));
        const target = arr[safe];
        const offset = axis === 'y'
            ? target.offsetTop - el.offsetTop
            : target.offsetLeft - el.offsetLeft;
        const pos = axis === 'y'
            ? { top: offset, behavior: 'smooth' }
            : { left: offset, behavior: 'smooth' };
        el.scrollTo(pos);
    }
    function schedule(){
        clearTimeout(timer);
        timer = setTimeout(step, pause + duration);
    }
    function closestIndex(){
        const arr = items();
        if (!arr.length) return 0;
        const cur = axis === 'y' ? el.scrollTop : el.scrollLeft;
        let best = 0, bestDist = Infinity;
        arr.forEach((node, i) => {
            const pos = axis === 'y' ? (node.offsetTop - el.offsetTop) : (node.offsetLeft - el.offsetLeft);
            const d = Math.abs(pos - cur);
            if (d < bestDist){ bestDist = d; best = i; }
        });
        return best;
    }
    function step(){
        const arr = items();
        if (arr.length <= 1) return;

        if (atEnd()) dir = -1;
        if (atTop()) dir = 1;

        const currentIndex = closestIndex();
        const nextIndex = currentIndex + dir;

        if (nextIndex >= arr.length) { dir = -1; scrollToItem(arr.length - 2 >= 0 ? arr.length - 2 : 0); }
        else if (nextIndex < 0)      { dir = 1;  scrollToItem(1 < arr.length ? 1 : 0); }
        else                         { scrollToItem(nextIndex); }

        schedule();
    }

    const stop = () => { clearTimeout(timer); timer = null; };
    const resume = () => { if (!timer) schedule(); };

    if (pauseOnHover){
        el.addEventListener('mouseenter', stop);
        el.addEventListener('mouseleave', resume);
    }
    el.addEventListener('wheel', stop, {passive:true});
    el.addEventListener('touchstart', stop, {passive:true});
    el.addEventListener('keydown', stop);

    scrollToItem(0);
    schedule();
    return stop;
}

/* -------------------- BibTeX 支持：加载 + 解析 -------------------- */

async function loadPublicationsUnified(){
    // 允许 settings.json 指定路径
    let settings = {};
    try{
        const r = await fetch('data/settings.json', {cache:'no-store'});
        if (r.ok) settings = await r.json();
    }catch{}

    const bibPath = settings.publications_bib || 'data/publications.bib';

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
        const r = await fetch('data/publications.json', {cache:'no-store'});
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


/**
 * 支持  value = { ...可嵌套花括号... }  或 value = " ... "
 * 简单状态机解析 key = value, key = value, ...
 */
function parseBibFields(body){
    const out = {};
    let i = 0, k = '', v = '', mode = 'key', quote = false, depth = 0;

    function commit(){
        if (!k) return;
        out[k.trim().toLowerCase()] = (v || '').trim().replace(/,$/,'');
        k = ''; v = ''; mode = 'key'; quote = false; depth = 0;
    }

    while (i < body.length){
        const ch = body[i];

        if (mode === 'key'){
            if (ch === '='){ mode = 'preval'; }
            else if (ch === '}' ){ break; }            // 条目结束
            else { k += ch; }
        }
        else if (mode === 'preval'){
            if (ch === '{'){ mode = 'brace'; depth = 1; v = ''; }
            else if (ch === '"'){ mode = 'quote'; quote = true; v=''; }
            else if (/\S/.test(ch)){ // 非空白，容忍裸值
                mode = 'bare'; v = ch;
            }
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
    return Object.fromEntries(Object.entries(out).map(([kk,vv])=>[kk.trim(), stripBraces(vv.trim())]));
}

// 去除最外层一对大括号（若存在）
function stripBraces(s){
    if (s.startsWith('{') && s.endsWith('}')) return s.slice(1, -1);
    return s;
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
        bibtex: rebuildBibtex(typeRaw, key, f)
    };
}

function rebuildBibtex(typeRaw, key, f){
    const lines = Object.entries(f).map(([k,v])=>`  ${k} = {${v}}`);
    return `@${typeRaw}{${key},\n${lines.join(',\n')}\n}`;
}



/* ----------------- DATA LOADING ----------------- */
async function loadData(){
    try{
        // 新结构：拆分后的 JSON；兼容老数据（如果文件不存在则退回 lab-data.json）
        const load = async (path) => {
            try{ const r = await fetch(path, {cache:'no-store'}); if (!r.ok) throw 0; return await r.json(); }
            catch{ return null; }
        };
        const settings = await load('data/settings.json');
        const news      = await load('data/news.json');
        const people    = await load('data/people.json');
        const projects  = await load('data/projects.json');
        const pubs      = await load('data/publications.json');
        const gallery   = await load('data/gallery.json');

        if (news || people || projects || pubs){
            return {
                news_visible: settings?.newsVisible ?? 3,
                news_cutoff: settings?.newsCutoff ?? null,
                manual_url:  settings?.manual_url ?? 'manual/manual_index.html',
                news: Array.isArray(news) ? news : (news?.items ?? []),
                people: (Array.isArray(people) ? people : (people?.items ?? [])).map(p=>({...p, slug: p.slug || slugify(p.name)})),
                projects: (Array.isArray(projects) ? projects : (projects?.items ?? [])).map(p=>({...p, slug: p.slug || slugify(p.title)})),
                publications: Array.isArray(pubs) ? pubs : (pubs?.items ?? []),
                gallery: Array.isArray(gallery) ? gallery : (gallery?.items ?? [])
            };
        }

        // 兼容旧版 lab-data.json
        const res = await fetch('data/lab-data.json', {cache:'no-store'});
        const legacy = await res.json();
        legacy.people = (legacy.people||[]).map(p=>({...p, slug: slugify(p.name)}));
        legacy.projects = (legacy.projects||[]).map(p=>({...p, slug: slugify(p.title)}));
        return legacy;
    }catch(e){
        console.error('Failed to load data:', e);
        return {news_visible:3, news:[],people:[],projects:[],publications:[],manual_url:'manual/manual_index.html', gallery:[]};
    }
}

/* ----------------- HOME RENDERERS ----------------- */
// Metrics
function renderMetrics(){
    $('#metric-pubs').innerHTML     = (DATA.publications?.length ?? 0) + "<sub>total</sub>";
    $('#metric-projects').innerHTML = (DATA.projects?.length ?? 0) + "<sub>active</sub>";
    $('#metric-members').innerHTML  = (DATA.people?.length ?? 0) + "<sub>people</sub>";
}

// News (with cutoff + visible count)
function renderHomeNews(){
    const list = $('#news-list'); if (!list) return;
    list.innerHTML = '';
    const cutoff = DATA.news_cutoff ? new Date(DATA.news_cutoff) : null;
    const items = (DATA.news||[])
        .filter(n => cutoff ? new Date(n.date) >= cutoff : true)
        .slice().sort((a,b)=> (b.date||'').localeCompare(a.date||''));

    items.forEach(n=>{
        const li = document.createElement('li');
        li.className = 'card news-card';
        li.innerHTML = `
      <div class="body">
        <div class="news-date">${new Date(n.date).toLocaleDateString()}</div>
        <div class="news-text">${n.text}</div>
      </div>`;
        list.appendChild(li);
    });

    const visible = Number(DATA.news_visible ?? 3);
    setNewsVisibleCount(list, visible);

    if (stopNewsScroll) stopNewsScroll();
    stopNewsScroll = setupStepScroll(list, {axis:'y', pause:2200, duration:600});
}
function setNewsVisibleCount(listEl, n){
    function computeAndApply(){
        const first = listEl.firstElementChild;
        if (!first) return;
        const rect = first.getBoundingClientRect();
        const itemH = rect.height;
        const styles = getComputedStyle(listEl);
        const gap = parseFloat(styles.rowGap || styles.gap || '10');
        const target = (itemH * n) + (gap * (n - 1));
        listEl.style.maxHeight = `${target}px`;
        listEl.style.overflow = 'auto';
    }
    computeAndApply();
    let ro;
    if ('ResizeObserver' in window){
        ro = new ResizeObserver(() => computeAndApply());
        ro.observe(listEl);
    }
    window.addEventListener('resize', computeAndApply);
}

// People (home)
function personCardHome(p){
    const tags = (p.topics||[]).map(t=>`<span class="tag">${t}</span>`).join('');
    const personURL = `pages/person.html?slug=${encodeURIComponent(p.slug||slugify(p.name))}`;

    const avatarNode = p.avatar
        ? `<a class="avatar-link" href="${personURL}" target="_blank" rel="noopener">
         <img class="avatar" src="${p.avatar}" alt="${p.name}" loading="lazy" data-fallback="avatar" />
       </a>`
        : `<a class="avatar-link" href="${personURL}" target="_blank" rel="noopener">
         <div class="avatar placeholder" role="img" aria-label="${p.name}"></div>
       </a>`;

    const emailBtn   = p.email ? `<a class="btn ghost" href="mailto:${p.email}">Email</a>` : '';
    const profileBtn = `<a class="btn ghost" href="${personURL}" target="_blank" rel="noopener">Profile</a>`;

    return `
  <article class="card" data-name="${p.name}" data-role="${p.role||''}" data-topics="${(p.topics||[]).join(' ')}">
    ${avatarNode}
    <div class="body">
      <div class="meta">${p.role||''}</div>
      <h3 style="margin:.2rem 0 .3rem">${p.name}</h3>
      <div class="meta">${p.affiliation||'—'}</div>
      <div class="tags">${tags}</div>
      <div class="actions-row">${emailBtn}${profileBtn}</div>
    </div>
  </article>`;
}
function renderPeople(){
    const grid = $('#people-grid'); if (!grid) return;
    // 这里仍展示全量；如需仅 featured，可在数据中加 featured 标记并在此过滤
    grid.innerHTML = (DATA.people||[]).map(personCardHome).join('');
    applyImageFallbacks(grid);

    if (stopPeopleScroll) stopPeopleScroll();
    stopPeopleScroll = setupStepScroll(grid, {axis:'y', pause:2400, duration:650, selector:':scope > .card'});
}
$('#people-search')?.addEventListener('input', (e)=>{
    const q = e.target.value.toLowerCase();
    $$('#people-grid .card').forEach(card=>{
        const hay = (card.dataset.name + ' ' + card.dataset.role + ' ' + card.dataset.topics).toLowerCase();
        card.style.display = hay.includes(q) ? '' : 'none';
    });
});

// Research (home)
function projectCardHome(p){
    const detailURL = `pages/project.html?slug=${encodeURIComponent(p.slug||slugify(p.title))}`;
    const cover = p.cover
        ? `<a href="${detailURL}" target="_blank" rel="noopener" aria-label="${p.title}">
         <img class="project-cover" src="${p.cover}" alt="${p.title}" loading="lazy" data-fallback="cover"/>
       </a>`
        : `<a href="${detailURL}" target="_blank" rel="noopener" aria-label="${p.title}">
         <div class="project-cover placeholder" aria-hidden="true"></div>
       </a>`;
    const chips = (p.highlights||[]).map(h=>`<span class="tag">${h}</span>`).join('');
    const links = (p.links||[]).map(l=>`<a class="btn ghost" href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`).join('');
    return `
  <article class="card" data-area="${p.area||''}">
    ${cover}
    <div class="body">
      <div class="meta">${p.area||''}</div>
      <h3 style="margin:.2rem 0 .3rem"><a href="${detailURL}" target="_blank" rel="noopener">${p.title}</a></h3>
      <p>${p.summary||''}</p>
      <div class="tags">${chips}</div>
      <div class="actions-row">${links}</div>
    </div>
  </article>`;
}
function renderResearch(){
    const grid = $('#research-grid'); if (!grid) return;
    grid.innerHTML = (DATA.projects||[]).map(projectCardHome).join('');
    applyImageFallbacks(grid);

    if (stopResearchScroll) stopResearchScroll();
    stopResearchScroll = setupStepScroll(grid, {axis:'y', pause:2400, duration:650, selector:':scope > .card'});
}
$('#research-area-filter')?.addEventListener('change', (e)=>{
    const v = e.target.value;
    $$('#research-grid .card').forEach(c=>{
        c.style.display = !v || c.dataset.area === v ? '' : 'none';
    });
});

// Publications (home) — 取消缩略图，一律不用图片
function pubHTML(p, idx){
    const authors = (p.authors||[]).join(', ');
    const btnPdf  = p.pdf  ? `<a class="btn" href="${p.pdf}" target="_blank" rel="noopener">PDF</a>` : '';
    const btnCode = p.code ? `<a class="btn ghost" href="${p.code}" target="_blank" rel="noopener">Code</a>` : '';
    const abstract = p.abstract ? `<p class="pub-abstract">${p.abstract}</p>` : '';
    return `
  <div class="pub-item" data-year="${p.year||''}" data-type="${p.type||''}" data-hay="${(p.title+' '+authors+' '+(p.venue||'')+' '+(p.type||'')).toLowerCase()}">
    <div class="pub-mid">
      <div class="title">${p.title}</div>
      <div class="authors">${authors}</div>
      <div class="venue">${p.venue||''} · <span class="tag">${p.type||''}</span> · <span class="tag">${p.year||''}</span></div>
      ${abstract}
      <pre class="bibtex" id="bib-${idx}" aria-hidden="true">${p.bibtex || ''}</pre>
    </div>
    <div class="pub-actions">
      ${btnPdf}${btnCode}
      <button class="btn ghost copy-bib" data-bib="${idx}">BibTeX</button>
    </div>
  </div>`;
}

function renderPubs(){
    const list = $('#pub-list');
    if (!list) return;

    const all = (DATA.publications || []).slice();

    const isFeatured = p => (p && (
        p.featured === true ||
        p.featured === 1 ||
        (typeof p.featured === 'string' && /^y(es)?|true|1$/i.test(p.featured))
    ));

    // 只取 featured（没有就显示空——你要改成回退显示全部也很容易）
    const src = all.filter(isFeatured)
        .sort((a,b)=> (Number(b.year||0) - Number(a.year||0)) || String(a.title||'').localeCompare(String(b.title||'')));

    list.innerHTML = src.map((p, idx)=>{
        const authorsText = Array.isArray(p.authors) ? p.authors.join(', ')
            : (typeof p.authors === 'string' ? p.authors : '');
        const yearTag = p.year ? `<span class="tag">${p.year}</span>` : '';
        const abstract = p.abstract ? `<p class="pub-abstract">${p.abstract}</p>` : '';

        // 注意：PDF / Code 始终渲染按钮，即便 href 为空字符串
        const btnPdf  = `<a class="btn" href="${p.pdf || ''}" target="_blank" rel="noopener">PDF</a>`;
        const btnCode = `<a class="btn ghost" href="${p.code || ''}" target="_blank" rel="noopener">Code</a>`;

        return `
      <div class="pub-item" data-year="${p.year||''}" data-type="${p.type||''}" data-hay="${(p.title+' '+authorsText+' '+(p.venue||'')+' '+(p.type||'')).toLowerCase()}">
        <div class="pub-mid">
          <div class="title">${p.title}</div>
          <div class="authors">${authorsText}</div>
          <div class="venue">${p.venue||''} · <span class="tag">${p.type||''}</span> · ${yearTag}</div>
          ${abstract}
          <pre class="bibtex" id="bib-${idx}" aria-hidden="true">${p.bibtex || ''}</pre>
        </div>
        <div class="pub-actions">
          ${btnPdf}${btnCode}
          <button class="btn ghost copy-bib" data-bib="${idx}">Copy BibTeX</button>
        </div>
      </div>`;
    }).join('');

    // 复制 BibTeX
    $$('.copy-bib', list).forEach(btn=>{
        btn.addEventListener('click', async ()=>{
            const id = btn.getAttribute('data-bib');
            const el = document.getElementById('bib-'+id);
            const text = (el && el.textContent) ? el.textContent.trim() : '';
            try{
                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
                else { const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
                const old=btn.textContent; btn.textContent='Copied!'; setTimeout(()=>btn.textContent=old,1200);
            }catch(e){ console.error(e); }
        });
    });

    if (stopPubScroll) stopPubScroll();
    stopPubScroll = setupStepScroll(list, {axis:'y', pause:2400, duration:650, selector:':scope > .pub-item'});
}





// function renderPubs(){
//     const list = $('#pub-list');
//     if (!list) return;
//
//     // 1) 数据源：优先展示 featured；若没有任何 featured，则降级为全部
//     const all = (DATA.publications || []).slice();
//     const featuredOnly = all.filter(p => p.featured === true || p.featured === 'true' || p.featured === 1 || /^y(es)?$/i.test(String(p.featured||'')));
//     const src = (featuredOnly.length ? featuredOnly : all)
//         .slice()
//         .sort((a,b)=> (Number(b.year||0) - Number(a.year||0)) || String(a.title||'').localeCompare(String(b.title||'')));
//
//     // 2) 渲染
//     list.innerHTML = src.map(pubHTML).join('');
//
//     // 如果你在 pubHTML 里仍然渲染了缩略图，可保留这行占位回退；否则无妨
//     if (typeof applyImageFallbacks === 'function') applyImageFallbacks(list);
//
//     // 3) 复制 BibTeX
//     $$('.copy-bib').forEach(btn=>{
//         btn.addEventListener('click', async ()=>{
//             const id = btn.getAttribute('data-bib');
//             const box = document.getElementById('bib-'+id);
//             const text = (box && box.textContent) ? box.textContent.trim() : '';
//             try{
//                 if (navigator.clipboard?.writeText) {
//                     await navigator.clipboard.writeText(text);
//                 } else {
//                     const ta = document.createElement('textarea');
//                     ta.value = text; document.body.appendChild(ta); ta.select();
//                     document.execCommand('copy'); document.body.removeChild(ta);
//                 }
//                 const old = btn.textContent;
//                 btn.textContent = 'Copied!';
//                 setTimeout(()=> btn.textContent = old, 1200);
//             }catch(e){ console.error('Clipboard failed', e); }
//         });
//     });
//
//     // 4) 自动步进滚动（仅针对可见项）
//     if (stopPubScroll) stopPubScroll();
//     stopPubScroll = setupStepScroll(list, {axis:'y', pause:2400, duration:650, selector:':scope > .pub-item'});
// }

// function renderPubs(){
//     const list = $('#pub-list');
//     if (!list) return;
//     list.innerHTML = (DATA.publications||[])
//         .slice().sort((a,b)=> (b.year - a.year) || a.title.localeCompare(b.title))
//         .map(pubHTML).join('');
//
//     // 复制 BibTeX
//     $$('.copy-bib').forEach(btn=>{
//         btn.addEventListener('click', async ()=>{
//             const id = btn.getAttribute('data-bib');
//             const box = document.getElementById('bib-'+id);
//             const text = (box && box.textContent) ? box.textContent.trim() : '';
//             try{
//                 if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
//                 else {
//                     const ta = document.createElement('textarea');
//                     ta.value = text; document.body.appendChild(ta); ta.select();
//                     document.execCommand('copy'); document.body.removeChild(ta);
//                 }
//                 const old = btn.textContent; btn.textContent = 'Copied!'; setTimeout(()=> btn.textContent = old, 1200);
//             }catch(e){ console.error('Clipboard failed', e); }
//         });
//     });
//
//     if (stopPubScroll) stopPubScroll();
//     stopPubScroll = setupStepScroll(list, {axis:'y', pause:2400, duration:650, selector:':scope > .pub-item'});
// }
function updatePubCount(){
    const visible = [...document.querySelectorAll('#pub-list .pub-item')].filter(x=>x.style.display !== 'none').length;
    const el = $('#pub-count'); if (el) el.textContent = visible;
}
function yearOptions(){
    const years = Array.from(new Set((DATA.publications||[]).map(p=>p.year))).sort((a,b)=>b-a);
    const sel = $('#pub-year'); if (!sel) return;
    years.forEach(y=>{ const o=document.createElement('option'); o.value=y; o.textContent=y; sel.appendChild(o); });
}
function filterPubs(){
    const q = $('#pub-search')?.value?.toLowerCase() || '';
    const year = $('#pub-year')?.value || '';
    const type = $('#pub-type')?.value || '';
    $$('#pub-list .pub-item').forEach(item=>{
        const byQ = item.dataset.hay.includes(q);
        const byY = !year || String(item.dataset.year) === year;
        const byT = !type || item.dataset.type === type;
        item.style.display = (byQ && byY && byT) ? '' : 'none';
    });
    updatePubCount();
}
$('#pub-search')?.addEventListener('input', filterPubs);
$('#pub-year')?.addEventListener('change', filterPubs);
$('#pub-type')?.addEventListener('change', filterPubs);

/* ----------------- Manual link ----------------- */
function wireManualLink(){
    const manualURL = DATA.manual_url || 'manual/manual_index.html';
    const navManual = $('#nav-manual');
    if (navManual) {
        navManual.addEventListener('click', (e) => {
            e.preventDefault();
            window.open(manualURL, '_blank', 'noopener');
        });
    }
    const manualCta = $('#manual-cta');
    if (manualCta) {
        manualCta.href = manualURL;
        manualCta.target = '_blank';
        manualCta.rel = 'noopener';
    }
    const call2students = $('#call2students');
    if (call2students) {
        call2students.href = manualURL;
        call2students.target = '_blank';
        call2students.rel = 'noopener';
    }
}

/* ---------- LIFE (Home preview) ---------- */
function renderLifeHome(limit=6){
    const grid = document.getElementById('life-home-grid');
    if (!grid) return;
    const items = (DATA.gallery || []).slice(0, limit);
    if (!items.length){
        grid.innerHTML = `<div class="meta">No photos yet.</div>`;
        return;
    }
    grid.classList.add('research'); // 用相同栅格
    grid.innerHTML = items.map(it => `
    <a class="card" href="pages/life.html" target="_blank" rel="noopener" title="${it.title || ''}">
      <img class="project-cover" src="${it.src}" alt="${it.title || ''}" loading="lazy" />
      <div class="body">
        <div class="meta">${it.date || ''}</div>
        <h3 style="margin:.2rem 0 .3rem">${it.title || ''}</h3>
        <div class="tags">${(it.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('')}</div>
      </div>
    </a>
  `).join('');
}


/* ----------------- INIT ----------------- */

async function init(){
    applySavedTheme();
    setYear();

    // 1) 先加载基础数据（people / projects / news / 等）
    DATA = await loadData();

    // 2) 尝试用 BibTeX 覆盖 publications（失败则保持原有 JSON / lab-data）
    try{
        const pubs = await loadPublicationsUnified(); // 优先 data/publications.bib → publications.json → lab-data.json
        if (Array.isArray(pubs) && pubs.length){
            DATA.publications = pubs;
        }
    }catch(err){
        console.error('[init] loadPublicationsUnified failed:', err);
    }

    wireManualLink();

    // 3) 首屏渲染（注意顺序：yearOptions/renderPubs 依赖 DATA.publications）
    renderMetrics();
    renderHomeNews();
    renderPeople();
    renderResearch();
    yearOptions();     // ← 基于 DATA.publications 生成年份下拉
    renderPubs();      // ← 若首页只想展示精选，请在该函数内对 featured 过滤
    renderLifeHome();
    updatePubCount();

    // 4) 交互/路由
    wireHashRouter();
    wireThemeToggle();
    wireMobileMenu();

    // 5) 启动时滚动到 hash 对应区块（带平滑滚动版本的话也可保持不变）
    setActive(location.hash || '#home');
}


// async function init(){
//     applySavedTheme();
//     setYear();
//
//     DATA = await loadData();
//     wireManualLink();
//
//     renderMetrics();
//     renderHomeNews();
//     renderPeople();
//     renderResearch();
//     yearOptions();
//     renderPubs();
//     renderLifeHome();
//     updatePubCount();
//
//     wireHashRouter();
//     wireThemeToggle();
//     wireMobileMenu();
//
//     // 启动时滚动到 hash 对应区块
//     setActive(location.hash || '#home');
// }

document.addEventListener('DOMContentLoaded', init);

/* ---- helpers for news height ---- */
