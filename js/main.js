/* ROMA Lab — main client script (no deps) */

/* Motion preference */
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Routing (hash-based SPA for in-page sections) */
const links = document.querySelectorAll('[data-link]');
function setActive(hash) {
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === hash));
    const id = (hash || '#home').replace('#','') || 'home';
    const target = document.getElementById(id);
    if (target && !prefersReduced) target.scrollIntoView({behavior:'smooth', block:'start'});
    history.replaceState(null, '', hash);
}
links.forEach(a => a.addEventListener('click', () => setActive(a.getAttribute('href'))));

/* Theme toggle (persist) */
const savedTheme = localStorage.getItem('roma-theme');
if (savedTheme === 'light') document.body.classList.add('light');
document.getElementById('theme-toggle').addEventListener('click', ()=>{
    document.body.classList.toggle('light');
    localStorage.setItem('roma-theme', document.body.classList.contains('light') ? 'light':'dark');
});

/* Footer year */
document.getElementById('year').textContent = new Date().getFullYear();

/* Mobile menu */
function handleResize(){
    const menuBtn = document.getElementById('menu');
    if (window.innerWidth < 720) { menuBtn.style.display='inline-flex'; }
    else { menuBtn.style.display='none'; document.querySelector('.nav-links').style.display=''; }
}
window.addEventListener('resize', handleResize);
handleResize();
document.getElementById('menu').addEventListener('click', ()=>{
    const nav = document.querySelector('.nav-links');
    nav.style.display = (nav.style.display==='none' || !nav.style.display) ? 'flex' : 'none';
});

/* ---------- Image fallback helper ---------- */
/**
 * Replaces broken <img> with a glass–matte placeholder of the same footprint.
 * Mark images with data-fallback="avatar" or data-fallback="thumb".
 */
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
            repl.className = 'pub-thumb placeholder';
            repl.setAttribute('aria-hidden','true');
        }
        img.replaceWith(repl);
    }
}

/* ---------- Paged auto-scroll (item-by-item with pause) ---------- */
function setupStepScroll(el, {
    axis='y',
    pause=2200,
    duration=600,
    selector=':scope > *',
    pauseOnHover=true
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

/* Keep handles so we can refresh scrollers after filters/search */
let stopNewsScroll = null;
let stopPeopleScroll = null;
let stopResearchScroll = null;
let stopPubScroll = null;

/* Global data object */
let DATA = null;

/* ---------- HOME (News: vertical, paged, with visible-count cap) ---------- */
function renderHome(){
    // metrics
    document.getElementById('metric-pubs').innerHTML = DATA.publications.length + "<sub>total</sub>";
    document.getElementById('metric-projects').innerHTML = DATA.projects.length + "<sub>active</sub>";
    document.getElementById('metric-members').innerHTML = DATA.people.length + "<sub>people</sub>";

    // news vertical list
    const newsEl = document.getElementById('news-list');
    newsEl.innerHTML = '';
    DATA.news
        .slice().sort((a,b)=> (b.date||'').localeCompare(a.date||''))
        .forEach(n=>{
            const li = document.createElement('li');
            li.className = 'card news-card';
            li.innerHTML = `
        <div class="body">
          <div class="news-date">${new Date(n.date).toLocaleDateString()}</div>
          <div class="news-text">${n.text}</div>
        </div>`;
            newsEl.appendChild(li);
        });

    // ---- NEW: cap visible height to exactly N items (Option A)
    const VISIBLE = Number(DATA.news_visible ?? 3);
    setNewsVisibleCount(newsEl, VISIBLE);

    if (stopNewsScroll) stopNewsScroll();
    stopNewsScroll = setupStepScroll(newsEl, {axis:'y', pause:2200, duration:600});
}

/**
 * Fits the list's max-height to exactly N visible items (includes row gap).
 * Recomputes on window resize (fonts may change height).
 */
function setNewsVisibleCount(listEl, n){
    function computeAndApply(){
        const first = listEl.firstElementChild;
        if (!first) return;
        const rect = first.getBoundingClientRect();
        const itemH = rect.height;
        const styles = getComputedStyle(listEl);
        // Grid gap reading: support rowGap or fallback to gap/10px default
        const gap = parseFloat(styles.rowGap || styles.gap || '10');
        const target = (itemH * n) + (gap * (n - 1));
        listEl.style.maxHeight = `${target}px`;
        listEl.style.overflow = 'auto';
    }
    computeAndApply();
    // Re-run on resize to keep alignment crisp
    let ro;
    if ('ResizeObserver' in window){
        ro = new ResizeObserver(() => computeAndApply());
        ro.observe(listEl);
    }
    window.addEventListener('resize', computeAndApply);
}

/* ---------- PEOPLE (vertical, paged, with avatar fallback) ---------- */
function personCard(p){
    const tags = (p.topics||[]).map(t=>`<span class="tag">${t}</span>`).join('');
    const site = p.site ? `<a class="btn ghost" href="${p.site}" target="_blank" rel="noopener">Profile</a>` : '';
    const email = p.email ? `<a class="btn ghost" href="mailto:${p.email}">Email</a>` : '';

    const avatarNode = p.avatar
        ? `<img class="avatar" src="${p.avatar}" alt="${p.name}" loading="lazy" data-fallback="avatar" />`
        : `<div class="avatar placeholder" role="img" aria-label="${p.name}"></div>`;

    return `
  <article class="card" data-name="${p.name}" data-role="${p.role}" data-topics="${(p.topics||[]).join(' ')}">
    ${avatarNode}
    <div class="body">
      <div class="meta">${p.role}</div>
      <h3 style="margin:.2rem 0 .3rem">${p.name}</h3>
      <div class="meta">Affiliation: ${p.affiliation||'—'}</div>
      <div class="tags">${tags}</div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${email}${site}</div>
    </div>
  </article>`;
}
function renderPeople(){
    const grid = document.getElementById('people-grid');
    grid.innerHTML = DATA.people.map(personCard).join('');
    applyImageFallbacks(grid);

    if (stopPeopleScroll) stopPeopleScroll();
    stopPeopleScroll = setupStepScroll(grid, {axis:'y', pause:2400, duration:650, selector:':scope > .card'});
}
document.getElementById('people-search').addEventListener('input', (e)=>{
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#people-grid .card').forEach(card=>{
        const hay = (card.dataset.name + ' ' + card.dataset.role + ' ' + card.dataset.topics).toLowerCase();
        card.style.display = hay.includes(q) ? '' : 'none';
    });
    if (stopPeopleScroll) stopPeopleScroll();
    stopPeopleScroll = setupStepScroll(document.getElementById('people-grid'), {axis:'y', pause:2400, duration:650, selector:':scope > .card:not([style*="display: none"])'});
});

