// تطبيق المصحف الشريف المتكامل
class QuranApp {
    constructor() {
        this.quranData = null;
        this.swiper = null;
        this.surahIndex = [];
        this.juzIndex = [];
        this.pagesIndex = [];
        this.totalPages = 604;
        this.currentPage = 1; // صفحة 1 افتراضياً
        this.audio = document.getElementById('quran-audio');
        this.isPlaying = false;
        this.currentAudioPage = 0;
        this.deferredPrompt = null;
        
        // تشغيل فوري للصفحة الأولى
        this.initSwiperFirst();
        this.init();
    }

    // تهيئة السوايبر فوراً مع الصفحة الأولى
    initSwiperFirst() {
        // عرض الصفحة الأولى مباشرة
        const container = document.getElementById('quran-pages');
        if (container) {
            container.innerHTML = `
                <div class="swiper-slide">
                    <img src="images/1.webp" class="quran-page-img" alt="صفحة 1" onerror="this.src='images/1.jpg'">
                </div>
            `;
        }
    }

    async init() {
        // تحديث معلومات الصفحة فوراً
        this.updateHeaderInfo(1);
        
        // تحميل البيانات في الخلفية
        setTimeout(() => {
            this.loadData().then(() => {
                this.renderAllPages();
                this.setupSwiper();
                this.renderIndex();
                this.setupSearch();
                this.loadBookmark();
            });
        }, 10);
        
        // إعداد باقي المكونات
        this.setupServiceWorker();
        this.setupEventListeners();
        this.setupAudio();
        this.setupOfflineDetection();
        this.setupPWAInstall();
    }

    renderAllPages() {
        const container = document.getElementById('quran-pages');
        let html = '';
        for (let i = 1; i <= 604; i++) {
            html += `
                <div class="swiper-slide">
                    <img src="images/${i}.webp" class="quran-page-img" loading="lazy" alt="صفحة ${i}" onerror="this.src='images/${i}.jpg'">
                </div>
            `;
        }
        container.innerHTML = html;
    }

    async loadData() {
        try {
            const response = await fetch('quran_data.json');
            const data = await response.json();
            this.quranData = data.data;
            
            // إنشاء فهرس السور
            this.surahIndex = this.quranData.surahs.map(surah => ({
                id: surah.number,
                name: surah.name,
                englishName: surah.englishName,
                ayahs: surah.ayahs.length,
                type: surah.revelationType === 'Meccan' ? 'makkah' : 'madinah',
                startPage: surah.ayahs[0].page,
                endPage: surah.ayahs[surah.ayahs.length - 1].page
            }));

            // إنشاء فهرس الأجزاء
            this.createJuzIndex();
            
            // إنشاء فهرس الصفحات
            this.createPagesIndex();
        } catch (error) {
            console.error('Error loading Quran data:', error);
        }
    }

    createJuzIndex() {
        this.juzIndex = [];
        for (let i = 1; i <= 30; i++) {
            const juzAyahs = [];
            this.quranData.surahs.forEach(surah => {
                surah.ayahs.forEach(ayah => {
                    if (ayah.juz === i) {
                        juzAyahs.push(ayah);
                    }
                });
            });
            
            if (juzAyahs.length > 0) {
                const startPage = juzAyahs[0].page;
                const endPage = juzAyahs[juzAyahs.length - 1].page;
                this.juzIndex.push({
                    id: i,
                    name: `الجزء ${this.numberToArabic(i)}`,
                    startPage: startPage,
                    endPage: endPage,
                    pageRange: `من الصفحة ${startPage} إلى ${endPage}`
                });
            }
        }
    }

    createPagesIndex() {
        this.pagesIndex = [];
        const pageSurahMap = {};
        
        this.quranData.surahs.forEach(surah => {
            surah.ayahs.forEach(ayah => {
                const page = ayah.page;
                if (!pageSurahMap[page]) {
                    pageSurahMap[page] = new Set();
                }
                pageSurahMap[page].add(surah.number);
            });
        });
        
        for (let page = 1; page <= this.totalPages; page++) {
            const surahsOnPage = Array.from(pageSurahMap[page] || []);
            const surahNames = surahsOnPage.map(num => {
                const surah = this.surahIndex.find(s => s.id === num);
                return surah ? surah.name : '';
            }).filter(name => name);
            
            const juz = this.getJuzByPage(page);
            
            this.pagesIndex.push({
                page: page,
                surahs: surahNames,
                juz: juz
            });
        }
    }

