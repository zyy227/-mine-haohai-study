/* 浩海 study · 统一文件打开入口 v1
   解决问题：
   1) 网页端点文件同时冒出两个标签页（一个空白）——统一成一个 window.open，去掉各处 target=_blank
   2) 手机 APP（Capacitor WebView）点下载/预览没反应——WebView 会拦截 target=_blank，
      改为本页 location.href 打开，保证一定有反应；浏览完按返回键回到站点
   配置：window.HH_OPEN（在引入本文件前定义可覆盖）
     - forceSelf: true 强制所有环境本页打开
     - useSystemBrowser: true 且 APP 内装了 Capacitor Browser 插件时，用系统浏览器打开
   依赖：index.html 的 safeUrl / trackMetric（缺失时自动降级，不报错）
*/
(function () {
  'use strict';

  var DEFAULT = {
    forceSelf: false,          // 强制本页打开（浏览器也不新开标签）
    useSystemBrowser: false    // APP 内是否优先用系统浏览器（需装 @capacitor/browser 才生效）
  };
  var CFG = DEFAULT;
  try {
    var u = window.HH_OPEN || {};
    Object.keys(u).forEach(function (k) { CFG[k] = u[k]; });
  } catch (e) {}
  window.HH_OPEN = CFG;

  function inApp() {
    try {
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function') {
        return !!window.Capacitor.isNativePlatform();
      }
    } catch (e) {}
    // 兜底：UA 里含 Capacitor/设备 App 标识，且不是普通移动端浏览器
    var ua = navigator.userAgent || '';
    return /CapacitorApp|haohai-app/i.test(ua);
  }

  function normalize(raw) {
    var url = String(raw == null ? '' : raw).trim();
    if (!url) return '';
    // 走站点自己的 URL 白名单/代理改写；没有则在本地做基础白名单
    if (typeof window.safeUrl === 'function') return window.safeUrl(url);
    if (/^(https?:\/\/|\/|#|\.\/)/i.test(url)) return url;
    return '';
  }

  /**
   * 统一打开文件/链接
   * @param {string} rawUrl 原始链接
   * @param {Event} ev 点击事件（传入会自动 preventDefault，避免旧 href/target 生效）
   * @param {number} itemId 可选的埋点 id
   */
  function openFile(rawUrl, ev, itemId) {
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    // 阻止事件冒泡，避免父级的卡片点击/ swipe 逻辑被触发
    if (ev && typeof ev.stopPropagation === 'function') { try { ev.stopPropagation(); } catch (e) {} }

    var url = normalize(rawUrl);
    if (!url || url === '#') {
      if (typeof window.showToast === 'function') window.showToast('这个文件没有可用的下载链接', 'err');
      else if (typeof window.p0Toast === 'function') window.p0Toast('这个文件没有可用的下载链接', 'err');
      return false;
    }

    // 埋点：站内下载统计（失败静默）
    if (itemId && typeof window.trackMetric === 'function') {
      try { window.trackMetric('download', itemId); } catch (e) {}
    }

    var app = inApp();

    // APP 内：优先系统浏览器（若可用），否则本页打开——WebView 对 target=_blank 支持很差
    if (app && CFG.useSystemBrowser && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
      try {
        window.Capacitor.Plugins.Browser.open({ url: url });
        return true;
      } catch (e) { /* 插件不可用则回退本页 */ }
    }

    if (app || CFG.forceSelf) {
      window.location.href = url;
      return true;
    }

    // 浏览器：只开一个标签。noopener 防止空白页/反向脚本；features 固定
    var w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) { window.location.href = url; } // 被拦截则本页打开
    return true;
  }

  window.hhOpenFile = openFile;

  // 事件委托：把页面里所有带 data-open-file 的元素接管过来（含动态生成的卡片）
  // 这样即使 p0.js 里的链接还没改完，加上这个属性即可，实现最小改动
  function delegated(e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-open-file]') : null;
    if (!el) return;
    var raw = el.getAttribute('data-open-file');
    var id = Number(el.getAttribute('data-file-id') || 0) || 0;
    openFile(raw, e, id);
  }
  document.addEventListener('click', delegated, false);
})();
