/**
 * Shared JavaScript Utilities
 * Portfolio Site - John Hanacek
 */

// ===========================================
// Navigation Scroll Visibility
// ===========================================
function initNavigation() {
    const nav = document.getElementById('nav');
    const hero = document.querySelector('.hero');

    if (!nav || !hero) return;

    function updateNavVisibility() {
        const heroBottom = hero.offsetTop + hero.offsetHeight - 60;
        if (window.scrollY > heroBottom) {
            nav.classList.add('visible');
        } else {
            nav.classList.remove('visible');
        }
    }

    window.addEventListener('scroll', updateNavVisibility);
    window.addEventListener('resize', updateNavVisibility);
    updateNavVisibility();

    // Mobile navigation toggle
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('nav ul');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            const isExpanded = this.getAttribute('aria-expanded') === 'true';
            this.setAttribute('aria-expanded', !isExpanded);
            this.classList.toggle('active');
            navMenu.classList.toggle('open');
        });

        // Close menu when clicking a link
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navToggle.setAttribute('aria-expanded', 'false');
                navToggle.classList.remove('active');
                navMenu.classList.remove('open');
            });
        });
    }
}

// ===========================================
// Cursor Spotlight Effect
// ===========================================
function initCursorSpotlight() {
    const spotlight = document.getElementById('cursorSpotlight');
    if (!spotlight) return;

    let isSpotlightActive = false;

    function updateSpotlight(x, y) {
        const xPercent = (x / window.innerWidth) * 100;
        const yPercent = (y / window.innerHeight) * 100;
        spotlight.style.background = `radial-gradient(600px circle at ${xPercent}% ${yPercent}%, rgba(0, 217, 255, 0.15), rgba(199, 125, 255, 0.1) 40%, transparent 70%)`;
    }

    // Mouse events
    document.addEventListener('mousemove', (e) => {
        if (!isSpotlightActive) {
            spotlight.classList.add('active');
            isSpotlightActive = true;
        }
        updateSpotlight(e.clientX, e.clientY);
    });

    document.addEventListener('mouseleave', () => {
        spotlight.classList.remove('active');
        isSpotlightActive = false;
    });

    // Touch events
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            spotlight.classList.add('active');
            isSpotlightActive = true;
            updateSpotlight(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            updateSpotlight(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    document.addEventListener('touchend', () => {
        // Keep spotlight visible for a moment after touch ends
        setTimeout(() => {
            if (!isSpotlightActive) {
                spotlight.classList.remove('active');
            }
        }, 2000);
    });
}

// ===========================================
// Image Modal / Lightbox
// ===========================================
function initImageModal() {
    const modal = document.querySelector('.image-modal');
    if (!modal) return;

    const modalImg = modal.querySelector('.modal-image-container img');
    const modalCaption = document.getElementById('modalCaption');
    const modalClose = modal.querySelector('.modal-close');
    const modalBackdrop = modal.querySelector('.modal-backdrop');
    const modalPrev = modal.querySelector('.modal-prev');
    const modalNext = modal.querySelector('.modal-next');
    const modalCounter = modal.querySelector('.modal-counter');

    const galleryImages = document.querySelectorAll('.gallery-item .image img');
    let currentIndex = 0;

    function openModal(index) {
        currentIndex = index;
        const img = galleryImages[index];
        modalImg.src = img.src;
        modalImg.alt = img.alt;
        modalCaption.textContent = img.closest('.gallery-item').querySelector('figcaption')?.textContent || '';
        updateCounter();
        updateNavButtons();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function showPrev() {
        if (currentIndex > 0) {
            openModal(currentIndex - 1);
        }
    }

    function showNext() {
        if (currentIndex < galleryImages.length - 1) {
            openModal(currentIndex + 1);
        }
    }

    function updateCounter() {
        if (modalCounter) {
            modalCounter.textContent = `${currentIndex + 1} / ${galleryImages.length}`;
        }
    }

    function updateNavButtons() {
        if (modalPrev) modalPrev.disabled = currentIndex === 0;
        if (modalNext) modalNext.disabled = currentIndex === galleryImages.length - 1;
    }

    // Event listeners
    galleryImages.forEach((img, index) => {
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => openModal(index));
    });

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);
    if (modalPrev) modalPrev.addEventListener('click', showPrev);
    if (modalNext) modalNext.addEventListener('click', showNext);

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('active')) return;

        if (e.key === 'Escape') closeModal();
        if (e.key === 'ArrowLeft') showPrev();
        if (e.key === 'ArrowRight') showNext();
    });
}

// ===========================================
// Initialize All Shared Features
// ===========================================
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initCursorSpotlight();
    initImageModal();
});