    setupSwiper() {
        if (this.swiper) {
            this.swiper.destroy(true, true);
        }
        
        this.swiper = new Swiper('.swiper', {
            direction: 'horizontal',
            loop: false,
            speed: 300,
            resistanceRatio: 0,
            longSwipesRatio: 0.1,
            threshold: 10,
            followFinger: true,
            slidesPerView: 1,
            centeredSlides: true,
            spaceBetween: 0,
            initialSlide: this.currentPage - 1,
            on: {
                init: () => {
                    console.log('Swiper initialized');
                },
                slideChange: () => {
                    this.currentPage = this.swiper.activeIndex + 1;
                    this.updateHeaderInfo(this.currentPage);
                    this.saveLastPage();
                    
                    if (this.isPlaying && this.currentAudioPage !== this.currentPage) {
                        this.playAudioForPage(this.currentPage);
                    }
                }
            }
        });
    }

    updateHeaderInfo(pageNumber) {
        const pageNum = parseInt(pageNumber);
        const surahInfo = this.getSurahByPage(pageNum);
        const juzInfo = this.getJuzByPage(pageNum);
        
        const surahEl = document.getElementById('surah-name');
        const juzEl = document.getElementById('juz-info');
        const pageEl = document.getElementById('page-num');
        
        if (surahEl) surahEl.textContent = surahInfo || '---';
        if (juzEl) juzEl.textContent = juzInfo ? `الجزء ${juzInfo}` : '---';
        if (pageEl) pageEl.textContent = `صفحة ${pageNum}`;
    }

    getSurahByPage(pageNum) {
        if (!this.surahIndex.length) {
            // بيانات افتراضية للصفحة الأولى
            if (pageNum === 1) return 'سورة الفاتحة';
            return null;
        }
        
        for (const surah of this.surahIndex) {
            if (pageNum >= surah.startPage && pageNum <= surah.endPage) {
                return `سورة ${surah.name}`;
            }
        }
        return null;
    }

    getJuzByPage(pageNum) {
        if (!this.juzIndex.length) {
            // بيانات افتراضية للصفحة الأولى
            if (pageNum === 1) return '١';
            return null;
        }
        
        for (const juz of this.juzIndex) {
            if (pageNum >= juz.startPage && pageNum <= juz.endPage) {
                return this.numberToArabic(juz.id);
            }
        }
        return null;
    }

    renderIndex() {
        if (!this.surahIndex.length) return;
        
        // السور
        const surahList = document.getElementById('surah-list');
        if (surahList) {
            surahList.innerHTML = this.surahIndex.map(s => `
                <div class="index-item" onclick="quranApp.goToPage(${s.startPage}); quranApp.closeOverlay('index-overlay')">
                    <div class="item-number">${s.id}</div>
                    <div class="item-details">
                        <div style="font-weight:bold;">سورة ${s.name}</div>
                        <div style="font-size:0.8rem; color:grey;">${s.type === 'makkah' ? 'مكية' : 'مدنية'} - آياتها ${s.ayahs}</div>
                    </div>
                    <div style="color:#c9a050; font-weight:bold;">ص ${s.startPage}</div>
                </div>
            `).join('');
        }

        // الأجزاء
        const juzList = document.getElementById('juz-list');
        if (juzList) {
            let juzHTML = '';
            const juzStartPages = [2, 22, 42, 62, 82, 102, 122, 142, 162, 182, 202, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582];
            for (let i = 1; i <= 30; i++) {
                juzHTML += `
                    <div class="index-item" onclick="quranApp.goToPage(${juzStartPages[i-1]}); quranApp.closeOverlay('index-overlay')">
                        <div class="item-number">${i}</div>
                        <div class="item-details">
                            <div style="font-weight:bold;">الجزء ${i}</div>
                            <div style="font-size:0.8rem; color:grey;">بداية من صفحة ${juzStartPages[i-1]}</div>
                        </div>
                    </div>`;
            }
            juzList.innerHTML = juzHTML;
        }

        // الصفحات
        const pagesList = document.getElementById('pages-list');
        if (pagesList) {
            let pagesHTML = '';
            for (let i = 1; i <= 604; i++) {
                pagesHTML += `
                    <div class="index-item" onclick="quranApp.goToPage(${i}); quranApp.closeOverlay('index-overlay')">
                        <div class="item-number">${i}</div>
                        <div class="item-details">
                            <div style="font-weight:bold;">الصفحة ${i}</div>
                        </div>
                    </div>`;
            }
            pagesList.innerHTML = pagesHTML;
        }
    }

