/* ROMA Lab - Video Wall (independent, zero deps)
 * Features:
 * - Click-to-Play (cover → inject iframe)
 * - Lazy Injection via IntersectionObserver
 * - Pre-windowed incremental rendering (virtualization-lite)
 * - Multi-platform router (Bilibili/YouTube/Vimeo/Tencent)
 * - Failure fallback (timeout -> open on platform)
 * - Pin-first sorting + soft CTAs (project/paper/join)
 */

(function () {
    const SECTION_ID = 'videos';                 // <section id="videos">
    const GRID_ID = 'video-grid';                // <div id="video-grid" ...>
    const DATA_URL = 'data/videos.json';
    const BATCH = 12;                            // 初始渲染数量
    const STEP = 8;                              // 滚动追加数量
    const IFRAME_TIMEOUT = 10000;                // 失败/降级的超时 ms
    const ROOT_MARGIN = '200px 0px';

    const q = (sel, root = document) => root.querySelector(sel);
    const el = (tag, cls) => { const x = document.createElement(tag); if (cls) x.className = cls; return x; };

    function buildEmbedSrc(item) {
        if (item.src) return item.src; // 允许完全自定
        switch ((item.platform || '').toLowerCase()) {
            case 'bilibili': {
                const params = new URLSearchParams({ isOutside: 'true' });
                if (item.bvid) params.set('bvid', item.bvid);
                if (item.aid) params.set('aid', item.aid);
                if (item.cid) params.set('cid', item.cid);
                return `//player.bilibili.com/player.html?${params.toString()}`;
            }
            case 'youtube':
                return `https://www.youtube.com/embed/${item.youtubeId}?rel=0`;
            case 'vimeo':
                return `https://player.vimeo.com/video/${item.vimeoId}`;
            case 'tencent':
                // 经典腾讯播放器
                return `https://v.qq.com/txp/iframe/player.html?vid=${item.tencentVid}`;
            default:
                return '';
        }
    }

    function buildExternalLink(item) {
        switch ((item.platform || '').toLowerCase()) {
            case 'bilibili':
                return item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : 'https://www.bilibili.com';
            case 'youtube':
                return item.youtubeId ? `https://youtu.be/${item.youtubeId}` : 'https://youtube.com';
            case 'vimeo':
                return item.vimeoId ? `https://vimeo.com/${item.vimeoId}` : 'https://vimeo.com';
            case 'tencent':
                return item.tencentVid ? `https://v.qq.com/x/cover/${item.tencentVid}.html` : 'https://v.qq.com';
            default:
                return '#';
        }
    }

    function mountIframe(card, src, title) {
        const wrap = card.querySelector('.video-embed');
        if (!wrap) return;
        wrap.innerHTML = '';
        const ifr = el('iframe', 'video-iframe');
        ifr.title = title || 'ROMA Lab Video';
        ifr.src = src;
        ifr.loading = 'lazy';
        ifr.allow =
            'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share';
        ifr.referrerPolicy = 'no-referrer-when-downgrade';
        ifr.allowFullscreen = true;

        let loaded = false;
        const to = setTimeout(() => {
            if (loaded) return;
            // 降级：显示失败提示 + 外链
            const fail = el('div', 'video-fallback');
            fail.innerHTML = `
        <p>播放器加载失败或被拦截。</p>
        <a class="btn" target="_blank" rel="noopener">在平台打开 ↗</a>`;
            const a = fail.querySelector('a');
            a.href = card.dataset.external || '#';
            wrap.innerHTML = '';
            wrap.appendChild(fail);
        }, IFRAME_TIMEOUT);

        ifr.onload = () => {
            loaded = true;
            clearTimeout(to);
        };

        wrap.appendChild(ifr);
    }


    function openCinematic(src, title) {
        const overlay = document.getElementById('cinematic-overlay');
        const iframe = document.getElementById('cinematic-iframe');
        iframe.src = src;
        iframe.title = title || 'ROMA Lab Video';
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // 禁止背景滚动
    }

    function closeCinematic() {
        const overlay = document.getElementById('cinematic-overlay');
        const iframe = document.getElementById('cinematic-iframe');
        overlay.classList.remove('active');
        iframe.src = ''; // 停止播放
        document.body.style.overflow = '';
    }

    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('cinematic-close') ||
            e.target.id === 'cinematic-overlay') {
            closeCinematic();
        }
    });







    function createCard(item) {
        const card = el('article', 'card video-card');
        card.dataset.id = item.id || '';
        card.dataset.external = buildExternalLink(item);

        // 头图：16:9 占位 + 覆盖播放按钮
        const embed = el('div', 'video-embed');
        const cover = el('div', 'video-cover');
        cover.style.aspectRatio = '16 / 9';
        if (item.cover) {
            cover.style.backgroundImage = `url('${item.cover}')`;
        }
        const playBtn = el('button', 'video-play');
        playBtn.type = 'button';
        playBtn.setAttribute('aria-label', `Play video: ${item.title || 'video'}`);
        playBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <path d="M8 5v14l11-7z"></path>
      </svg>
    `;
        cover.appendChild(playBtn);
        embed.appendChild(cover);

        const body = el('div', 'body');
        const title = el('div', 'video-title'); title.textContent = item.title || 'ROMA Lab Video';
        const meta = el('div', 'video-meta');
        meta.textContent = `${(item.platform || '').toUpperCase()}${item.duration ? ' · ' + item.duration : ''}${item.year ? ' · ' + item.year : ''}`;

        // 软转化按钮区（存在则显示）
        const ctas = el('div', 'video-ctas');
        const extLink = el('a', 'btn ghost');
        extLink.textContent = 'Open on Platform ↗';
        extLink.target = '_blank'; extLink.rel = 'noopener';
        extLink.href = buildExternalLink(item);
        ctas.appendChild(extLink);

        if (item.links && item.links.project) {
            const a = el('a', 'btn ghost'); a.textContent = 'Project';
            a.href = item.links.project; ctas.appendChild(a);
        }
        if (item.links && item.links.paper) {
            const a = el('a', 'btn ghost'); a.textContent = 'Paper';
            a.href = item.links.paper; ctas.appendChild(a);
        }
        if (item.links && item.links.join) {
            const a = el('a', 'btn'); a.textContent = 'Join Us';
            a.href = item.links.join; ctas.appendChild(a);
        }

        body.appendChild(title); body.appendChild(meta); body.appendChild(ctas);
        card.appendChild(embed); card.appendChild(body);

        // 点击播放：进入视窗后再注入 iframe（懒注入）
        const src = buildEmbedSrc(item);
        // const tryPlay = () => {
        //     if (!src) { window.open(buildExternalLink(item), '_blank'); return; }
        //     mountIframe(card, src, item.title || 'ROMA Lab Video');
        //     // 防止重复注入
        //     playBtn.disabled = true;
        //     observer.unobserve(playBtn);
        // };

        const tryPlay = () => {
            if (!src) { window.open(buildExternalLink(item), '_blank'); return; }
            openCinematic(src, item.title || 'ROMA Lab Video');
        };


        const observer = new IntersectionObserver((ents) => {
            ents.forEach(ent => {
                if (ent.isIntersecting && !playBtn.disabled) {
                    // 如果用户已经点击，则此处立即注入；否则只准备
                    // 这里采用“点击触发”，但确保进入视窗才真正 mount
                }
            });
        }, { rootMargin: ROOT_MARGIN });

        playBtn.addEventListener('click', () => {
            // 如果不在视口，先滚动进来再注入
            const rect = card.getBoundingClientRect();
            if (rect.top < 0 || rect.bottom > (window.innerHeight || document.documentElement.clientHeight)) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(tryPlay, 250);
            } else {
                tryPlay();
            }
        });

        observer.observe(playBtn);
        return card;
    }

    async function fetchData() {
        const r = await fetch(DATA_URL, { cache: 'no-store' });
        if (!r.ok) throw new Error('videos.json load failed');
        const arr = await r.json();
        // 排序：pin 在前，之后按 publishedAt/年/标题
        return (arr || []).slice().sort((a, b) => {
            if (a.pin && !b.pin) return -1;
            if (!a.pin && b.pin) return 1;
            const ta = +new Date(a.publishedAt || `${a.year || 0}-01-01`);
            const tb = +new Date(b.publishedAt || `${b.year || 0}-01-01`);
            if (tb !== ta) return tb - ta; // 新在前
            return String(a.title || '').localeCompare(String(b.title || ''));
        });
    }


    function setupInfinite(grid, data) {
        let rendered = 0;

        // 先创建 sentinel
        let sentinel = document.createElement('div');
        sentinel.className = 'video-sentinel';
        grid.appendChild(sentinel);

        const renderMore = (count) => {
            const end = Math.min(rendered + count, data.length);
            for (let i = rendered; i < end; i++) {
                grid.appendChild(createCard(data[i]));
            }
            rendered = end;

            // 若已渲染完，移除 sentinel（注意判空）并停止观察
            if (rendered >= data.length && sentinel) {
                observer && observer.unobserve(sentinel);
                sentinel.remove();
                sentinel = null;
            }
        };

        // 追加渲染（简易虚拟化：分批加载）
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((ent) => {
                if (ent.isIntersecting) renderMore(8); // STEP
            });
        }, { rootMargin: '200px 0px' });

        observer.observe(sentinel);

        // 初始渲染放在最后，确保 sentinel 已定义
        renderMore(12); // BATCH
    }

    async function init() {
        const sec = q(`#${SECTION_ID}`);
        const grid = q(`#${GRID_ID}`);
        if (!sec || !grid) return;

        try {
            const data = await fetchData();
            setupInfinite(grid, data);
        } catch (e) {
            if (!grid.children.length) {
                const msg = document.createElement('p');
                msg.textContent = 'Video list failed to load.';
                grid.appendChild(msg);
            }
            console.warn('[videos] load failed:', e);
        }

    }

    // 等待 DOM 就绪
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
