/* Enhance: People avatars + text polish */
(function () {
    const grid = document.getElementById('people-grid');
    if (!grid) return;

    // =========（已有）图片包裹与视差 =========
    function wrapOnce(img) {
        if (!img || img.closest('.media-fx')) return;
        if (img.dataset && img.dataset.plain === '1') return;
        const box = document.createElement('div');
        box.className = 'media-fx';
        const p = img.parentNode;
        p.insertBefore(box, img);
        box.appendChild(img);
        if (matchMedia('(hover: hover)').matches) {
            let raf = 0;
            box.addEventListener('mousemove', (e) => {
                const r = box.getBoundingClientRect();
                const mx = ((e.clientX - r.left) / r.width) * 100;
                const my = ((e.clientY - r.top) / r.height) * 100;
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => {
                    box.style.setProperty('--mx', mx + '%');
                    box.style.setProperty('--my', my + '%');
                });
            });
            box.addEventListener('mouseleave', () => {
                box.style.removeProperty('--mx');
                box.style.removeProperty('--my');
            });
        }
    }

    // === NEW: 文本美化（为姓名/角色加上统一类名） ===
    function polishText(card) {
        if (!card) return;

        // NEW: 给 People 卡打上 people-card 类，用于应用层次光影
        if (!card.classList.contains('people-card')) {
            card.classList.add('people-card');
        }

        const body = card.querySelector('.body') || card;

        // 1) 猜测“姓名”元素：常见是 h3/h4 或包含 name/title 的类名
        let nameEl = body.querySelector('.person-name, .name, .title, .card-title, h3, h4, h5');
        // 如果没找到，但 body 的第一个元素是纯文本，也包一层
        if (!nameEl) {
            const firstEl = [...body.children].find(n => n.textContent && n.textContent.trim().length > 0);
            if (firstEl && !firstEl.querySelector('*')) nameEl = firstEl; // 容错
        }
        if (nameEl && !nameEl.classList.contains('person-name')) {
            nameEl.classList.add('person-name');
        }

        // 2) 角色/单位：常见放在 .meta 里
        const meta = body.querySelector('.person-meta') || body.querySelector('.meta');
        if (meta && !meta.classList.contains('person-meta')) {
            meta.classList.add('person-meta');
            // 可选：把角色加粗一点（如果你的人物 meta 是“Role · Affiliation”）
            // 尝试把第一个分段用 span 包一下
            const txt = meta.textContent.trim();
            if (txt && !meta.querySelector('.person-role')) {
                // 简易切分：遇到 · 或 | 或 , 分隔
                const m = txt.split(/[\u00B7·\|,]/);
                if (m.length > 1) {
                    meta.innerHTML =
                        `<span class="person-role">${m[0].trim()}</span><span class="person-sep"> · </span>${txt.slice(m[0].length + 1).trim()}`;
                } else {
                    // 只有一个字段时也给它包一下
                    meta.innerHTML = `<span class="person-role">${txt}</span>`;
                }
            }
        }
    }

    // === NEW: 扫描每张卡片，应用文本美化 ===
    function scanCards() {
        grid.querySelectorAll('.card').forEach(polishText);
    }

    // 初次渲染后的全量扫描：图片 + 文本
    function scanNow() {
        grid.querySelectorAll('img').forEach(wrapOnce);
        scanCards();
    }

    const mo = new MutationObserver(() => scanNow());
    mo.observe(grid, {childList: true, subtree: true});

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scanNow);
    } else {
        scanNow();
    }
    setTimeout(scanNow, 300);
})();


