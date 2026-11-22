document.addEventListener('DOMContentLoaded', async () => {
    const carousel = document.getElementById('ad-carousel');
    const placeholder = document.getElementById('ad-placeholder');
    const slide = document.getElementById('ad-slide');
    const image = document.getElementById('ad-image');
    const pagination = document.getElementById('ad-pagination');
    const projectsView = document.getElementById('main-content');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let banners;

    try {
        banners = await window.CodexAPI.ads.list();
    } catch (error) {
        console.warn('[Banners] Could not load banners:', error);
        return;
    }
    if (!banners.length) return;

    let currentIndex = 0;
    const buttons = banners.length > 1 ? banners.map((banner, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', banner.title || `Баннер ${index + 1}`);
        button.onclick = () => show(index);
        pagination.append(button);
        return button;
    }) : [];
    pagination.hidden = !buttons.length;

    function show(index) {
        currentIndex = index;
        const banner = banners[index];
        image.alt = banner.title || 'Реклама';
        image.src = '../assets/ads/' + encodeURIComponent(banner.image);
        const url = typeof banner.url === 'string' && URL.parse(banner.url);
        if (url?.protocol === 'https:') slide.href = url.href;
        else slide.removeAttribute('href');
        placeholder.hidden = true;
        slide.hidden = false;
        buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    }

    image.addEventListener('error', () => {
        slide.hidden = true;
        placeholder.hidden = false;
    });
    slide.addEventListener('click', event => {
        event.preventDefault();
        if (slide.hasAttribute('href')) window.CodexAPI.utils.openExternal(slide.href);
    });

    show(0);
    if (buttons.length) {
        setInterval(() => {
            if (document.hidden || reducedMotion.matches || projectsView.classList.contains('hidden') ||
                carousel.matches(':hover, :focus-within')) return;
            show((currentIndex + 1) % banners.length);
        }, 6000);
    }
});
