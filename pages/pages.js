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

// 读取 Markdown（不存在时返回 null）
async function fetchMarkdown(path){
    try{
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.text();
    }catch{ return null; }
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



/* -------------------- Small utils -------------------- */
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const fmtDate = d => isNaN(new Date(d)) ? '' : new Date(d).toLocaleDateString();
function slugify(s=''){
    return (s||'').toString().trim().toLowerCase()
        .replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-');
}
function getQuery(key){
    const u = new URL(location.href);
    return u.searchParams.get(key);
}
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

/* -------------------- Data loading -------------------- */
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
    const tags = (p.topics||[]).map(t=>`<span class="tag">${t}</span>`).join('');
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
      <div class="meta">Affiliation: ${p.affiliation||'—'}</div>
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
    const chips = (p.highlights||[]).map(h=>`<span class="tag">${h}</span>`).join('');
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
    const authors = (p.authors||[]).join(', ');
    const btnPdf  = p.pdf  ? `<a class="btn" href="${p.pdf}" target="_blank" rel="noopener">PDF</a>` : '';
    const btnCode = p.code ? `<a class="btn ghost" href="${p.code}" target="_blank" rel="noopener">Code</a>` : '';
    const abstract = p.abstract ? `<p class="pub-abstract">${p.abstract}</p>` : '';
    const yearTag = p.year ? `<span class="tag">${p.year}</span>` : '';
    return `
  <div class="pub-item" data-year="${p.year||''}" data-type="${p.type||''}" data-hay="${(p.title+' '+authors+' '+(p.venue||'')+' '+(p.type||'')).toLowerCase()}">
    <div class="pub-mid">
      <div class="title">${p.title}</div>
      <div class="authors">${authors}</div>
      <div class="venue">${p.venue||''} · <span class="tag">${p.type||''}</span> · ${yearTag}</div>
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
    const {publications} = await loadAll();
    const list = $('#pub-all-list');
    const items = publications.slice().sort((a,b)=> (b.year - a.year) || a.title.localeCompare(b.title));
    list.innerHTML = items.map(pubHTML).join('');
    wireCopyBib(list);

    const years = Array.from(new Set(publications.map(p=>p.year))).sort((a,b)=>b-a);
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
    let dialog = $('dialog.lightbox');
    if (!dialog){
        dialog = document.createElement('dialog');
        dialog.className='lightbox';
        document.body.appendChild(dialog);
        dialog.addEventListener('click', e=>{
            const rect = dialog.getBoundingClientRect();
            const inBox = (e.clientY>=rect.top && e.clientY<=rect.bottom && e.clientX>=rect.left && e.clientX<=rect.right);
            if (!inBox) dialog.close();
        });
        document.addEventListener('keydown', e=>{ if (e.key === 'Escape' && dialog.open) dialog.close(); });
    }
    root.addEventListener('click', e=>{
        const img = e.target.closest('img');
        if (!img) return;
        dialog.innerHTML = `<img src="${img.getAttribute('src')}" alt="" />`;
        if (!dialog.open) dialog.showModal();
    });
}
async function initLifePage(){
    const {gallery} = await loadAll();
    const grid = $('#life-grid');

    const years = Array.from(new Set(gallery.map(g => (g.date ? new Date(g.date).getFullYear() : null)).filter(Boolean))).sort((a,b)=>b-a);
    $('#life-year').innerHTML = '<option value="">All years</option>' + years.map(y=>`<option>${y}</option>`).join('');
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
            <h3 style="margin:.2rem 0 .3rem">${title}</h3>
            ${date}
          </div>
        </article>`;
        }).join('');
        applyImageFallbacks(grid);
    }
    $('#life-year').onchange = draw;
    $('#life-tag').onchange = draw;
    draw();
    wireLightbox(grid);
}


/* ============ Person detail ============ */
// 在 person.html 里有一个 <div id="person-detail-body"></div>
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

    // —— 默认信息（头像 / 基本信息 / topics / 邮件等）
    const avatarEl = person.avatar
        ? `<img class="avatar" src="${person.avatar}" alt="${person.name}" loading="lazy" />`
        : `<div class="avatar placeholder" role="img" aria-label="${person.name}"></div>`;

    const tags = (person.topics||[]).map(t=>`<span class="tag">${t}</span>`).join('');
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

    // ⬇️ 追加 Markdown（如果 content/people/slug.md 存在就渲染，没有就忽略）
    const md = await fetchMarkdown(`../content/people/${slug}.md`);
    if (md){
        const html = markdownToHTML(md);
        const wrap = document.createElement('section');
        wrap.className = 'prose';
        wrap.innerHTML = `${html}`;//`<h3>More</h3>${html}`;
        body.appendChild(wrap);
    }
}

// 把教育、获奖、代表作等做成可选区块
function renderPersonExtraBlocks(p){
    const edu = (p.education||[]).map(e=>`<li>${e}</li>`).join('');
    const awards = (p.awards||[]).map(a=>`<li>${a}</li>`).join('');
    const pubs = (p.selected_publications||[]).map(t=>`<li>${t}</li>`).join('');
    // const placement = p.placement ? `<p><strong>Work Experience:</strong> ${p.placement}</p>` : '';
    const placement = (p.placement||[]).map(e=>`<li>${e}</li>`).join('');

    return `
    ${edu ? `<h3>Education</h3><ul>${edu}</ul>` : ''}
    ${awards ? `<h3>Awards</h3><ul>${awards}</ul>` : ''}
    ${pubs ? `<h3>Selected Publications</h3><ul>${pubs}</ul>` : ''}
    ${placement ? `<h3>Working Experience</h3><ul>${placement}</ul>` : ''}
  `;
}



/* -------------------- Project detail -------------------- */

/* ============ Project detail ============ */
// 在 project.html 里有一个 <div id="proj-detail-body"></div>
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

    const chips = (project.highlights||[]).map(h=>`<span class="tag">${h}</span>`).join('');
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

    // ⬇️ 追加 Markdown（如果 content/projects/slug.md 存在就渲染，没有就忽略）
    const md = await fetchMarkdown(`../content/projects/${slug}.md`);
    if (md){
        const html = markdownToHTML(md);
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

    // Lightweight theme toggle for standalone pages (optional)
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

// // ===== Auto bootstrap for detail pages =====
// document.addEventListener('DOMContentLoaded', ()=>{
//     // 如果当前页包含这个容器，就初始化人员详情
//     if (document.getElementById('person-detail-body')) {
//         initPersonDetail();
//     }
//     // 如果当前页包含这个容器，就初始化项目详情
//     if (document.getElementById('proj-detail-body')) {
//         initProjectDetail();
//     }
// });
