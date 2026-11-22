/* 浩海 study 学习增强包 v1
   功能：Ctrl/Command + K 快捷导航；番茄钟 + 待办；阅读进度条
   依赖：只依赖页面已有的 showToast / p0Enter / p0Show / enterMain / toggleAIPanel / openDraftBox
   说明：重复加载不会重复插入界面。
*/
(function () {
  'use strict';

  var TASK_KEY = 'hh_plus_tasks_v1';
  var FOCUS_KEY = 'hh_plus_focus_v1';
  var MODES = { focus: 25, short: 5, long: 15 };

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function safeParse(text, fallback) {
    try {
      var value = JSON.parse(text);
      return value == null ? fallback : value;
    } catch (e) {
      return fallback;
    }
  }

  function storeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? safeParse(raw, fallback) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function storeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function toast(message, type) {
    if (typeof showToast === 'function') showToast(message, type || 'info');
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  ready(function init() {
    if (window.__HH_PLUS_READY__) return;
    window.__HH_PLUS_READY__ = true;

    injectHTML();
    initReadingProgress();
    initFocusPanel();
    initCommandPalette();
  });

  function injectHTML() {
    if (document.getElementById('hh-reading-progress')) return;

    var html = '';
    html += '<div id="hh-reading-progress"></div>';

    html += '<button id="hh-fab" type="button" title="学习专注面板 / Ctrl+K 快捷导航">FOCUS</button>';

    html += '<div id="hh-focus-panel" aria-label="学习专注面板">';
    html += '  <div class="hh-focus-head"><span>学习专注</span><span class="hh-focus-close" id="hh-focus-close">&times;</span></div>';
    html += '  <div class="hh-focus-body">';
    html += '    <div class="hh-timer-wrap">';
    html += '      <div class="hh-timer-ring" id="hh-timer-ring"><div class="hh-timer-inner"><span class="hh-timer-time" id="hh-timer-time">25:00</span></div></div>';
    html += '      <div class="hh-timer-meta">';
    html += '        <div class="hh-timer-title" id="hh-timer-title">专注中</div>';
    html += '        <div class="hh-timer-desc">25 分钟学习 + 5 分钟休息，节奏更稳。</div>';
    html += '        <div class="hh-today-stat" id="hh-today-stat">今日专注 0 分钟</div>';
    html += '      </div>';
    html += '    </div>';
    html += '    <div class="hh-mode-row">';
    html += '      <button class="hh-mode-btn active" type="button" data-mode="focus">专注 25</button>';
    html += '      <button class="hh-mode-btn" type="button" data-mode="short">休息 5</button>';
    html += '      <button class="hh-mode-btn" type="button" data-mode="long">休息 15</button>';
    html += '    </div>';
    html += '    <div class="hh-control-row">';
    html += '      <button class="hh-main-btn" id="hh-timer-toggle" type="button">开始专注</button>';
    html += '      <button class="hh-mini-btn" id="hh-timer-reset" type="button">重置</button>';
    html += '    </div>';
    html += '    <div class="hh-task-add">';
    html += '      <input class="hh-task-input" id="hh-task-input" maxlength="80" placeholder="添加今日学习任务">';
    html += '      <button class="hh-add-btn" id="hh-task-add" type="button">添加</button>';
    html += '    </div>';
    html += '    <div class="hh-task-list" id="hh-task-list"></div>';
    html += '  </div>';
    html += '</div>';

    html += '<div id="hh-cmd-mask" aria-label="快捷导航">';
    html += '  <div class="hh-cmd-box">';
    html += '    <div class="hh-cmd-input-wrap">';
    html += '      <input id="hh-cmd-input" autocomplete="off" placeholder="输入模块名或当前页面内容，快速跳转">';
    html += '    </div>';
    html += '    <div class="hh-cmd-list" id="hh-cmd-list"></div>';
    html += '    <div class="hh-cmd-foot"><span>上下键选择</span><span>回车执行</span><span>Esc 关闭</span><span>Ctrl/Command + K 随时打开</span></div>';
    html += '  </div>';
    html += '</div>';

    document.body.insertAdjacentHTML('beforeend', html);
  }

  /* ---------------- 阅读进度条 ---------------- */
  function initReadingProgress() {
    var bar = document.getElementById('hh-reading-progress');
    if (!bar) return;
    var pending = false;

    function update() {
      var doc = document.documentElement;
      var max = Math.max(0, doc.scrollHeight - doc.clientHeight);
      var percent = max > 0 ? Math.min(100, Math.max(0, (doc.scrollTop / max) * 100)) : 0;
      bar.style.width = percent.toFixed(2) + '%';
      pending = false;
    }

    window.addEventListener('scroll', function () {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(update);
    }, { passive: true });

    window.addEventListener('resize', update);
    update();
  }

  /* ---------------- 番茄钟 + 任务 ---------------- */
  var Focus = {
    mode: 'focus',
    total: MODES.focus * 60,
    left: MODES.focus * 60,
    running: false,
    endAt: 0,
    timer: null,
    day: '',
    minutes: 0
  };

  function initFocusPanel() {
    var fab = document.getElementById('hh-fab');
    var panel = document.getElementById('hh-focus-panel');
    var close = document.getElementById('hh-focus-close');
    var toggleBtn = document.getElementById('hh-timer-toggle');
    var resetBtn = document.getElementById('hh-timer-reset');
    var input = document.getElementById('hh-task-input');
    var addBtn = document.getElementById('hh-task-add');
    var list = document.getElementById('hh-task-list');
    if (!fab || !panel) return;

    var saved = storeGet(FOCUS_KEY, {});
    if (saved && saved.day === todayKey()) {
      Focus.minutes = Number(saved.minutes) || 0;
      if (MODES[saved.mode]) Focus.mode = saved.mode;
    }
    Focus.day = todayKey();
    Focus.total = MODES[Focus.mode] * 60;
    Focus.left = Focus.total;

    fab.addEventListener('click', function () { panel.classList.toggle('open'); });
    close.addEventListener('click', function () { panel.classList.remove('open'); });

    Array.prototype.forEach.call(panel.querySelectorAll('.hh-mode-btn'), function (btn) {
      btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); });
    });

    toggleBtn.addEventListener('click', function () {
      if (Focus.running) pauseTimer(); else startTimer();
    });
    resetBtn.addEventListener('click', function () { resetTimer(); });

    addBtn.addEventListener('click', addTask);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addTask(); }
    });

    list.addEventListener('change', function (e) {
      if (e.target && e.target.matches('input[type="checkbox"]')) {
        var index = Number(e.target.getAttribute('data-index'));
        var tasks = storeGet(TASK_KEY, []);
        if (tasks[index]) {
          tasks[index].done = e.target.checked;
          storeSet(TASK_KEY, tasks);
          renderTasks();
          if (e.target.checked) toast('任务完成，继续保持', 'ok');
        }
      }
    });

    list.addEventListener('click', function (e) {
      var del = e.target && e.target.closest ? e.target.closest('.hh-task-del') : null;
      if (!del) return;
      var index = Number(del.getAttribute('data-index'));
      var tasks = storeGet(TASK_KEY, []);
      if (tasks[index]) {
        tasks.splice(index, 1);
        storeSet(TASK_KEY, tasks);
        renderTasks();
      }
    });

    renderTimer();
    renderTasks();
  }

  function persistFocus() {
    storeSet(FOCUS_KEY, { day: todayKey(), minutes: Focus.minutes, mode: Focus.mode });
  }

  function setMode(mode) {
    if (!MODES[mode]) return;
    pauseTimer(true);
    Focus.mode = mode;
    Focus.total = MODES[mode] * 60;
    Focus.left = Focus.total;
    persistFocus();
    renderTimer();
  }

  function startTimer() {
    if (Focus.running) return;
    Focus.running = true;
    Focus.endAt = Date.now() + Focus.left * 1000;
    Focus.timer = window.setInterval(tick, 250);
    var fab = document.getElementById('hh-fab');
    if (fab) fab.classList.add('running');
    renderTimer();
  }

  function pauseTimer(silent) {
    if (!Focus.running) return;
    Focus.left = Math.max(0, Math.ceil((Focus.endAt - Date.now()) / 1000));
    Focus.running = false;
    if (Focus.timer) window.clearInterval(Focus.timer);
    Focus.timer = null;
    var fab = document.getElementById('hh-fab');
    if (fab) fab.classList.remove('running');
    renderTimer();
    if (!silent) toast('已暂停，进度已保留', 'info');
  }

  function resetTimer() {
    pauseTimer(true);
    Focus.total = MODES[Focus.mode] * 60;
    Focus.left = Focus.total;
    renderTimer();
  }

  function tick() {
    if (!Focus.running) return;
    Focus.left = Math.max(0, Math.ceil((Focus.endAt - Date.now()) / 1000));
    renderTimer();
    if (Focus.left <= 0) finishTimer();
  }

  function finishTimer() {
    var finishedMode = Focus.mode;
    Focus.running = false;
    if (Focus.timer) window.clearInterval(Focus.timer);
    Focus.timer = null;
    var fab = document.getElementById('hh-fab');
    if (fab) fab.classList.remove('running');

    if (finishedMode === 'focus') {
      Focus.minutes += MODES.focus;
      persistFocus();
      toast('完成一个专注周期，休息 5 分钟吧', 'ok');
    } else {
      toast('休息结束，继续加油', 'ok');
    }

    Focus.total = MODES[Focus.mode] * 60;
    Focus.left = Focus.total;
    renderTimer();
  }

  function renderTimer() {
    var time = document.getElementById('hh-timer-time');
    var title = document.getElementById('hh-timer-title');
    var stat = document.getElementById('hh-today-stat');
    var ring = document.getElementById('hh-timer-ring');
    var toggle = document.getElementById('hh-timer-toggle');
    if (!time || !ring) return;

    var m = Math.floor(Focus.left / 60);
    var s = Focus.left % 60;
    time.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

    var percent = Focus.total > 0 ? (Focus.total - Focus.left) / Focus.total : 0;
    var deg = Math.max(0, Math.min(360, percent * 360));
    ring.style.background = 'conic-gradient(#667eea ' + deg + 'deg, rgba(102,126,234,0.14) 0deg)';

    if (title) title.textContent = Focus.running
      ? (Focus.mode === 'focus' ? '专注中' : '休息中')
      : (Focus.mode === 'focus' ? '准备专注' : '准备休息');

    if (stat) stat.textContent = '今日专注 ' + Focus.minutes + ' 分钟';

    if (toggle) toggle.textContent = Focus.running ? '暂停' : (Focus.mode === 'focus' ? '开始专注' : '开始休息');

    Array.prototype.forEach.call(document.querySelectorAll('.hh-mode-btn'), function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === Focus.mode);
    });
  }

  function addTask() {
    var input = document.getElementById('hh-task-input');
    if (!input) return;
    var text = String(input.value || '').trim();
    if (!text) { toast('先写点任务内容', 'info'); return; }
    var tasks = storeGet(TASK_KEY, []);
    if (!Array.isArray(tasks)) tasks = [];
    tasks.push({ text: text, done: false, time: Date.now() });
    storeSet(TASK_KEY, tasks);
    input.value = '';
    renderTasks();
    toast('任务已加入今日清单', 'ok');
  }

  function renderTasks() {
    var list = document.getElementById('hh-task-list');
    if (!list) return;
    var tasks = storeGet(TASK_KEY, []);
    if (!Array.isArray(tasks)) tasks = [];
    list.innerHTML = '';

    if (!tasks.length) {
      var empty = document.createElement('div');
      empty.className = 'hh-task-empty';
      empty.textContent = '还没有任务，先写下今天要完成的一件事';
      list.appendChild(empty);
      return;
    }

    tasks.forEach(function (task, index) {
      var row = document.createElement('div');
      row.className = 'hh-task-item' + (task.done ? ' done' : '');

      var check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !!task.done;
      check.setAttribute('data-index', String(index));

      var text = document.createElement('span');
      text.className = 'hh-task-text';
      text.textContent = task.text;

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'hh-task-del';
      del.setAttribute('data-index', String(index));
      del.textContent = 'x';

      row.appendChild(check);
      row.appendChild(text);
      row.appendChild(del);
      list.appendChild(row);
    });
  }

  /* ---------------- Ctrl/Command + K 快捷导航 ---------------- */
  var Command = {
    open: false,
    selected: 0,
    items: []
  };

  function initCommandPalette() {
    var mask = document.getElementById('hh-cmd-mask');
    var input = document.getElementById('hh-cmd-input');
    var list = document.getElementById('hh-cmd-list');
    if (!mask || !input || !list) return;

    document.addEventListener('keydown', function (e) {
      var key = String(e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    });

    mask.addEventListener('mousedown', function (e) {
      if (e.target === mask) closeCommandPalette();
    });

    input.addEventListener('input', function () {
      Command.selected = 0;
      renderCommands();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        Command.selected = Math.min(Command.items.length - 1, Command.selected + 1);
        renderCommands();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        Command.selected = Math.max(0, Command.selected - 1);
        renderCommands();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var item = Command.items[Command.selected];
        if (item && typeof item.run === 'function') {
          closeCommandPalette();
          item.run();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeCommandPalette();
      }
    });

    renderCommands();
  }

  function toggleCommandPalette() {
    var mask = document.getElementById('hh-cmd-mask');
    var input = document.getElementById('hh-cmd-input');
    if (!mask || !input) return;
    if (mask.classList.contains('open')) {
      closeCommandPalette();
    } else {
      mask.classList.add('open');
      Command.open = true;
      Command.selected = 0;
      input.value = '';
      renderCommands();
      window.setTimeout(function () { input.focus(); }, 20);
    }
  }

  function closeCommandPalette() {
    var mask = document.getElementById('hh-cmd-mask');
    if (mask) mask.classList.remove('open');
    Command.open = false;
  }

  function goModule(mod) {
    if (mod === 'all') {
      if (typeof enterMain === 'function' && isStartVisible()) enterMain('all');
      if (typeof p0Show === 'function') p0Show('all');
      return;
    }
    if (typeof p0Enter === 'function') p0Enter(mod);
    else if (typeof p0Show === 'function') p0Show(mod);
  }

  function isStartVisible() {
    var start = document.getElementById('start-screen');
    if (!start) return false;
    var style = window.getComputedStyle(start);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function baseCommands() {
    return [
      { group: '快速跳转', title: '资料 · 比赛 · 美景', sub: '回到原来的三个内容模块', keys: '资料 比赛 美景 home all ziliao', badge: '01', run: function () { goModule('all'); } },
      { group: '快速跳转', title: '课程中心', sub: '按课程找资料、评价和知识点', keys: '课程 学习 course kecheng', badge: '02', run: function () { goModule('courses'); } },
      { group: '快速跳转', title: '组队广场', sub: '找队友、发队伍、申请加入', keys: '组队 队伍 比赛 招募 team zudu', badge: '03', run: function () { goModule('teams'); } },
      { group: '快速跳转', title: '失物招领', sub: '发布丢失/拾到信息并认领', keys: '失物 招领 互助 丢失 拾到 lost', badge: '04', run: function () { goModule('lostfound'); } },
      { group: '快速跳转', title: '数据看板', sub: '查看访问、下载、AI 和内容数据', keys: '数据 看板 统计 stats dash', badge: '05', run: function () { goModule('stats'); } },
      { group: '快速跳转', title: '我的空间', sub: '我的认证、发布、申请和收藏线索', keys: '我的 个人 认证 发布 mine', badge: '06', run: function () { goModule('mine'); } },
      { group: '工具', title: '打开 AI 助手', sub: '直接向浩海 AI 提问', keys: 'ai 助手 聊天 chat', badge: 'AI', run: function () { if (typeof toggleAIPanel === 'function') toggleAIPanel(); else toast('AI 助手暂未加载', 'err'); } },
      { group: '工具', title: '打开 AI 草稿箱', sub: '查看由 AI 生成但尚未发布的资料', keys: '草稿 笔记 word draft ai', badge: 'DF', run: function () { if (typeof openDraftBox === 'function') openDraftBox(); else toast('草稿箱暂未加载', 'err'); } },
      { group: '工具', title: '打开学习专注面板', sub: '番茄钟 + 今日任务清单', keys: '专注 番茄钟 任务 计划 focus', badge: 'FM', run: function () { var p = document.getElementById('hh-focus-panel'); if (p) p.classList.add('open'); } }
    ];
  }

  function pageItems(query) {
    if (!query) return [];
    var q = query.toLowerCase();
    var selectors = [
      '#main-screen .row-layout .card',
      '#main-screen .p0-view.active .p0-card',
      '#main-screen .p0-view.active h3',
      '#main-screen .p0-view.active h4'
    ];

    var nodes = [];
    selectors.forEach(function (selector) {
      Array.prototype.forEach.call(document.querySelectorAll(selector), function (node) {
        if (nodes.indexOf(node) === -1) nodes.push(node);
      });
    });

    var results = [];
    nodes.forEach(function (node) {
      if (!isVisible(node)) return;
      var text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length < 2 || text.length > 180) return;
      if (text.toLowerCase().indexOf(q) === -1) return;
      results.push({
        group: '当前页面内容',
        title: text.slice(0, 48),
        sub: text.length > 48 ? text.slice(0, 96) + '...' : '定位到该内容',
        keys: text,
        badge: 'GO',
        run: function () {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
          node.classList.add('hh-hit');
          window.setTimeout(function () { node.classList.remove('hh-hit'); }, 1500);
        }
      });
    });

    return results.slice(0, 8);
  }

  function isVisible(node) {
    var style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.offsetParent !== null;
  }

  function renderCommands() {
    var input = document.getElementById('hh-cmd-input');
    var list = document.getElementById('hh-cmd-list');
    if (!input || !list) return;

    var query = String(input.value || '').trim().toLowerCase();
    var commands = baseCommands().filter(function (item) {
      return !query || (item.title + ' ' + item.sub + ' ' + item.keys).toLowerCase().indexOf(query) !== -1;
    });
    var found = commands.concat(pageItems(query));
    Command.items = found;
    if (Command.selected >= found.length) Command.selected = Math.max(0, found.length - 1);

    list.innerHTML = '';
    if (!found.length) {
      var empty = document.createElement('div');
      empty.className = 'hh-cmd-empty';
      empty.textContent = '没有匹配的内容';
      list.appendChild(empty);
      return;
    }

    var lastGroup = '';
    found.forEach(function (item, index) {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        var group = document.createElement('div');
        group.className = 'hh-cmd-group';
        group.textContent = lastGroup;
        list.appendChild(group);
      }

      var row = document.createElement('div');
      row.className = 'hh-cmd-item' + (index === Command.selected ? ' active' : '');

      var badge = document.createElement('div');
      badge.className = 'hh-cmd-icon';
      badge.textContent = item.badge;

      var main = document.createElement('div');
      main.className = 'hh-cmd-main';

      var title = document.createElement('div');
      title.className = 'hh-cmd-title';
      title.textContent = item.title;

      var sub = document.createElement('div');
      sub.className = 'hh-cmd-sub';
      sub.textContent = item.sub;

      main.appendChild(title);
      main.appendChild(sub);
      row.appendChild(badge);
      row.appendChild(main);

      (function (current) {
        row.addEventListener('mouseenter', function () {
          Command.selected = current.index;
          renderCommands();
        });
        row.addEventListener('click', function () {
          closeCommandPalette();
          current.item.run();
        });
      })({ index: index, item: item });

      list.appendChild(row);
    });

    var active = list.querySelector('.hh-cmd-item.active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }
})();
