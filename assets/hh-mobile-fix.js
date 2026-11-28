/* 浩海 study · 手机端针对性修复 v1（配套 hh-design.css）
   1) 启动：APK 白屏 splash 之后由占位页直达首页，用户不必多点一次（可通过配置关闭）
   2) 管理后台按钮：从顶部工具栏移到「我的 → 头像右边」，首页与主控栏两处统一消失
   3) 顶部导航：彻底去掉 sticky+blur 抖动源，固定为静态顶栏（不再随滚动变化）
   可配置：window.HH_MOBILE_FIX = {
     enableSplashSkip: true,   // 是否自动从入口页进入主界面
     splashDelay: 120,         // 进入主界面的延时（ms），给 splash 一点缓冲
     moveAdminToMine: true,    // 是否把管理后台按钮移到"我的"页头像右侧
     enableNavStickFix: true   // 是否修复导航栏抖动
   }
   说明：只在手机端（<=820px 或 WebView UA）执行；PC 端完全不受影响。
*/
(function () {
  'use strict';

  var DEFAULT = {
    enableSplashSkip: false,   // 默认保留"启动页→首页"流程；如需跳过改为 true
    splashDelay: 120,
    moveAdminToMine: true,
    enableNavStickFix: true
  };
  var CFG = DEFAULT;
  try { var u = window.HH_MOBILE_FIX || {}; Object.keys(u).forEach(function (k) { CFG[k] = u[k]; }); } catch (e) {}
  window.HH_MOBILE_FIX = CFG;

  function isMobile() {
    var ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || window.innerWidth <= 820;
  }
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function $(sel, root) { return (root || document).querySelector(sel); }

  /* ---- 1) 启动：跳过启动界面，直接进入主界面 ---- */
  function autoEnterMain() {
    if (!CFG.enableSplashSkip || !isMobile()) return;
    // 已进主界面 / 有明确 hash 跳转意图时不处理
    var main = document.getElementById('main-screen');
    if (main && main.style.display === 'block') return;
    if (location.hash && location.hash !== '#main') return;
    setTimeout(function () {
      if (typeof window.enterMain === 'function') {
        try { window.enterMain('all'); } catch (e) {}
      }
    }, CFG.splashDelay);
  }

  /* ---- 2) 管理后台按钮：移到「我的 → 头像右边」 ---- */
  function isAdmin() {
    try { return typeof window.hhIsAdmin === 'function' && window.hhIsAdmin(); } catch (e) { return false; }
  }

  function removeTopAdmin() {
    // 首页 #start-auth 与主界面 #auth-area 两处都移除
    ['#start-auth', '#auth-area'].forEach(function (sel) {
      var root = $(sel);
      if (!root) return;
      Array.prototype.forEach.call(root.querySelectorAll('.admin-entry'), function (b) {
        b.parentNode.removeChild(b);
      });
    });
  }

  function buildMineAdminButton() {
    if ($('#hh-mine-admin')) return $('#hh-mine-admin');
    var a = document.createElement('a');
    a.id = 'hh-mine-admin';
    a.className = 'p0-btn hh-mine-admin';
    a.href = 'admin.html';
    a.innerHTML = (window.hhIcon ? window.hhIcon('settings') : '') + '<span>管理后台</span>';
    return a;
  }

  function injectMineAdmin() {
    if (!CFG.moveAdminToMine || !isAdmin()) return;
    var mine = document.getElementById('p0-mine');
    if (!mine || mine.style.display === 'none' && !mine.classList.contains('active')) return;
    var profile = $('.p0-profile', mine);
    if (!profile) return;
    var btn = buildMineAdminButton();
    if (btn.parentNode === profile) return;
    // 头像元素右边：紧跟 .p0-avatar 之后
    var avatar = $('.p0-avatar', profile);
    if (avatar && avatar.nextSibling) profile.insertBefore(btn, avatar.nextSibling);
    else if (avatar) profile.appendChild(btn);
    else profile.insertBefore(btn, profile.firstChild);
  }

  function watchAdmin() {
    if (!CFG.moveAdminToMine) return;
    removeTopAdmin();
    // renderAuthUI 会重建顶部栏，用 MutationObserver 持续清理 + 监听"我的"页
    try {
      var ob = new MutationObserver(function () { removeTopAdmin(); injectMineAdmin(); });
      ob.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    var t = setInterval(function () { removeTopAdmin(); injectMineAdmin(); }, 900);
    document.addEventListener('click', function (e) {
      var tab = e.target && e.target.closest ? e.target.closest('[data-mod="mine"],[data-page="mine"]') : null;
      if (tab) setTimeout(injectMineAdmin, 120);
    }, true);
  }

  /* ---- 3) 顶部导航：固定在顶部，上滑时保持在原位不动 ---- */
  function fixNav() {
    if (!CFG.enableNavStickFix) return;
    var nav = $('.navbar');
    if (!nav) return;
    nav.style.setProperty('position', 'fixed', 'important');
    nav.style.setProperty('top', '0', 'important');
    nav.style.setProperty('left', '0', 'important');
    nav.style.setProperty('right', '0', 'important');
    nav.style.setProperty('width', '100%', 'important');
    nav.style.setProperty('margin', '0', 'important');
    nav.style.setProperty('z-index', '9000', 'important');
    nav.style.setProperty('backdrop-filter', 'none', 'important');
    nav.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    nav.style.setProperty('transition', 'none', 'important');
    // 用实测高度给正文留位，避免首屏被固定栏遮挡
    function pad() {
      var main = document.getElementById('main-screen');
      if (!main) return;
      var h = Math.ceil(nav.getBoundingClientRect().height) || 64;
      document.documentElement.style.setProperty('--hh-nav-h', (h + 4) + 'px');
    }
    pad();
    setTimeout(pad, 300);
    setTimeout(pad, 1200);
    window.addEventListener('resize', pad);
  }

  ready(function () {
    if (!isMobile()) return;   // 手机端专属；PC 端保持原样
    fixNav();
    watchAdmin();
    autoEnterMain();
  });
})();