    numberToArabic(num) {
        const arabicNumbers = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        return num.toString().split('').map(digit => arabicNumbers[parseInt(digit)]).join('');
    }

    setupSearch() {
        const input = document.getElementById('search-input');
        if (input) {
            input.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }
        
        const overlay = document.getElementById('search-overlay');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target.classList.contains('overlay')) {
                    const input = document.getElementById('search-input');
                    if (input) {
                        input.value = '';
                        this.handleSearch('');
                    }
                }
            });
        }
    }

    normalizeText(text) {
        if (!text) return "";
        return text
            .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
            .replace(/[إأآا]/g, "ا")
            .replace(/ة/g, "ه")
            .replace(/ى/g, "ي")
            .trim();
    }

    handleSearch(query) {
        if (!this.quranData) return;
        
        const trimmedQuery = query.trim();
        const resultsDiv = document.getElementById('search-results-list');
        const countSpan = document.getElementById('results-count');
        
        if (!resultsDiv || !countSpan) return;
        
        if (trimmedQuery.length < 2) {
            resultsDiv.innerHTML = '<div class="empty-message">اكتب كلمتين أو أكثر للبحث في القرآن الكريم</div>';
            countSpan.textContent = '0 نتيجة';
            return;
        }

        const normalizedQuery = this.normalizeText(trimmedQuery);
        const results = [];
        
        this.quranData.surahs.forEach(surah => {
            surah.ayahs.forEach(ayah => {
                const normalizedText = this.normalizeText(ayah.text);
                if (normalizedText.includes(normalizedQuery)) {
                    results.push({
                        text: ayah.text,
                        surahNumber: surah.number,
                        surahName: surah.name,
                        ayahNumber: ayah.numberInSurah,
                        page: ayah.page
                    });
                }
            });
        });

        countSpan.textContent = `${results.length} نتيجة`;
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<div class="empty-message">لا توجد نتائج للبحث</div>';
            return;
        }

        const limitedResults = results.slice(0, 100);
        resultsDiv.innerHTML = limitedResults.map(result => `
            <div class="search-card" onclick="quranApp.goToPage(${result.page})">
                <div class="surah-tag">سورة ${result.surahName} | الصفحة ${result.page}</div>
                <div class="ayah-text">${result.text} ﴿${result.ayahNumber}﴾</div>
                <small style="color:#666; font-size:0.85rem;">الآية ${result.ayahNumber} من سورة ${result.surahName}</small>
            </div>
        `).join('');
    }

    setupEventListeners() {
        document.querySelector('.swiper')?.addEventListener('click', (e) => {
            if (e.target.closest('.nav-btn') || e.target.closest('#play-pause-btn') || 
                e.target.closest('#audio-progress') || e.target.closest('.audio-controls')) {
                return;
            }
            
            const topBar = document.getElementById('top-bar');
            const bottomBar = document.getElementById('bottom-bar');
            
            if (!topBar || !bottomBar) return;
            
            if (topBar.classList.contains('hidden')) {
                topBar.classList.remove('hidden');
                bottomBar.classList.remove('hidden');
                topBar.style.transform = 'translateY(0)';
                bottomBar.style.transform = 'translateY(0)';
            } else {
                topBar.classList.add('hidden');
                bottomBar.classList.add('hidden');
                topBar.style.transform = 'translateY(-100%)';
                bottomBar.style.transform = 'translateY(100%)';
            }
        });
        
        if (this.audio) {
            this.audio.addEventListener('timeupdate', () => {
                this.updateAudioProgress();
            });
            
            this.audio.addEventListener('ended', () => {
                this.isPlaying = false;
                this.updateAudioButton();
            });
            
            this.audio.addEventListener('loadeddata', () => {
                this.updateAudioProgress();
            });
        }
        
        setInterval(() => {
            this.updateAudioTime();
        }, 1000);
    }

    setupAudio() {
        const playBtn = document.getElementById('play-pause-btn');
        const audioToggle = document.getElementById('audio-toggle');
        
        if (playBtn) playBtn.textContent = '▶️';
        if (audioToggle) audioToggle.textContent = '🔇';
        
        this.updateAudioButton();
    }

    toggleAudio() {
        if (this.isPlaying) {
            this.pauseAudio();
        } else {
            this.playAudioForPage(this.currentPage);
        }
    }

    playAudioForPage(page) {
        const pageStr = page.toString().padStart(3, '0');
        const audioUrl = `audio/Page${pageStr}.mp3`;
        
        if (!this.audio) return;
        
        console.log(`Loading audio from: ${audioUrl}`);
        this.audio.src = audioUrl;
        this.currentAudioPage = page;
        
        this.audio.onerror = () => {
            console.error('Failed to load audio file:', audioUrl);
            this.isPlaying = false;
            this.updateAudioButton();
        };
        
        this.audio.play().then(() => {
            this.isPlaying = true;
            this.updateAudioButton();
        }).catch(error => {
            console.error('Error playing audio:', error);
            this.isPlaying = false;
            this.updateAudioButton();
        });
    }

    pauseAudio() {
        if (this.audio) {
            this.audio.pause();
            this.isPlaying = false;
            this.updateAudioButton();
        }
    }

    updateAudioButton() {
        const playBtn = document.getElementById('play-pause-btn');
        const audioToggle = document.getElementById('audio-toggle');
        
        if (this.isPlaying) {
            if (playBtn) playBtn.textContent = '⏸️';
            if (audioToggle) audioToggle.textContent = '🔊';
        } else {
            if (playBtn) playBtn.textContent = '▶️';
            if (audioToggle) audioToggle.textContent = '🔇';
        }
    }

    updateAudioProgress() {
        const progress = document.getElementById('audio-progress');
        if (progress && this.audio && this.audio.duration) {
            const value = (this.audio.currentTime / this.audio.duration) * 100;
            progress.value = value;
        }
    }

    updateAudioTime() {
        const timeSpan = document.getElementById('audio-time');
        if (!timeSpan || !this.audio) return;
        
        if (this.audio.duration && !isNaN(this.audio.duration)) {
            const current = Math.floor(this.audio.currentTime);
            const total = Math.floor(this.audio.duration);
            
            const currentStr = this.formatTime(current);
            const totalStr = this.formatTime(total);
            
            timeSpan.textContent = `${currentStr} / ${totalStr}`;
        } else {
            timeSpan.textContent = '00:00';
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    seekAudio(value) {
        if (this.audio && this.audio.duration) {
            const time = (value / 100) * this.audio.duration;
            this.audio.currentTime = time;
        }
    }

    goToPage(pageNumber) {
        const page = parseInt(pageNumber);
        if (page >= 1 && page <= this.totalPages) {
            if (this.swiper) {
                this.swiper.slideTo(page - 1);
                this.updateHeaderInfo(page);
                this.closeAllOverlays();
                
                if (this.isPlaying && this.currentAudioPage !== page) {
                    this.pauseAudio();
                }
            } else {
                // إذا لم يكن السوايبر جاهزاً، نحدث الصورة مباشرة
                const container = document.getElementById('quran-pages');
                if (container) {
                    container.innerHTML = `
                        <div class="swiper-slide">
                            <img src="images/${page}.webp" class="quran-page-img" alt="صفحة ${page}" onerror="this.src='images/${page}.jpg'">
                        </div>
                    `;
                    this.currentPage = page;
                    this.updateHeaderInfo(page);
                    this.saveLastPage();
                }
            }
            this.closeAllOverlays();
        }
    }

    openOverlay(id) {
        const overlay = document.getElementById(id);
        if (overlay) {
            overlay.classList.remove('hidden');
            if (id === 'search-overlay') {
                document.getElementById('search-input')?.focus();
            } else if (id === 'bookmark-overlay') {
                this.loadBookmarks();
            }
        }
    }

    closeOverlay(id) {
        const overlay = document.getElementById(id);
        if (overlay) {
            overlay.classList.add('hidden');
            if (id === 'search-overlay') {
                const input = document.getElementById('search-input');
                if (input) {
                    input.value = '';
                    this.handleSearch('');
                }
            }
        }
    }

    closeAllOverlays() {
        document.querySelectorAll('.overlay').forEach(overlay => {
            overlay.classList.add('hidden');
        });
    }

    showTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.remove('active');
            el.style.display = 'none';
        });

        const selected = document.getElementById(`${tabName}-list`);
        if (selected) {
            selected.classList.add('active');
            selected.style.display = 'block';
        }

        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        if (event && event.currentTarget) {
            event.currentTarget.classList.add('active');
        }
    }

    saveBookmark() {
        const bookmark = {
            page: this.currentPage,
            date: new Date().toLocaleString('ar-SA'),
            surah: this.getSurahByPage(this.currentPage),
            juz: this.getJuzByPage(this.currentPage)
        };
        
        let bookmarks = JSON.parse(localStorage.getItem('quranBookmarks') || '[]');
        bookmarks = bookmarks.filter(b => b.page !== bookmark.page);
        bookmarks.unshift(bookmark);
        bookmarks = bookmarks.slice(0, 50);
        
        localStorage.setItem('quranBookmarks', JSON.stringify(bookmarks));
        this.showNotification(`تم حفظ الصفحة ${this.currentPage} في العلامات ✓`);
    }

    loadBookmarks() {
        const bookmarks = JSON.parse(localStorage.getItem('quranBookmarks') || '[]');
        const list = document.getElementById('bookmarks-list');
        
        if (!list) return;
        
        if (bookmarks.length === 0) {
            list.innerHTML = '<div class="empty-message">لا توجد علامات محفوظة</div>';
            return;
        }
        
        list.innerHTML = bookmarks.map((bookmark, index) => `
            <div class="bookmark-item" onclick="quranApp.goToPage(${bookmark.page})">
                <div>
                    <strong>${bookmark.surah || 'صفحة ' + bookmark.page}</strong>
                    <div style="font-size:0.9rem; color:#888; margin-top:3px;">
                        ${bookmark.juz ? `الجزء ${bookmark.juz}` : ''} | الصفحة ${bookmark.page}
                    </div>
                    <div class="bookmark-date">${bookmark.date}</div>
                </div>
                <span style="color:var(--gold); font-size:1.1rem; font-weight:bold;">${index + 1}</span>
            </div>
        `).join('');
    }

    saveLastPage() {
        localStorage.setItem('lastQuranPage', this.currentPage);
    }

    loadBookmark() {
        const lastPage = parseInt(localStorage.getItem('lastQuranPage') || '1');
        const savedPage = Math.min(Math.max(lastPage, 1), this.totalPages);
        this.goToPage(savedPage);
    }

    toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        
        const themeBtn = document.getElementById('theme-toggle-settings');
        if (themeBtn) themeBtn.textContent = isDark ? '☀️' : '🌙';
        
        const themeColor = isDark ? '#121212' : '#c9a050';
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
    }

    setupOfflineDetection() {
        if (!navigator.onLine) {
            this.showNotification('أنت تعمل بدون إنترنت - الصفحات المحفوظة فقط', 'info');
        }

        window.addEventListener('online', () => {
            this.showNotification('تم استعادة الاتصال بالإنترنت', 'success');
        });

        window.addEventListener('offline', () => {
            this.showNotification('أنت الآن غير متصل بالإنترنت', 'warning');
        });
    }

    setupPWAInstall() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallPrompt();
        });

        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            this.hideInstallPrompt();
            this.showNotification('✅ تم تثبيت التطبيق بنجاح على جهازك', 'success');
        });
    }

    showInstallPrompt() {
        const installPrompt = document.getElementById('install-prompt');
        if (installPrompt && this.deferredPrompt) {
            installPrompt.classList.remove('hidden');
        }
    }

    hideInstallPrompt() {
        const installPrompt = document.getElementById('install-prompt');
        if (installPrompt) {
            installPrompt.classList.add('hidden');
        }
    }

    async installPWA() {
        if (!this.deferredPrompt) {
            this.showNotification('التطبيق مثبت بالفعل أو غير متوفر', 'info');
            return;
        }

        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            console.log('✅ User accepted the install prompt');
        }
        
        this.deferredPrompt = null;
        this.hideInstallPrompt();
    }

    async clearCache() {
        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                for (const cacheName of cacheNames) {
                    if (cacheName.includes('dynamic') || cacheName.includes('images')) {
                        await caches.delete(cacheName);
                    }
                }
                this.showNotification('تم مسح التخزين المؤقت بنجاح', 'success');
                this.updateCacheSize();
            } catch (error) {
                console.error('Error clearing cache:', error);
                this.showNotification('فشل في مسح التخزين المؤقت', 'error');
            }
        }
    }

    async updateCacheSize() {
        if ('caches' in window) {
            try {
                let totalSize = 0;
                const cacheNames = await caches.keys();
                
                for (const cacheName of cacheNames) {
                    const cache = await caches.open(cacheName);
                    const keys = await cache.keys();
                    
                    for (const request of keys) {
                        const response = await cache.match(request);
                        if (response) {
                            const clone = response.clone();
                            const blob = await clone.blob();
                            totalSize += blob.size;
                        }
                    }
                }
                
                const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
                const cacheEl = document.getElementById('cache-size');
                if (cacheEl) cacheEl.textContent = `${sizeInMB} MB`;
            } catch (error) {
                console.error('Error calculating cache size:', error);
            }
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#d32f2f' : type === 'warning' ? '#f57c00' : type === 'info' ? '#0288d1' : 'var(--gold)'};
            color: white;
            padding: 12px 24px;
            border-radius: 30px;
            z-index: 3000;
            animation: fadeInOut 3s ease-in-out;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 80%;
            word-wrap: break-word;
            direction: rtl;
            font-size: 0.95rem;
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').catch(error => {
                    console.log('ServiceWorker registration failed:', error);
                });
            });
        }
    }
}

