/* 浩海 study · 移动端体验增强 v1
   集中放：① 资料/比赛/美景三个子选项 ② 顶部用户区与退出登录 ③ AI 小人跟随动画
   设计原则：不改业务主文件，全部用 DOM 增强 + 包装；配置集中在 window.HH_POLISH
   依赖：p0.js 的 p0Show、index.html 的 logout / askConfirm（缺失时自动降级）
*/
(function () {
  'use strict';

  var DEFAULT = {
    enableSubTabs: true,        // 统计栏下方三个子选项（资料/比赛/美景）
    enableAuthPolish: true,     // 手机端顶部用户区改造 + 我的页退出登录
    enableMascot: true,         // AI 小人跟随动画
    subtabLabels: ['资料', '比赛', '美景'],
    subtabCards: ['doc-card', 'comp-card', 'scenery-card'],
    mascotImages: {
      head: 'assets/mascot-head.png',
      body: 'assets/mascot-body.png',
      legL: 'assets/mascot-leg-l.png',
      legR: 'assets/mascot-leg-r.png'
    }
  };
  var CFG = DEFAULT;
  try {
    var u = window.HH_POLISH || {};
    Object.keys(u).forEach(function (k) { CFG[k] = u[k]; });
  } catch (e) {}
  window.HH_POLISH = CFG;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
           window.innerWidth <= 820;
  }
  function $(s, root) { return (root || document).querySelector(s); }

  /* ============ ① 资料 / 比赛 / 美景 三个子选项 ============ */
  var currentSub = 0;
  var subtabBar = null;

  function applySub(index) {
    currentSub = index;
    if (!CFG.enableSubTabs) return;
    CFG.subtabCards.forEach(function (id, i) {
      var card = document.getElementById(id);
      if (card) card.style.display = (i === index) ? 'block' : 'none';
    });
    // 关键修复：离开 all 时把整条设为 none，切回来必须恢复，否则三个子选项消失
    if (subtabBar && isMobile()) subtabBar.style.display = '';
    if (subtabBar) {
      Array.prototype.forEach.call(subtabBar.querySelectorAll('.hh-subtab'), function (b, i) {
        b.classList.toggle('active', i === index);
      });
    }
  }

  function buildSubTabs() {
    if (!CFG.enableSubTabs) return;
    var dash = $('#main-screen .dashboard');
    if (!dash || $('#hh-subtabs')) return;
    var bar = document.createElement('div');
    bar.id = 'hh-subtabs';
    bar.className = 'hh-subtabs';
    CFG.subtabLabels.forEach(function (label, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hh-subtab' + (i === 0 ? ' active' : '');
      b.textContent = label;
      b.setAttribute('data-sub', String(i));
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        applySub(i);
      });
      bar.appendChild(b);
    });
    dash.parentNode.insertBefore(bar, dash.nextSibling);
    subtabBar = bar;
    // 默认显示第一个模块（资料）
    applySub(0);
  }

  // 包装 p0Show：进入 all 模式时应用子选项，离开 all 时隐藏子选项条（PC 端始终不显示）
  function wrapP0Show() {
    var orig = window.p0Show;
    if (typeof orig !== 'function' || orig.__hhWrapped) return;
    function wrapped(mod) {
      orig(mod);
      var m = mod || 'all';
      if (m === 'all') {
        if (isMobile()) {
          buildSubTabs();
          // 每次回到 all 都重置到默认的「资料」，避免出现只剩某一个模块的状态
          currentSub = 0;
          applySub(0);
          if (subtabBar) subtabBar.style.display = '';
        } else {
          CFG.subtabCards.forEach(function (id) {
            var c = document.getElementById(id); if (c) c.style.display = 'block';
          });
          if (subtabBar) subtabBar.style.display = 'none';
        }
      } else if (subtabBar) {
        subtabBar.style.display = 'none';
      }
    }
    wrapped.__hhWrapped = true;
    window.p0Show = wrapped;
  }

  /* ============ ② 手机端顶部用户区 + 我的页退出登录 ============ */

  // 顶部：手机端隐藏用户名和退出，头像放大（用 CSS 类控制，见 hh-polish.css）
  function polishAuthBar() {
    if (!CFG.enableAuthPolish) return;
    document.body.classList.add('hh-auth-polish');
    // 退出登录改为带确认（全局覆盖 logout，PC 端同样更安全）
    var origLogout = window.logout;
    if (typeof origLogout === 'function' && !origLogout.__hhWrapped) {
      function safeLogout() {
        function doIt() { origLogout(); }
        if (typeof window.askConfirm === 'function') {
          window.askConfirm('确定要退出登录吗？退出后将以游客身份浏览。', {
            title: '退出登录', okText: '确定退出', icon: '🚪'
          }).then(function (ok) { if (ok) doIt(); });
        } else if (window.confirm('确定要退出登录吗？')) {
          doIt();
        }
      }
      safeLogout.__hhWrapped = true;
      window.logout = safeLogout;
      // 同步已渲染的 onclick="logout()" 按钮：onclick 属性会在调用时查 window.logout，无需改 DOM
    }
  }

  // 我的页：在"编辑资料"按钮后插入"退出登录"（仅手机端显示）
  function injectMineLogout() {
    if (!CFG.enableAuthPolish) return;
    var sec = document.getElementById('p0-mine');
    if (!sec || $('#hh-mine-logout')) return;
    var editBtn = null;
    Array.prototype.forEach.call(sec.querySelectorAll('button'), function (b) {
      if (b.textContent && b.textContent.indexOf('编辑资料') >= 0) editBtn = b;
    });
    if (!editBtn || !editBtn.parentNode) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'hh-mine-logout';
    btn.className = 'p0-btn hh-mine-logout';
    btn.textContent = '🚪 退出登录';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      window.logout();
    });
    editBtn.parentNode.insertBefore(btn, editBtn.nextSibling);
  }

  // 监听"我的"页渲染：p0RenderMine 会重建内容，用 MutationObserver 在内容稳定后补按钮
  function watchMine() {
    if (!CFG.enableAuthPolish) return;
    var sec = document.getElementById('p0-mine');
    if (!sec) return;
    var t = setInterval(function () {
      if (sec.classList.contains('active')) injectMineLogout();
    }, 800);
    var ob = new MutationObserver(function () { injectMineLogout(); });
    ob.observe(sec, { childList: true, subtree: true });
  }

  /* ============ ③ AI 小人跟随动画 ============ */
  function buildMascot() {
    if (!CFG.enableMascot) return;
    var ball = document.getElementById('ai-ball');
    if (!ball || $('#hh-mascot')) return;
    ball.classList.add('hh-mascot-host');
    // 清掉旧图标/光环，保留球的拖拽功能
    var oldIcon = ball.querySelector('.ai-chip-icon'); if (oldIcon) oldIcon.style.display = 'none';
    var oldRing = ball.querySelector('.ai-chip-ring'); if (oldRing) oldRing.style.display = 'none';

    var wrap = document.createElement('span');
    wrap.id = 'hh-mascot';
    wrap.innerHTML =
      '<span class="hh-mascot-glow"></span>' +
      '<span class="hh-mascot-leg hh-mascot-leg-l"><img src="' + CFG.mascotImages.legL + '" alt=""></span>' +
      '<span class="hh-mascot-leg hh-mascot-leg-r"><img src="' + CFG.mascotImages.legR + '" alt=""></span>' +
      '<span class="hh-mascot-body"><img src="' + CFG.mascotImages.body + '" alt=""></span>' +
      '<span class="hh-mascot-head"><img src="' + CFG.mascotImages.head + '" alt="">' +
        '<span class="hh-mascot-face"><i class="hh-eye hh-eye-l"></i><i class="hh-eye hh-eye-r"></i></span>' +
      '</span>';
    ball.insertBefore(wrap, ball.firstChild);

    var legL = wrap.querySelector('.hh-mascot-leg-l');
    var legR = wrap.querySelector('.hh-mascot-leg-r');
    var head = wrap.querySelector('.hh-mascot-head');
    var eyes = wrap.querySelectorAll('.hh-eye');
    var walking = false, walkTimer = null, step = 0;

    function setDirection(dx) {
      // dx: -1 左 / 1 右 —— 决定踏步先迈哪条腿
      wrap.style.setProperty('--hh-dir', String(dx));
    }
    function startWalk() {
      if (walking) return;
      walking = true;
      wrap.classList.add('walking');
      walkTimer = setInterval(function () {
        step++;
        var dir = Number(wrap.style.getPropertyValue('--hh-dir')) || 1;
        if (dir >= 0) {
          legL.style.transform = (step % 2 ? 'rotate(12deg)' : 'rotate(-8deg)');
          legR.style.transform = (step % 2 ? 'rotate(-8deg)' : 'rotate(12deg)');
        } else {
          legL.style.transform = (step % 2 ? 'rotate(-8deg)' : 'rotate(12deg)');
          legR.style.transform = (step % 2 ? 'rotate(12deg)' : 'rotate(-8deg)');
        }
      }, 180);
    }
    function stopWalk() {
      walking = false;
      wrap.classList.remove('walking');
      clearInterval(walkTimer);
      legL.style.transform = ''; legR.style.transform = '';
    }

    var lastMove = 0;
    document.addEventListener('mousemove', function (e) {
      var r = ball.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var ang = Math.max(-16, Math.min(16, (dx / Math.max(120, Math.abs(dx) + Math.abs(dy))) * 16));
      head.style.transform = 'rotate(' + ang.toFixed(1) + 'deg)';
      // 眼珠跟随鼠标（小范围平移）
      var ex = Math.max(-3, Math.min(3, dx / 40)), ey = Math.max(-2, Math.min(2, dy / 60));
      eyes[0].style.transform = 'translate(' + ex.toFixed(1) + 'px,' + ey.toFixed(1) + 'px)';
      eyes[1].style.transform = 'translate(' + ex.toFixed(1) + 'px,' + ey.toFixed(1) + 'px)';
      setDirection(dx >= 0 ? 1 : -1);
      lastMove = Date.now();
      startWalk();
    }, { passive: true });
    // 鼠标停下 1 秒后停止踏步
    setInterval(function () { if (walking && Date.now() - lastMove > 1000) stopWalk(); }, 400);
  }

  ready(function () {
    wrapP0Show();
    polishAuthBar();
    buildMascot();
    watchMine();
    // 若进入时已在 all 模块
    try {
      if ((window.P0 && window.P0.module) === 'all' && isMobile()) {
        buildSubTabs(); applySub(currentSub);
      }
    } catch (e) {}
  });
})();
