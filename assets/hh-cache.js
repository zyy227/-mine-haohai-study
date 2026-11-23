/* 浩海 study 缓存自愈模块
   作用：自动检测线上 SW 版本，发现本地被旧缓存占用时清除旧缓存并刷新一次，
        解决"卸载重装 APP 也看不到新功能"的问题。
   原理：从 /sw.js 读取线上 CACHE 版本名，与 localStorage 记录比对；
        版本变化 → 清 caches + 注销 SW + 刷新一次。刷新的页面走网络拿最新代码，
        刷新后版本一致，不再重复，无死循环。
   无副作用：不碰登录/数据；读不到版本或出错时静默跳过，绝不阻塞页面。
*/
(function () {
  'use strict';

  var VERSION_KEY = 'hh_cache_version';   // 本地已应用的线上版本名

  // 从 sw.js 源码解析 const CACHE = 'xxx'；加时间戳绕过 HTTP 缓存
  function fetchOnlineVersion(cb) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6000) : null;
    fetch('/sw.js?v=' + Date.now(), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (text) {
        if (timer) clearTimeout(timer);
        if (!text) { cb(null); return; }
        var m = /const\s+CACHE\s*=\s*['"]([^'"]+)['"]/.exec(text);
        cb(m ? m[1] : null);
      })
      .catch(function () { if (timer) clearTimeout(timer); cb(null); });
  }

  function clearAndReload(version) {
    // 先写回版本号：刷新后即使代码还没换完，也不会再次进入清理，杜绝死循环
    try { localStorage.setItem(VERSION_KEY, version); } catch (_) {}

    var jobs = [];
    if (window.caches && caches.keys) {
      jobs.push(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }).catch(function () {}));
    }
    if ('serviceWorker' in navigator) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }).catch(function () {}));
    }
    Promise.all(jobs).then(function () {
      try { location.reload(); } catch (_) {}
    });
  }

  function check() {
    fetchOnlineVersion(function (online) {
      if (!online) return;
      var local = null;
      try { local = localStorage.getItem(VERSION_KEY); } catch (_) {}
      if (local === online) return;              // 已是最新
      if (!local) {                               // 首次运行：只记录，不强刷
        try { localStorage.setItem(VERSION_KEY, online); } catch (_) {}
        return;
      }
      clearAndReload(online);                     // 版本变了：清缓存 + 刷新一次
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check);
  else check();
})();