// إنشاء التطبيق فوراً
let quranApp;

// بدء التشغيل فور تحميل الصفحة
(function initApp() {
    quranApp = new QuranApp();
    
    // تعيين الدوال العامة
    window.quranApp = quranApp;
    window.openOverlay = (id) => quranApp.openOverlay(id);
    window.closeOverlay = (id) => quranApp.closeOverlay(id);
    window.showTab = (tabName) => quranApp.showTab(tabName);
    window.toggleTheme = () => quranApp.toggleTheme();
    window.saveBookmark = () => quranApp.saveBookmark();
    
    // تحميل السمة المحفوظة
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const themeBtn = document.getElementById('theme-toggle-settings');
        if (themeBtn) themeBtn.textContent = '☀️';
    }
    
    // إعداد أحداث الأزرار
    setTimeout(() => {
        const installBtn = document.getElementById('install-button');
        if (installBtn) {
            installBtn.addEventListener('click', () => quranApp.installPWA());
        }
        
        const installClose = document.getElementById('install-close');
        if (installClose) {
            installClose.addEventListener('click', () => {
                document.getElementById('install-prompt')?.classList.add('hidden');
            });
        }
        
        const updateClose = document.getElementById('update-close');
        if (updateClose) {
            updateClose.addEventListener('click', () => {
                document.getElementById('update-notification')?.classList.add('hidden');
            });
        }
        
        // حساب حجم الكاش
        quranApp.updateCacheSize();
    }, 1000);
    
    // إغلاق اللوحات بالضغط خارجها
    document.querySelectorAll('.overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.add('hidden');
            }
        });
    });
})();

// إضافة الأنيميشن
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        15% { opacity: 1; transform: translateX(-50%) translateY(0); }
        85% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    }
`;
document.head.appendChild(style);