/* Enhance: Projects (#research-grid) & Life (#life-home-grid) */
(function () {
    const projGrid = document.getElementById('research-grid');
    const lifeGrid = document.getElementById('life-home-grid');
    if (!projGrid && !lifeGrid) return;

    const hasHover = matchMedia('(hover: hover)').matches;

    function wrapMediaFx(img) {
        if (!img || img.closest('.media-fx')) return;
        if (img.dataset && img.dataset.plain === '1') return;
        const box = document.createElement('div');
        box.className = 'media-fx';
        const p = img.parentNode;
        p.insertBefore(box, img);
        box.appendChild(img);
        if (hasHover) {
            let raf = 0;
            box.addEventListener('mousemove', (e) => {
                const r = box.getBoundingClientRect();
                const mx = ((e.clientX - r.left) / r.width) * 100;
                const my = ((e.clientY - r.top) / r.height) * 100;
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(() => {
                    box.style.setProperty('--mx', mx + '%');
                    box.style.setProperty('--my', my + '%');
                });
            });
            box.addEventListener('mouseleave', () => {
                box.style.removeProperty('--mx');
                box.style.removeProperty('--my');
            });
        }
    }

    function polishProjectCard(card) {
        if (!card) return;
        card.classList.add('project-card'); // 吃到玻璃卡片样式
        const body = card.querySelector('.body') || card;

        // 标题
        let title = body.querySelector('.project-title, .title, h3, h4, h5');
        if (title && !title.classList.contains('project-title')) {
            title.classList.add('project-title');
        }
        // 元信息/副标题（如果有）
        let meta = body.querySelector('.project-meta, .meta, .subtitle, .desc, p');
        if (meta && !meta.classList.contains('project-meta')) {
            meta.classList.add('project-meta');
        }
        // 图片包裹
        card.querySelectorAll('img').forEach(wrapMediaFx);
    }

    function polishLifeCard(card) {
        if (!card) return;
        card.classList.add('life-card'); // 统一卡片语言
        const body = card.querySelector('.body') || card;

        // Life 可能是纯图片卡，也可能有 caption
        let title = body.querySelector('.life-title, .title, figcaption, h4, h5');
        if (title && !title.classList.contains('life-title')) {
            title.classList.add('life-title');
        }
        let meta = body.querySelector('.life-meta, .meta, .subtitle, p');
        if (meta && !meta.classList.contains('life-meta')) {
            meta.classList.add('life-meta');
        }
        // 图片包裹
        card.querySelectorAll('img').forEach(wrapMediaFx);
    }

    function scanProjects() {
        if (!projGrid) return;
        projGrid.querySelectorAll('.card').forEach(polishProjectCard);
    }

    function scanLife() {
        if (!lifeGrid) return;
        lifeGrid.querySelectorAll('.card, figure, .photo').forEach(polishLifeCard);
    }

    // 初次扫描 + 监听渲染变动
    const moProj = projGrid ? new MutationObserver(scanProjects) : null;
    const moLife = lifeGrid ? new MutationObserver(scanLife) : null;

    if (projGrid) {
        scanProjects();
        moProj.observe(projGrid, {childList: true, subtree: true});
    }
    if (lifeGrid) {
        scanLife();
        moLife.observe(lifeGrid, {childList: true, subtree: true});
    }
})();


// 抽屉里的“Lab Manual”和“Theme”按钮与主逻辑对齐
document.addEventListener('DOMContentLoaded', () => {
    const drawerManual = document.getElementById('drawer-manual');
    const navManual = document.getElementById('nav-manual');
    if (drawerManual && navManual) {
        drawerManual.addEventListener('click', (e) => {
            e.preventDefault();
            navManual.click(); // 触发 main.js 中 wireManualLink 的逻辑
        });
    }
    const drawerTheme = document.getElementById('drawer-theme');
    const themeToggle = document.getElementById('theme-toggle');
    if (drawerTheme && themeToggle) {
        drawerTheme.addEventListener('click', () => themeToggle.click());
    }

    // =========================
    // 滚动时高亮当前 section 的导航
    // =========================
    const sectionIds = [
        'home',
        'videos',
        'people',
        'publications',
        'research',
        'reputation',
        'life'
    ];

    // 建一个结构：每个 section 对应一批 <a data-link href="#xxx">
    const sections = sectionIds
        .map(id => {
            const el = document.getElementById(id);
            if (!el) return null;
            const hash = '#' + id;
            const links = Array.from(
                document.querySelectorAll(`a[data-link][href="${hash}"]`)
            );
            if (!links.length) return null;
            return { id, el, links };
        })
        .filter(Boolean);

    // 没 section 或浏览器不支持 IntersectionObserver 就直接返回
    if (!sections.length || !('IntersectionObserver' in window)) {
        return;
    }

    let currentId = null;

    function setActiveNav(id) {
        if (id === currentId) return;
        currentId = id;

        sections.forEach(section => {
            const isActive = section.id === id;
            section.links.forEach(link => {
                link.classList.toggle('active', isActive);
                if (isActive) {
                    link.setAttribute('aria-current', 'page');
                } else {
                    link.removeAttribute('aria-current');
                }
            });
        });
    }

    // 根据当前滚动位置，选出“最靠近视口上方 25%”的 section
    function pickSectionByViewport() {
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const targetLine = vh * 0.25; // 希望 section 顶部大约出现在视口 25% 高的位置时高亮它
        let best = null;

        sections.forEach(section => {
            const rect = section.el.getBoundingClientRect();
            // 完全在视口外就跳过
            if (rect.bottom <= 0 || rect.top >= vh) return;

            const dist = Math.abs(rect.top - targetLine);
            if (!best || dist < best.dist) {
                best = { id: section.id, dist };
            }
        });

        if (best) {
            setActiveNav(best.id);
        }
    }

    const observer = new IntersectionObserver(
        () => {
            // IntersectionObserver 触发时，我们用当前所有 section 的位置来统一决定高亮谁
            pickSectionByViewport();
        },
        {
            root: null,
            threshold: 0.1 // 有至少一点点进入视口就会触发
        }
    );

    // 观察这些 section
    sections.forEach(section => observer.observe(section.el));

    // 初始执行一次（页面刚打开还没滚动时）
    pickSectionByViewport();

});