/* ---------- RESEARCH (vertical, paged) ---------- */
function fillAreaFilter(){
    const areas = Array.from(new Set(DATA.projects.map(p=>p.area))).sort();
    const sel = document.getElementById('research-area-filter');
    areas.forEach(a=>{
        const opt = document.createElement('option'); opt.value=a; opt.textContent=a; sel.appendChild(opt);
    });
}
function projectCard(p){
    const chips = (p.highlights||[]).map(h=>`<span class="tag">${h}</span>`).join('');
    const links = (p.links||[]).map(l=>`<a class="btn ghost" href="${l.href}" target="_blank" rel="noopener">${l.label}</a>`).join('');
    return `
  <article class="card" data-area="${p.area}">
    <div class="body">
      <div class="meta">${p.area}</div>
      <h3 style="margin:.2rem 0 .3rem">${p.title}</h3>
      <p>${p.summary}</p>
      <div class="tags">${chips}</div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${links}</div>
    </div>
  </article>`;
}
function renderResearch(){
    const grid = document.getElementById('research-grid');
    grid.innerHTML = DATA.projects.map(projectCard).join('');

    if (stopResearchScroll) stopResearchScroll();
    stopResearchScroll = setupStepScroll(grid, {axis:'y', pause:2400, duration:650, selector:':scope > .card'});
}
document.getElementById('research-area-filter').addEventListener('change', (e)=>{
    const v = e.target.value;
    document.querySelectorAll('#research-grid .card').forEach(c=>{
        c.style.display = !v || c.dataset.area === v ? '' : 'none';
    });
    if (stopResearchScroll) stopResearchScroll();
    stopResearchScroll = setupStepScroll(document.getElementById('research-grid'), {axis:'y', pause:2400, duration:650, selector:':scope > .card:not([style*="display: none"])'});
});

