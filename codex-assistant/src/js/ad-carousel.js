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
        const hasPromo = Boolean(banner.promoCode && slide.hasAttribute('href'));
        slide.classList.toggle('ad-promo', hasPromo);
        if (hasPromo) {
            slide.setAttribute('aria-label', `${image.alt}. Скопировать промокод ${banner.promoCode} и перейти по ссылке`);
        } else {
            slide.removeAttribute('aria-label');
        }
        placeholder.hidden = true;
        slide.hidden = false;
        buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    }

    image.addEventListener('error', () => {
        slide.hidden = true;
        placeholder.hidden = false;
    });
    slide.addEventListener('click', async event => {
        event.preventDefault();
        if (!slide.hasAttribute('href')) return;
        const { href } = slide;
        const { promoCode } = banners[currentIndex];
        if (promoCode) {
            let copied = false;
            try {
                copied = await window.CodexAPI.clipboard.copy(promoCode);
            } catch (error) {
                console.warn('[Banners] Could not copy promo code:', error);
            }
            if (copied) AppToast.show(`Промокод ${promoCode} скопирован`);
            else AppToast.show('Не удалось скопировать промокод', 'error');
        }
        window.CodexAPI.utils.openExternal(href);
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
