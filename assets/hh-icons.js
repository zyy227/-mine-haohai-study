/* 浩海 study · 统一图标系统 v1（去 emoji / 去 AI 味）
   基于 Lucide ISC 开源图标（github.com/lucide-icons/lucide），本地内联，不依赖网络。
   能力：
   1) 注入一个 SVG symbol sprite，提供 window.hhIcon(name, cls) 返回 <svg><use> 片段
   2) 扫描 DOM 中所有功能 emoji，按映射替换为 Lucide 线性图标（PC + 手机同时生效）
   3) 支持配置：window.HH_ICONS = { enabled, size, replaceTextEmoji, observe }
   说明：只替换功能类 emoji，不碰用户昵称/正文里偶然输入的 emoji（由白名单映射控制）。
*/
(function () {
  'use strict';
  var DEFAULT = { enabled: true, size: 18, replaceTextEmoji: true, observe: true };
  var CFG = DEFAULT;
  try { var u = window.HH_ICONS || {}; Object.keys(u).forEach(function(k){ CFG[k] = u[k]; }); } catch(e) {}
  window.HH_ICONS = CFG;

  var SPRITE_ID = 'hh-icon-sprite';
  function injectSprite() {
    if (document.getElementById(SPRITE_ID)) return;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', SPRITE_ID);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
    svg.innerHTML = '    <symbol id="hh-i-arrow-left" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7" /> <path d="M19 12H5" /></symbol>\n    <symbol id="hh-i-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14" /> <path d="m12 5 7 7-7 7" /></symbol>\n    <symbol id="hh-i-bell" viewBox="0 0 24 24"><path d="M10.268 21a2 2 0 0 0 3.464 0" /> <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></symbol>\n    <symbol id="hh-i-book-marked" viewBox="0 0 24 24"><path d="M10 2v8l3-3 3 3V2" /> <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" /></symbol>\n    <symbol id="hh-i-book-open" viewBox="0 0 24 24"><path d="M12 7v14" /> <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></symbol>\n    <symbol id="hh-i-calendar-days" viewBox="0 0 24 24"><path d="M8 2v4" /> <path d="M16 2v4" /> <rect width="18" height="18" x="3" y="4" rx="2" /> <path d="M3 10h18" /> <path d="M8 14h.01" /> <path d="M12 14h.01" /> <path d="M16 14h.01" /> <path d="M8 18h.01" /> <path d="M12 18h.01" /> <path d="M16 18h.01" /></symbol>\n    <symbol id="hh-i-chart-no-axes-column-increasing" viewBox="0 0 24 24"><line x1="12" x2="12" y1="20" y2="10" /> <line x1="18" x2="18" y1="20" y2="4" /> <line x1="6" x2="6" y1="20" y2="16" /></symbol>\n    <symbol id="hh-i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></symbol>\n    <symbol id="hh-i-circle-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /> <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /> <path d="M12 17h.01" /></symbol>\n    <symbol id="hh-i-compass" viewBox="0 0 24 24"><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" /> <circle cx="12" cy="12" r="10" /></symbol>\n    <symbol id="hh-i-download" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /> <polyline points="7 10 12 15 17 10" /> <line x1="12" x2="12" y1="15" y2="3" /></symbol>\n    <symbol id="hh-i-ellipsis" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1" /> <circle cx="19" cy="12" r="1" /> <circle cx="5" cy="12" r="1" /></symbol>\n    <symbol id="hh-i-eye" viewBox="0 0 24 24"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /> <circle cx="12" cy="12" r="3" /></symbol>\n    <symbol id="hh-i-eye-off" viewBox="0 0 24 24"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /> <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /> <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /> <path d="m2 2 20 20" /></symbol>\n    <symbol id="hh-i-file-text" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /> <path d="M14 2v4a2 2 0 0 0 2 2h4" /> <path d="M10 9H8" /> <path d="M16 13H8" /> <path d="M16 17H8" /></symbol>\n    <symbol id="hh-i-graduation-cap" viewBox="0 0 24 24"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" /> <path d="M22 10v6" /> <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" /></symbol>\n    <symbol id="hh-i-hand-heart" viewBox="0 0 24 24"><path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16" /> <path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" /> <path d="m2 15 6 6" /> <path d="M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z" /></symbol>\n    <symbol id="hh-i-house" viewBox="0 0 24 24"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /> <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></symbol>\n    <symbol id="hh-i-image" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /> <circle cx="9" cy="9" r="2" /> <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></symbol>\n    <symbol id="hh-i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /> <path d="M12 16v-4" /> <path d="M12 8h.01" /></symbol>\n    <symbol id="hh-i-key-round" viewBox="0 0 24 24"><path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" /> <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" /></symbol>\n    <symbol id="hh-i-landmark" viewBox="0 0 24 24"><line x1="3" x2="21" y1="22" y2="22" /> <line x1="6" x2="6" y1="18" y2="11" /> <line x1="10" x2="10" y1="18" y2="11" /> <line x1="14" x2="14" y1="18" y2="11" /> <line x1="18" x2="18" y1="18" y2="11" /> <polygon points="12 2 20 7 4 7" /></symbol>\n    <symbol id="hh-i-layers" viewBox="0 0 24 24"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" /> <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" /> <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" /></symbol>\n    <symbol id="hh-i-lock" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /> <path d="M7 11V7a5 5 0 0 1 10 0v4" /></symbol>\n    <symbol id="hh-i-log-out" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /> <polyline points="16 17 21 12 16 7" /> <line x1="21" x2="9" y1="12" y2="12" /></symbol>\n    <symbol id="hh-i-message-circle" viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></symbol>\n    <symbol id="hh-i-moon" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></symbol>\n    <symbol id="hh-i-orbit" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /> <circle cx="19" cy="5" r="2" /> <circle cx="5" cy="19" r="2" /> <path d="M10.4 21.9a10 10 0 0 0 9.941-15.416" /> <path d="M13.5 2.1a10 10 0 0 0-9.841 15.416" /></symbol>\n    <symbol id="hh-i-package-open" viewBox="0 0 24 24"><path d="M12 22v-9" /> <path d="M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z" /> <path d="M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13" /> <path d="M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z" /></symbol>\n    <symbol id="hh-i-plus" viewBox="0 0 24 24"><path d="M5 12h14" /> <path d="M12 5v14" /></symbol>\n    <symbol id="hh-i-refresh-cw" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /> <path d="M21 3v5h-5" /> <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /> <path d="M8 16H3v5" /></symbol>\n    <symbol id="hh-i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /> <path d="m21 21-4.3-4.3" /></symbol>\n    <symbol id="hh-i-send" viewBox="0 0 24 24"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /> <path d="m21.854 2.147-10.94 10.939" /></symbol>\n    <symbol id="hh-i-settings" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /> <circle cx="12" cy="12" r="3" /></symbol>\n    <symbol id="hh-i-shield-check" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /> <path d="m9 12 2 2 4-4" /></symbol>\n    <symbol id="hh-i-sparkles" viewBox="0 0 24 24"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /> <path d="M20 3v4" /> <path d="M22 5h-4" /> <path d="M4 17v2" /> <path d="M5 18H3" /></symbol>\n    <symbol id="hh-i-star" viewBox="0 0 24 24"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" /></symbol>\n    <symbol id="hh-i-trophy" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /> <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /> <path d="M4 22h16" /> <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /> <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /> <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></symbol>\n    <symbol id="hh-i-upload" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /> <polyline points="17 8 12 3 7 8" /> <line x1="12" x2="12" y1="3" y2="15" /></symbol>\n    <symbol id="hh-i-user" viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /> <circle cx="12" cy="7" r="4" /></symbol>\n    <symbol id="hh-i-users" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <circle cx="9" cy="7" r="4" /> <path d="M22 21v-2a4 4 0 0 0-3-3.87" /> <path d="M16 3.13a4 4 0 0 1 0 7.75" /></symbol>\n    <symbol id="hh-i-x" viewBox="0 0 24 24"><path d="M18 6 6 18" /> <path d="m6 6 12 12" /></symbol>';
    (document.body || document.documentElement).appendChild(svg);
  }

  function hhIcon(name, cls) {
    return '<svg class="hh-ico' + (cls ? ' ' + cls : '') + '" width="' + CFG.size +
      '" height="' + CFG.size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<use href="#hh-i-' + name + '"></use></svg>';
  }
  window.hhIcon = hhIcon;

  /* emoji -> lucide 名称（只列功能图标，避免误伤正文） */
  var MAP = {
    '\uD83C\uDFE0': 'house',         // 首页
    '\uD83C\uDF93': 'graduation-cap',// 课程
    '\uD83E\uDD1D': 'users',         // 组队
    '\uD83D\uDD0D': 'search',        // 互助/失物/搜索
    '\uD83D\uDC64': 'user',          // 我的
    '\uD83D\uDCDA': 'book-open',     // 资料
    '\uD83C\uDFC6': 'trophy',        // 比赛
    '\uD83C\uDF38': 'image',         // 美景
    '\uD83D\uDCCA': 'chart-no-axes-column-increasing', // 数据
    '\u2699': 'settings',            // 管理后台
    '\u2B05': 'arrow-left',          // 返回
    '\u2190': 'arrow-left',
    '\u27A1': 'arrow-right',         // 发送/箭头
    '\u27A4': 'arrow-right',
    '\u2794': 'arrow-right',
    '\u2192': 'arrow-right',
    '\u2795': 'plus',                // 发布/上传
    '\u271A': 'plus',
    '\uD83D\uDD04': 'refresh-cw',    // 刷新
    '\uD83D\uDEAA': 'log-out',       // 退出
    '\uD83D\uDD11': 'key-round',     // 登录
    '\uD83D\uDCDD': 'file-text',     // 注册/草稿
    '\uD83D\uDC41': 'eye',           // 游客/查看
    '\u2697': 'layers',              // 高级筛选
    '\uD83C\uDF0C': 'orbit',         // 星空
    '\uD83D\uDCC0': 'calendar-days', // 日期
    '\uD83D\uDCE5': 'download',      // 下载
    '\uD83E\uDD16': 'sparkles',      // AI
    '\uD83D\uDCEC': 'send',          // 发送
    '\u2705': 'check',              // 已认证/完成
    '\uD83D\uDEE1': 'shield-check',  // 校园认证
    '\uD83D\uDCC1': 'file-text',     // 资料统计
    '\uD83D\uDC65': 'users',         // 用户统计
    '\uD83D\uDD14': 'bell',          // 通知
    '\u2B50': 'star',               // 星标
    '\uD83C\uDF10': 'compass',       // 探索
    '\uD83D\uDCA1': 'info',          // 提示
    '\u26A0': 'circle-help',
    '\uD83D\uDD12': 'lock',
    '\uD83D\uDCE6': 'package-open',
    '\uD83C\uDF11': 'moon',
    '\uD83D\uDCC2': 'book-marked',   // 保存草稿
    '\uD83D\uDE80': 'send',          // 发布
    '\u270D': 'file-text',          // 编辑
    '\uD83D\uDCAD': 'message-circle',  // 深度思考
    '\u270D\uFE0F': 'file-text',        // 编辑
    '\uD83D\uDCE5': 'download',
    '\u26D4': 'lock',                   // 已下架
    '\uD83D\uDD34': 'circle-help',      // 红点
    '\uD83F\uD83D': 'check',
    '\uD83D\uDFE2': 'check',            // 绿点
    '\uD83D\uDCF1': 'download',         // 手机版
    '\uD83D\uDCF0': 'orbit',
    '\uD83D\uDCF0\uFE0F': 'orbit',
    '\u2601\uFE0F': 'package-open',     // 云同步
    '\uD83D\uDEA8': 'circle-help',
    '\uD83D\uDCC5': 'calendar-days',
    '\uD83E\uDD1D\uFE0F': 'users',
    '\uD83D\uDC64\uFE0F': 'user',
    '\uD83D\uDD0D\uFE0F': 'search',
    '\uD83D\uDCDA\uFE0F': 'book-open',
    '\uD83C\uDFC6\uFE0F': 'trophy',
    '\uD83C\uDF38\uFE0F': 'image',
    '\uD83D\uDCCA\uFE0F': 'chart-no-axes-column-increasing',
    '\uD83C\uDF93\uFE0F': 'graduation-cap',
    '\uD83C\uDFE0\uFE0F': 'house',
    '\uD83D\uDE80\uFE0F': 'send',
    '\uD83D\uDCC1\uFE0F': 'file-text',
    '\uD83E\uDD16\uFE0F': 'sparkles',
    '\uD83D\uDCC2\uFE0F': 'book-marked',
    '\u2705\uFE0F': 'check',
    '\uD83D\uDD11\uFE0F': 'key-round',
    '\uD83D\uDCDD\uFE0F': 'file-text',
    '\uD83D\uDC41\uFE0F': 'eye',
    '\uD83D\uDD14\uFE0F': 'bell',
    '\uD83D\uDD52': 'calendar-days',     // 状态
    '\uD83D\uDCEB': 'package-open',      // 空草稿箱
    '\uD83D\uDDD1': 'x',                // 删除
    '\uD83E\uDDD1\uFE0F': 'x',
    '\uD83D\uDC40': 'eye',
    '\uD83D\uDC40\uFE0F': 'eye',
    '\uD83D\uDCBE': 'download',          // 保存
    '\uD83D\uDCC4': 'file-text',         // 文档
    '\u2022': 'ellipsis'
  };

  // Unicode emoji 匹配：码点 + 可选变体选择符（u 标志保证代理对按码点处理）
  var EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]\uFE0F?/gu;

  function lookupIcon(ch) {
    var raw = ch.replace(/\uFE0F/g, '');
    return MAP[raw] || MAP[ch] || null;
  }

  // 把一段文本里的功能 emoji 换成图标（保留非 emoji 文本）
  function decorateText(text) {
    if (!CFG.replaceTextEmoji) return text;
    return String(text).replace(EMOJI_RE, function (m) {
      var name = lookupIcon(m);
      return name ? hhIcon(name) : m;
    });
  }
  window.hhDecorateText = decorateText;

  function isInsideEditable(node) {
    var p = node.nodeType === 1 ? node : node.parentNode;
    while (p && p.nodeType === 1) {
      var tag = (p.tagName || '').toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'textarea' || tag === 'option' || tag === 'select' ||
          p.isContentEditable || (p.getAttribute && p.getAttribute('contenteditable') === 'true')) return true;
      p = p.parentNode;
    }
    return false;
  }

  var decorating = false;
  function decorate(root) {
    if (!CFG.enabled || decorating) return;
    root = root || document;
    decorating = true;
    try {
      // 清理历史误处理的节点（内容含 script 代码片段特征）
      Array.prototype.forEach.call(root.querySelectorAll ? root.querySelectorAll('.hh-ico-text') : [], function(sp){
        var t = sp.textContent || '';
        if (/\n|;|\/\/|function\s*\(|^\s*['"]/.test(t)) {
          sp.parentNode.replaceChild(document.createTextNode(t), sp);
        }
      });
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      var texts = [], n;
      while ((n = walker.nextNode())) texts.push(n);
      texts.forEach(function (node) {
        if (!node.nodeValue || !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/u.test(node.nodeValue)) return;
        if (isInsideEditable(node)) return;
        // 登录/注册等按钮由 renderAuthUI 生成，统一在这里处理；未映射的 emoji 保持原样
        var decorated = decorateText(node.nodeValue);
        if (decorated !== node.nodeValue) {
          var span = document.createElement('span');
          span.className = 'hh-ico-text';
          span.innerHTML = decorated;
          node.parentNode.replaceChild(span, node);
        }
      });
      Array.prototype.forEach.call(root.querySelectorAll ? root.querySelectorAll('[title],[aria-label]') : [], function(el){
        if (el.getAttribute('data-hh-decorated')) return;
        var t = el.getAttribute('title'); var a = el.getAttribute('aria-label'); var changed = false;
        var re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/u;
        if (t && re.test(t)) { el.setAttribute('title', decorateText(t).replace(/<[^>]*>/g,'')); changed = true; }
        if (a && re.test(a)) { el.setAttribute('aria-label', decorateText(a).replace(/<[^>]*>/g,'')); changed = true; }
        if (changed) el.setAttribute('data-hh-decorated', '1');
      });
    } finally { decorating = false; }
  }

  function init() {
    if (!CFG.enabled) return;
    injectSprite();
    decorate(document.body);
    if (CFG.observe) {
      try {
        var ob = new MutationObserver(function (records) {
          var need = false;
          records.forEach(function (r) {
            if (r.addedNodes && r.addedNodes.length) need = true;
          });
          if (need) decorate(document.body);
        });
        ob.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