/* ---------- PUBLICATIONS (vertical, paged + rich cards + copy BibTeX) ---------- */
function yearOptions(){
    const years = Array.from(new Set(DATA.publications.map(p=>p.year))).sort((a,b)=>b-a);
    const sel = document.getElementById('pub-year');
    years.forEach(y=>{ const o=document.createElement('option'); o.value=y; o.textContent=y; sel.appendChild(o); });
}
function pubHTML(p, idx){
    const authors = p.authors.join(', ');
    const btnPdf = p.pdf ? `<a class="btn" href="${p.pdf}" target="_blank" rel="noopener">PDF</a>` : '';
    const btnCode = p.code ? `<a class="btn ghost" href="${p.code}" target="_blank" rel="noopener">Code</a>` : '';
    const thumb = p.image
        ? `<img class="pub-thumb" src="${p.image}" alt="${p.title}" loading="lazy" data-fallback="thumb" />`
        : `<div class="pub-thumb placeholder" aria-hidden="true"></div>`;
    const abstract = p.abstract ? `<p class="pub-abstract">${p.abstract}</p>` : '';

    return `
  <div class="pub-item pub-rich" data-year="${p.year}" data-type="${p.type}" data-hay="${(p.title+' '+authors+' '+p.venue+' '+p.type).toLowerCase()}">
    <div class="pub-left">
      ${thumb}
    </div>
    <div class="pub-mid">
      <div class="title">${p.title}</div>
      <div class="authors">${authors}</div>
      <div class="venue">${p.venue} · <span class="tag">${p.type}</span> · <span class="tag">${p.year}</span></div>
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
    const list = document.getElementById('pub-list');
    list.innerHTML = DATA.publications
        .slice().sort((a,b)=> (b.year - a.year) || a.title.localeCompare(b.title))
        .map(pubHTML).join('');
    applyImageFallbacks(list);

    // Copy-to-clipboard handlers
    document.querySelectorAll('.copy-bib').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
            const id = btn.getAttribute('data-bib');
            const box = document.getElementById('bib-'+id);
            const text = (box && box.textContent) ? box.textContent.trim() : '';
            try{
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                const old = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(()=> btn.textContent = old, 1200);
            }catch(e){
                console.error('Clipboard failed', e);
            }
        });
    });

    if (stopPubScroll) stopPubScroll();
    stopPubScroll = setupStepScroll(list, {axis:'y', pause:2400, duration:650, selector:':scope > .pub-item'});
}
function updatePubCount(){
    const visible = [...document.querySelectorAll('#pub-list .pub-item')].filter(x=>x.style.display !== 'none').length;
    document.getElementById('pub-count').textContent = visible;
}
function filterPubs(){
    const q = document.getElementById('pub-search').value.toLowerCase();
    const year = document.getElementById('pub-year').value;
    const type = document.getElementById('pub-type').value;
    document.querySelectorAll('#pub-list .pub-item').forEach(item=>{
        const byQ = item.dataset.hay.includes(q);
        const byY = !year || String(item.dataset.year) === year;
        const byT = !type || item.dataset.type === type;
        item.style.display = (byQ && byY && byT) ? '' : 'none';
    });
    updatePubCount();
    if (stopPubScroll) stopPubScroll();
    stopPubScroll = setupStepScroll(document.getElementById('pub-list'), {axis:'y', pause:2400, duration:650, selector:':scope > .pub-item:not([style*="display: none"])'});
}

/* ---------- Manual link wiring ---------- */
function wireManualLink(){
    const manualURL = DATA.manual_url || 'manual/manual_index.html';
    const navManual = document.getElementById('nav-manual');
    if (navManual) {
        navManual.addEventListener('click', (e) => {
            e.preventDefault();
            window.open(manualURL, '_blank', 'noopener');
        });
    }
    const manualCta = document.getElementById('manual-cta');
    if (manualCta) {
        manualCta.href = manualURL;
        manualCta.target = '_blank';
        manualCta.rel = 'noopener';
    }
}

/* ---------- INIT ---------- */
async function init(){
    try{
        const res = await fetch('data/lab-data.json', {cache:'no-store'});
        DATA = await res.json();
    }catch(e){
        console.error('Failed to load data:', e);
        DATA = {news_visible:3, news:[],people:[],projects:[],publications:[],manual_url:'manual/manual_index.html'};
    }

    wireManualLink();

    renderHome();
    renderPeople();
    fillAreaFilter();
    renderResearch();
    yearOptions();
    renderPubs();
    updatePubCount();

    setActive(location.hash || '#home');
    window.addEventListener('hashchange', ()=> setActive(location.hash || '#home'));
}

document.addEventListener('DOMContentLoaded', init);
