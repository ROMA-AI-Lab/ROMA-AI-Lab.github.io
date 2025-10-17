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

/* ----------------- Mobile menu (drawer overlay) ----------------- */
let drawerOpen = false;
function openMobileMenu(){
    const drawer = $('#mobile-drawer');
    const overlay = $('#nav-overlay');
    if (!drawer || !overlay) return;
    drawer.classList.add('show');
    overlay.classList.add('show');
    document.documentElement.style.overflow = 'hidden';
    drawerOpen = true;
}
function closeMobileMenu(){
    const drawer = $('#mobile-drawer');
    const overlay = $('#nav-overlay');
    if (!drawer || !overlay) return;
    drawer.classList.remove('show');
    overlay.classList.remove('show');
    document.documentElement.style.overflow = '';
    drawerOpen = false;
}
function wireMobileMenu(){
    const menuBtn = document.getElementById('menu');
    const overlay = $('#nav-overlay');
    if (menuBtn){
        menuBtn.addEventListener('click', ()=>{
            drawerOpen ? closeMobileMenu() : openMobileMenu();
        });
    }
    if (overlay){
        overlay.addEventListener('click', (e)=>{
            // 点击遮罩任意位置关闭
            if (e.target === overlay) closeMobileMenu();
        });
    }
    // Esc 关闭
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && drawerOpen) closeMobileMenu(); });

    // 小屏显示 menu 按钮；宽屏显示常规导航
    function handleResize(){
        const isSmall = window.innerWidth < 720;
        const navInline = $('.nav-links-inline');
        if (navInline) navInline.style.display = isSmall ? 'none' : '';
        if (!isSmall) closeMobileMenu();
    }
    window.addEventListener('resize', handleResize);
    handleResize();
}

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
      <div class="meta">Affiliation: ${p.affiliation||'—'}</div>
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
      <button class="btn ghost copy-bib" data-bib="${idx}">Copy BibTeX</button>
    </div>
  </div>`;
}
function renderPubs(){
    const list = $('#pub-list'); if (!list) return;
    list.innerHTML = (DATA.publications||[])
        .slice().sort((a,b)=> (b.year - a.year) || a.title.localeCompare(b.title))
        .map(pubHTML).join('');

    // 复制 BibTeX
    $$('.copy-bib').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
            const id = btn.getAttribute('data-bib');
            const box = document.getElementById('bib-'+id);
            const text = (box && box.textContent) ? box.textContent.trim() : '';
            try{
                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
                else {
                    const ta = document.createElement('textarea');
                    ta.value = text; document.body.appendChild(ta); ta.select();
                    document.execCommand('copy'); document.body.removeChild(ta);
                }
                const old = btn.textContent; btn.textContent = 'Copied!'; setTimeout(()=> btn.textContent = old, 1200);
            }catch(e){ console.error('Clipboard failed', e); }
        });
    });

    if (stopPubScroll) stopPubScroll();
    stopPubScroll = setupStepScroll(list, {axis:'y', pause:2400, duration:650, selector:':scope > .pub-item'});
}
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

    DATA = await loadData();
    wireManualLink();

    renderMetrics();
    renderHomeNews();
    renderPeople();
    renderResearch();
    yearOptions();
    renderPubs();
    renderLifeHome();
    updatePubCount();

    wireHashRouter();
    wireThemeToggle();
    wireMobileMenu();

    // 启动时滚动到 hash 对应区块
    setActive(location.hash || '#home');
}

document.addEventListener('DOMContentLoaded', init);

/* ---- helpers for news height ---- */
