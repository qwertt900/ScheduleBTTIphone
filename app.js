const API_KEY = 'AIzaSyBmurjffl_g4izAc8QzaLqeGL3n9sAmD_A'; 
const SPREADSHEET_ID = '1LsjCmsElzfQr2kJWn5JBeKVTh66bR7zxIOGZgqoFCAY';

const RANGE_GROUPS = "'Расписание'!E7:E";
const RANGE_TEACHER_LAST = "'Расписание'!I7:I";
const RANGE_TEACHER_FIRST = "'Расписание'!J7:J";
const RANGE_TEACHER_MIDDLE = "'Расписание'!K7:K";
const RANGE_SCHEDULE = "'Расписание'!A8:K"; 

// Экранирование HTML, чтобы данные из таблицы не ломали разметку
function escapeHtml(str) {
    return String(str === undefined || str === null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let currentDate = new Date();
let currentType = '';
let currentName = '';
let cachedData = null; 
let allGroups = [];
let allTeachers = [];
let currentScreenId = 'screen-main';   // текущий активный экран
let lastScreen = 'screen-main';        // экран для восстановления после перезагрузки

// ---- ИЗБРАННОЕ ----
// Хранится независимо от последнего открытого расписания:
// favorite = {type:'group'|'teacher', name:'ИС-11'} или null
function getFavorite() {
    try {
        const raw = localStorage.getItem('btt_favorite');
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function setFavorite(type, name) {
    try {
        if (type && name) localStorage.setItem('btt_favorite', JSON.stringify({ type, name }));
        else localStorage.removeItem('btt_favorite');
    } catch (e) { /* игнорируем */ }
}

function isFavorite(type, name) {
    const fav = getFavorite();
    return !!(fav && fav.type === type && fav.name === name);
}

// Переключение избранного для текущего расписания
function toggleFavoriteForCurrent() {
    if (!currentType || !currentName) return;
    if (isFavorite(currentType, currentName)) {
        setFavorite(null, null);
    } else {
        setFavorite(currentType, currentName);
    }
    updateFavoriteUI();
    updateSettingsUI();
}

// Обновление кнопки-звезды на экране расписания
function updateFavoriteUI() {
    const btn = document.getElementById('favorite-btn');
    if (!btn) return;
    const fav = isFavorite(currentType, currentName);
    btn.textContent = fav ? '⭐' : '☆';
    btn.title = fav ? 'Убрать из избранного' : 'Добавить в избранное';
}

// ---- ТЕМНАЯ ТЕМА ----
// Возможные значения: 'light' | 'dark'
function getTheme() {
    try { return localStorage.getItem('btt_theme') || 'light'; }
    catch (e) { return 'light'; }
}

function setTheme(theme) {
    try { localStorage.setItem('btt_theme', theme); } catch (e) { /* игнорируем */ }
    applyTheme(theme);
    updateSettingsUI();
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

function applySavedTheme() {
    applyTheme(getTheme());
}

// Сохранение/восстановление текущего выбора (чтобы после перезагрузки не сбрасывалось в начало)
function saveState() {
    try {
        localStorage.setItem('btt_state', JSON.stringify({
            type: currentType,
            name: currentName,
            date: currentDate.getTime(),
            screen: currentScreenId
        }));
    } catch (e) { /* localStorage недоступен — игнорируем */ }
}

function restoreState() {
    try {
        const raw = localStorage.getItem('btt_state');
        if (!raw) return;
        const st = JSON.parse(raw);
        if (st && st.type && st.name) {
            currentType = st.type;
            currentName = st.name;
            if (typeof st.date === 'number') currentDate = new Date(st.date);
            if (typeof st.screen === 'string') lastScreen = st.screen;
        }
    } catch (e) { /* повреждённые данные — игнорируем */ }
}

window.onload = () => {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    document.getElementById('current-date-main').innerText = currentDate.toLocaleDateString('ru-RU', options);
    loadStats();
    updateWeekUI();
    
    // Восстанавливаем состояние: последний экран + выбранный тип/имя + дата
    restoreState();
    applySavedTheme();
    updateSettingsUI();
    
    // Открываем тот экран, где пользователь был до перезагрузки
    const screenToOpen = (lastScreen && document.getElementById(lastScreen)) ? lastScreen : 'screen-main';
    
    if (screenToOpen === 'screen-schedule' && currentType && currentName) {
        // Экран расписания: нужно восстановить без сброса даты и без смены экрана через openSchedule
        document.getElementById('schedule-type').innerText = currentType === 'group' ? 'Группа' : 'Преподаватель';
        document.getElementById('schedule-name').innerText = currentName;
        updateFavoriteUI();
        updateWeekUI();
        showScreen('screen-schedule');
        loadSchedule();
    } else if (screenToOpen === 'screen-groups') {
        showScreen('screen-groups');
        if (allGroups.length === 0) loadGroups();
    } else if (screenToOpen === 'screen-teachers') {
        showScreen('screen-teachers');
        if (allTeachers.length === 0) loadTeachers();
    } else if (screenToOpen === 'screen-settings') {
        showScreen('screen-settings');
    } else {
        showScreen('screen-main');
    }
};

// ---- ЭКРАН НАСТРОЕК ----
function showSettingsScreen() {
    showScreen('screen-settings');
    updateSettingsUI();
}

function updateSettingsUI() {
    // Переключатель темы
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.checked = getTheme() === 'dark';

    // Список избранного в настройках
    const list = document.getElementById('favorites-list');
    if (list) {
        const fav = getFavorite();
        if (fav && fav.type && fav.name) {
            // Имя хранится в data-name, а не в textContent — чтобы звезда и кнопка ✕ не попадали в значение
            list.innerHTML = `
                <li onclick="openSchedule('${fav.type}', document.getElementById('fav-name').value)">
                    <span>⭐ ${escapeHtml(fav.name)}</span>
                    <input type="hidden" id="fav-name" value="${escapeHtml(fav.name)}">
                    <button class="btn-remove" onclick="event.stopPropagation(); removeFavorite()">✕</button>
                </li>`;
        } else {
            list.innerHTML = '<li class="empty">Нет избранного. Откройте расписание и нажмите ☆</li>';
        }
    }
}

function removeFavorite() {
    setFavorite(null, null);
    updateSettingsUI();
    updateFavoriteUI();
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    
    currentScreenId = id;
    lastScreen = id;
    saveState();
    
    // Навигация видна всегда
    const nav = document.getElementById('bottom-nav');
    nav.style.display = 'flex';

    // Подсветка иконки в меню
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    if (id === 'screen-main') document.querySelectorAll('.nav-item')[0].classList.add('active');
    if (id === 'screen-schedule') document.querySelectorAll('.nav-item')[1].classList.add('active');
    if (id === 'screen-settings') document.querySelectorAll('.nav-item')[2].classList.add('active');
    
    if (id === 'screen-groups' && allGroups.length === 0) loadGroups();
    if (id === 'screen-teachers' && allTeachers.length === 0) loadTeachers();
    if (id === 'screen-settings') updateSettingsUI();
}

async function fetchSheet(range) {
    const cacheKey = 'btt_cache_' + range;
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Ошибка сети');
        
        const data = await response.json();
        // Защита от undefined
        const values = (data.values || []).map(row => 
            row.map(cell => (cell === undefined || cell === null) ? "" : cell)
        );
        
        localStorage.setItem(cacheKey, JSON.stringify(values));
        return values;

    } catch (error) {
        console.warn("Нет интернета, загружаем из кэша...", error);
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        } else {
            throw new Error('Нет интернета и нет сохраненных данных');
        }
    }
}

async function loadStats() {
    try {
        showLoader(true);
        const groupsData = await fetchSheet(RANGE_GROUPS);
        const last = await fetchSheet(RANGE_TEACHER_LAST);
        const first = await fetchSheet(RANGE_TEACHER_FIRST);
        const middle = await fetchSheet(RANGE_TEACHER_MIDDLE);

        const uniqueGroups = new Set(groupsData.map(r => r[0]).filter(g => g && g.length > 2 && g !== '- -'));
        document.getElementById('stats-groups').innerText = uniqueGroups.size;

        const uniqueTeachers = new Set();
        for (let i = 0; i < last.length; i++) {
            let l = last[i] ? last[i][0] : '';
            let f = first[i] ? first[i][0] : '';
            let m = middle[i] ? middle[i][0] : '';
            let full = `${l} ${f} ${m}`.replace(/\s+/g, ' ').trim();
            if (full && full !== '- - -') uniqueTeachers.add(full);
        }
        document.getElementById('stats-teachers').innerText = uniqueTeachers.size;
        
        let now = new Date();
        let dateStr = now.toLocaleDateString('ru-RU') + ' ' + now.toLocaleTimeString('ru-RU');
        document.getElementById('last-update').innerText = 'Последнее обновление: ' + dateStr;

    } catch (e) { 
        console.error(e); 
        document.getElementById('stats-groups').innerText = '?';
        document.getElementById('stats-teachers').innerText = '?';
    } finally {
        showLoader(false);
    }
}

async function loadGroups() {
    showLoader(true);
    try {
        const data = await fetchSheet(RANGE_GROUPS);
        const uniqueGroups = new Set();
        data.forEach(row => {
            let g = row[0] ? row[0].trim() : "";
            let cleanCheck = g.replace(/[\s\-—_.,]+/g, '');
            if (cleanCheck !== '' && !g.includes('undefined')) uniqueGroups.add(g);
        });

        allGroups = Array.from(uniqueGroups).sort();
        document.getElementById('group-list').innerHTML = allGroups.map(g => 
            `<div class="grid-item" onclick="openSchedule('group', this.textContent)">${escapeHtml(g)}</div>`
        ).join('');
    } catch (e) { alert('Ошибка загрузки данных'); }
    showLoader(false);
}

async function loadTeachers() {
    showLoader(true);
    try {
        const last = await fetchSheet(RANGE_TEACHER_LAST);
        const first = await fetchSheet(RANGE_TEACHER_FIRST);
        const middle = await fetchSheet(RANGE_TEACHER_MIDDLE);
        const uniqueTeachers = new Set();
        
        for (let i = 0; i < last.length; i++) {
            let l = last[i] ? last[i][0] : "";
            let f = first[i] ? first[i][0] : "";
            let m = middle[i] ? middle[i][0] : "";

            let full = `${l} ${f} ${m}`.replace(/\s+/g, ' ').trim();
            let cleanCheck = full.replace(/[\s\-—_.,]+/g, '');

            if (cleanCheck !== '' && !full.includes('undefined') && full !== '- - -') {
                uniqueTeachers.add(full);
            }
        }
        allTeachers = Array.from(uniqueTeachers).sort();
        document.getElementById('teacher-list').innerHTML = allTeachers.map(t => 
            `<li onclick="openSchedule('teacher', this.textContent)">${escapeHtml(t)}</li>`
        ).join('');
    } catch (e) { alert('Ошибка загрузки данных'); }
    showLoader(false);
}

function openSchedule(type, name, keepDate = false) {
    currentType = type;
    currentName = name;
    document.getElementById('schedule-type').innerText = type === 'group' ? 'Группа' : 'Преподаватель';
    document.getElementById('schedule-name').innerText = name;
    // Сбрасываем на сегодня только при новом выборе, а не при обновлении/возврате
    if (!keepDate) currentDate = new Date();
    saveState();
    updateFavoriteUI();
    updateWeekUI();
    showScreen('screen-schedule');
    loadSchedule();
}

function goToLastSchedule() {
    if (currentName === '') {
        showScreen('screen-groups'); 
    } else {
        showScreen('screen-schedule');
    }
}

function filterList(listId, query) {
    const parent = document.getElementById(listId);
    const items = parent.children;
    query = query.toLowerCase();
    for (let item of items) {
        item.style.display = item.innerText.toLowerCase().includes(query) ? '' : 'none';
    }
}

function goBack() {
    if (currentType === 'group') showScreen('screen-groups');
    else if (currentType === 'teacher') showScreen('screen-teachers');
    else showScreen('screen-main');
}

// ---- РАБОТА С ДАТАМИ ----
function getMonday(d) {
    d = new Date(d);
    var day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function updateWeekUI() {
    const monday = getMonday(currentDate);
    const daysContainer = document.getElementById('days-container');
    let html = '';
    const dayNames = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    
    for (let i = 0; i < 6; i++) {
        let d = new Date(monday);
        d.setDate(monday.getDate() + i);
        let isActive = d.getDate() === currentDate.getDate() && d.getMonth() === currentDate.getMonth();
        
        html += `
            <div class="day-item ${isActive ? 'active' : ''}" onclick="selectDay(${d.getTime()})">
                <div class="day-name">${dayNames[i]}</div>
                <div class="day-num">${d.getDate()}</div>
            </div>
        `;
    }
    daysContainer.innerHTML = html;

    let saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    
    const opt = { day: 'numeric', month: 'short' };
    let strMon = monday.toLocaleDateString('ru-RU', opt).replace('.', '');
    let strSat = saturday.toLocaleDateString('ru-RU', opt).replace('.', '');
    
    document.getElementById('week-range').innerText = `${strMon} – ${strSat}.`;
}

function selectDay(timestamp) {
    currentDate = new Date(timestamp);
    saveState();
    updateWeekUI();
    loadSchedule();
}

function changeWeek(delta) {
    currentDate.setDate(currentDate.getDate() + (delta * 7));
    saveState();
    updateWeekUI();
    loadSchedule();
}

function getTimeForPair(pairNum, dayOfWeek, isDistance) {
    if (isDistance) {
        switch (pairNum) {
            case "1": return "8:30–9:30"; case "2": return "9:40–10:40";
            case "3": return "10:50–11:50"; case "4": return "12:00–13:00";
            default: return "";
        }
    }
    if (dayOfWeek === 1) {
        switch (pairNum) {
            case "0": return "8:30–9:15"; case "1": return "9:20–10:50";
            case "2": return "11:00–12:30"; case "3": return "13:15–14:45";
            case "4": return "14:55–16:25"; default: return "";
        }
    }
    if (dayOfWeek === 6) {
        switch (pairNum) {
            case "1": return "8:30–10:00"; case "2": return "10:10–11:40";
            case "3": return "11:50–13:20"; default: return "";
        }
    }
    switch (pairNum) {
        case "1": return "8:30–10:00"; case "2": return "10:10–11:40";
        case "3": return "12:25–13:55"; case "4": return "14:05–15:35";
        default: return "";
    }
}

async function loadSchedule() {
    showLoader(true);
    const targetDay = currentDate.getDate();
    const targetMonth = currentDate.getMonth() + 1;
    const targetYear = currentDate.getFullYear();
    const jsDay = currentDate.getDay(); 
    const ourDay = jsDay === 0 ? 7 : jsDay; 
    
    if (!cachedData) {
        try { 
            cachedData = await fetchSheet(RANGE_SCHEDULE); 
        } 
        catch (e) { 
            document.getElementById('schedule-list').innerHTML = '<p style="text-align:center; color:#888; margin-top:20px; font-size:14px;">Нет подключения к интернету.<br>Подключитесь к сети для первой загрузки.</p>';
            showLoader(false); 
            return; 
        }
    }

    let html = '';
    for (let row of cachedData) {
        if (row.length < 11) continue;
        
        let day = parseInt(row[0]), month = parseInt(row[1]), year = parseInt(row[2]);
        if (day !== targetDay || month !== targetMonth || year !== targetYear) continue;

        let pairNum = row[3] || '';
        let group = row[4] || '';
        let subject = row[6] || '';
        let room = row[7] || '';
        let teacher = `${row[8] || ''} ${row[9] || ''} ${row[10] || ''}`.replace(/\s+/g, ' ').trim();

        if (currentType === 'group' && group.toLowerCase() !== currentName.toLowerCase()) continue;
        if (currentType === 'teacher' && teacher.toLowerCase() !== currentName.toLowerCase()) continue;

        let numberStr = pairNum === '0' ? '' : pairNum + '.';
        let displayTeacher = currentType === 'teacher' ? group : teacher;
        
        let isDistance = subject.toLowerCase().includes('(до)') || subject.toLowerCase().includes('дистант');
        let timeStr = getTimeForPair(pairNum, ourDay, isDistance);

        html += `
            <div class="lesson-card">
                <div class="lesson-top">
                    <span class="lesson-num">${escapeHtml(numberStr)}</span>
                    <span class="lesson-title">${escapeHtml(subject)}</span>
                </div>
                <div class="lesson-time">${escapeHtml(timeStr)}</div>
                <div class="lesson-bottom">
                    <div class="lesson-teacher"><span style="color:#1A237E;margin-right:6px;">👤</span>${escapeHtml(displayTeacher)}</div>
                    <div class="lesson-room">${escapeHtml(room)}</div>
                </div>
            </div>
        `;
    }

    if (html === '') html = '<p style="text-align:center; color:#888; margin-top:20px; font-size:14px;">На этот день пар нет</p>';
    document.getElementById('schedule-list').innerHTML = html;
    showLoader(false);
}

function showLoader(show) {
    document.getElementById('loader').classList.toggle('active', show);
}

// ==========================================
// ЛОГИКА ОБНОВЛЕНИЯ ДАННЫХ (Без перезагрузки страницы)
// ==========================================
// При обновлении из main-screen — данные чистятся, но выбор группы/преподавателя сохраняем,
// чтобы кнопка “Расписание” в нижнем меню не вела обратно к спискам
window.updateData = async () => {
    cachedData = null;
    allGroups = [];
    allTeachers = [];
    
    localStorage.removeItem('btt_cache_' + RANGE_GROUPS);
    localStorage.removeItem('btt_cache_' + RANGE_TEACHER_LAST);
    localStorage.removeItem('btt_cache_' + RANGE_TEACHER_FIRST);
    localStorage.removeItem('btt_cache_' + RANGE_TEACHER_MIDDLE);
    localStorage.removeItem('btt_cache_' + RANGE_SCHEDULE);
    
    await loadStats();
    
    if (document.getElementById('screen-groups').classList.contains('active')) await loadGroups();
    else if (document.getElementById('screen-teachers').classList.contains('active')) await loadTeachers();
    else if (document.getElementById('screen-schedule').classList.contains('active')) await loadSchedule();
};

// ==========================================
// ЛОГИКА PWA (Только установка и фоновое обновление)
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
            reg.update();
        });
    });
}

// Логика установки приложения
let deferredPrompt;
const installBtn = document.getElementById('install-btn');
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

if (isIOS && !isStandalone) installBtn.style.display = 'block';

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!isStandalone) installBtn.style.display = 'block';
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (isIOS) {
            alert("Чтобы установить приложение на iPhone:\n\n1. Нажмите кнопку 'Поделиться' в Safari.\n2. Выберите 'На экран «Домой»'.\n3. Нажмите 'Добавить'.");
            return;
        }
        if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            installBtn.style.display = 'none';
        }
    });
}

window.addEventListener('appinstalled', () => {
    installBtn.style.display = 'none';
});