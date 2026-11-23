/* 浩海 study 移动端外壳 v1
   作用：底部固定 Tab（首页/课程/组队/互助/我的），复用页面已有的 p0Enter / returnToStart
   依赖：p0.js 的 p0Enter、index.html 的 returnToStart（缺失时自动降级，不报错）
   配置：window.HH_MOBILE_SHELL（在引入本文件之前定义即可覆盖），见文件末尾默认值
   说明：只用原生 DOM，不新增任何网络请求、不改业务数据、重复加载不会重复插入
*/
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* 默认配置：所有能力都可通过 window.HH_MOBILE_SHELL 覆盖或关闭 */
  var DEFAULT = {
    enabled: true,            // 总开关：false 则整个外壳不启用
    showBottomTabs: true,     // 是否显示底部 Tab
    showUsernameOnMobile: true, // 手机端是否显示注册用户名
    // Tab 项：key 对应 p0Show 的模块名；home 为起始页
    tabs: [
      { key: 'home', label: '首页', icon: '🏠' },
      { key: 'courses', label: '课程', icon: '🎓' },
      { key: 'teams', label: '组队', icon: '🤝' },
      { key: 'lostfound', label: '互助', icon: '🔍' },
      { key: 'mine', label: '我的', icon: '👤' }
    ]
  };

  var CFG = merge(DEFAULT, window.HH_MOBILE_SHELL || {});
  window.HH_MOBILE_SHELL = CFG; // 回写，方便运行时改配置后调用 rebuild()

  function merge(base, override) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(override).forEach(function (k) { out[k] = override[k]; });
    return out;
  }

  function currentModule() {
    // P0 模块把当前模块名挂在全局 P0.module 上（p0.js 定义）
    try { return (window.P0 && window.P0.module) || 'all'; } catch (e) { return 'all'; }
  }

  function inMainScreen() {
    var main = document.getElementById('main-screen');
    return !!(main && main.style.display === 'block');
  }

  function goTab(key) {
    if (key === 'home') {
      if (typeof window.returnToStart === 'function') window.returnToStart();
      syncActive('home');
      return;
    }
    // 还在起始页时先用 p0Enter 进入主界面；已在主界面则直接 p0Show 切模块
    if (inMainScreen()) {
      if (typeof window.p0Show === 'function') window.p0Show(key);
    } else {
      if (typeof window.p0Enter === 'function') window.p0Enter(key);
    }
    syncActive(key);
  }
  window.hhMobileGoTab = goTab; // 暴露给外部扩展使用

  function syncActive(key) {
    var tabs = document.querySelectorAll('#hh-bottom-tabs .hh-tab');
    if (!tabs.length) return;
    var target = key || currentModule();
    tabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-key') === target);
    });
  }

  function build() {
    document.body.classList.toggle('hh-mobile-shell', !!CFG.enabled);
    document.body.classList.toggle('hh-show-name', !!(CFG.enabled && CFG.showUsernameOnMobile));

    var old = document.getElementById('hh-bottom-tabs');
    if (old) old.parentNode.removeChild(old);
    if (!CFG.enabled || !CFG.showBottomTabs) return;

    var nav = document.createElement('nav');
    nav.id = 'hh-bottom-tabs';
    nav.setAttribute('aria-label', '底部导航');

    (CFG.tabs || []).forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hh-tab';
      btn.setAttribute('data-key', item.key);
      btn.setAttribute('aria-label', item.label);
      btn.innerHTML = '<span class="hh-tab-ico" aria-hidden="true">' + item.icon + '</span>' +
                      '<span class="hh-tab-label">' + item.label + '</span>';
      btn.addEventListener('click', function () { goTab(item.key); });
      nav.appendChild(btn);
    });

    document.body.appendChild(nav);
    syncActive(inMainScreen() ? currentModule() : 'home');
  }
  window.hhMobileRebuild = build; // 运行时改 CFG 后可调此重建

  ready(function () {
    build();
    // 顶栏 p0-bar / 起始页 nav-tab 点击后，同步底部高亮（捕获阶段，先于业务函数执行也不影响）
    document.addEventListener('click', function (e) {
      var tab = e.target && e.target.closest ? e.target.closest('[data-mod], .nav-tab') : null;
      if (!tab) return;
      var key = tab.getAttribute('data-mod') || tab.getAttribute('data-page');
      if (key === 'home' || key === 'all') {
        setTimeout(function () { syncActive(inMainScreen() ? currentModule() : 'home'); }, 60);
      } else if (key) {
        setTimeout(function () { syncActive(key); }, 60);
      }
    }, true);
  });
})();
