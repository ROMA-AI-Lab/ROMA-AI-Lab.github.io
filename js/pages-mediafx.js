(function(){
    const hasHover = matchMedia('(hover: hover)').matches;

    const $ = (sel, root=document)=> root.querySelector(sel);
    const $$ = (sel, root=document)=> Array.from(root.querySelectorAll(sel));

    function wrapMediaFx(img){
        if(!img || img.closest('.media-fx')) return;
        if(img.dataset && img.dataset.plain === '1') return;
        const box = document.createElement('div');
        box.className = 'media-fx';
        const p = img.parentNode;
        p.insertBefore(box, img);
        box.appendChild(img);

        if (hasHover){
            let raf = 0;
            box.addEventListener('mousemove', (e)=>{
                const r = box.getBoundingClientRect();
                const mx = ((e.clientX - r.left)/r.width)*100;
                const my = ((e.clientY - r.top)/r.height)*100;
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(()=>{
                    box.style.setProperty('--mx', mx + '%');
                    box.style.setProperty('--my', my + '%');
                });
            });
            box.addEventListener('mouseleave', ()=>{
                box.style.removeProperty('--mx');
                box.style.removeProperty('--my');
            });
        }
    }

    function polishProjects(){
        const grid = $('#proj-all-grid');
        if(!grid) return;
        $$('.card', grid).forEach(card=>{
            card.classList.add('project-card');
            const body = card.querySelector('.body') || card;
            let title = body.querySelector('.project-title, .title, h3, h4, h5');
            if(title && !title.classList.contains('project-title')){
                title.classList.add('project-title');
            }
            let meta = body.querySelector('.project-meta, .meta, .subtitle, p');
            if(meta && !meta.classList.contains('project-meta')){
                meta.classList.add('project-meta');
            }
            $$('img', card).forEach(wrapMediaFx);
        });

        // 监听动态变动
        new MutationObserver(()=>polishProjects())
            .observe(grid, {childList:true, subtree:true});
    }

    function polishLife(){
        const grid = $('#life-grid');
        if(!grid) return;
        $$('.card, figure, .photo', grid).forEach(card=>{
            card.classList.add('life-card');
            const body = card.querySelector('.body') || card;
            let title = body.querySelector('.life-title, .title, figcaption, h4, h5');
            if(title && !title.classList.contains('life-title')){
                title.classList.add('life-title');
            }
            let meta = body.querySelector('.life-meta, .meta, .subtitle, p');
            if(meta && !meta.classList.contains('life-meta')){
                meta.classList.add('life-meta');
            }
            $$('img', card).forEach(wrapMediaFx);
        });

        new MutationObserver(()=>polishLife())
            .observe(grid, {childList:true, subtree:true});
    }

    function polishPeople(){
        const grid = $('#people-all-grid');
        if(!grid) return;
        $$('.card', grid).forEach(card=>{
            card.classList.add('people-card');
            const body = card.querySelector('.body') || card;
            let name = body.querySelector('.person-name, .name, .title, h3, h4, h5');
            if(name && !name.classList.contains('person-name')){
                name.classList.add('person-name');
            }
            let meta = body.querySelector('.person-meta, .meta, .subtitle, p');
            if(meta && !meta.classList.contains('person-meta')){
                meta.classList.add('person-meta');
            }
            $$('img', card).forEach(wrapMediaFx);
        });

        new MutationObserver(()=>polishPeople())
            .observe(grid, {childList:true, subtree:true});
    }

    function polishReputation(){
        const home = document.querySelector('#repute-list');
        const full = document.querySelector('#repute-all-grid');
        [home, full].forEach(grid=>{
            if (!grid) return;

            // 统一卡体类名（与 people/life 一致的“抛光感”）
            grid.querySelectorAll('.repute-card').forEach(card=>{
                card.classList.add('card','fx'); // 整卡 hover 抛光
                // 头像媒体区：确保被 media-fx 包裹
                const media = card.querySelector('.repute-media');
                if (media && !media.classList.contains('media-fx')){
                    media.classList.add('media-fx');
                }
                // 标题/副标题语义类名（统一字号与字重）
                const name = card.querySelector('.repute-name');
                if (name && !name.classList.contains('people-title')){
                    name.classList.add('people-title');
                }
                const meta = card.querySelector('.repute-meta');
                if (meta && !meta.classList.contains('people-meta')){
                    meta.classList.add('people-meta');
                }
            });

            // 监听动态插入，保持自动抛光
            new MutationObserver(()=>polishReputation())
                .observe(grid, {childList:true, subtree:true});
        });
    }


    function init(){
        polishProjects();
        polishLife();
        polishPeople();
        polishReputation();
    }

    if (document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
