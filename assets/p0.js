/* ============================================================
   浩海 study · P0 前端模块（课程中心 / 组队广场 / 我的 / 校园认证）
   ------------------------------------------------------------
   依赖 index.html 里已有的全局能力：
     currentUser, authHeaders(), escapeHtml(), showToast(),
     askConfirm(), requireLogin(), enterMain(), openAuthModal(), trackMetric()
   本文件不改动原有三个模块的逻辑，只新增视图，加载失败也不会影响旧功能。
   ============================================================ */

var P0 = {
    module: 'all',
    courses: [],
    teams: [],
    lostfound: [],
    stats: null,
    mine: null,
    courseQ: '',
    teamQ: '',
    teamKind: 'all',
    lfKind: 'all',
    lfQ: '',
    openTeam: 0,
    modalSeq: 0,
    loaded: { courses: false, teams: false, lostfound: false, mine: false, stats: false }
};

/* ---------------- 基础工具 ---------------- */

function p0Esc(s) {
    if (typeof escapeHtml === 'function') return escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
}

function p0Safe(url) {
    if (typeof safeUrl === 'function') return safeUrl(url);
    var s = String(url == null ? '' : url).trim();
    return /^(https?:\/\/|\/|#|\.\/)/i.test(s) ? s : '#';
}

function p0IsLogged() {
    return typeof currentUser !== 'undefined' && !!currentUser;
}

function p0Toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
    else if (typeof alert === 'function') alert(msg);
}

function p0Date(s) {
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s).slice(0, 10);
    return d.toLocaleDateString('zh-CN');
}

function p0KindLabel(k) {
    return ({ competition: '竞赛组队', course: '课程大作业', study: '学习搭子' })[k] || '组队';
}

function p0KindClass(k) {
    return ({ competition: 'orange', course: 'gray', study: 'green' })[k] || 'gray';
}

function p0Stars(n) {
    var r = Math.max(1, Math.min(5, Number(n) || 5));
    return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r);
}

async function p0Fetch(path, options) {
    var opts = options || {};
    var headers = {};
    try { headers = await authHeaders(); } catch (_) { headers = {}; }
    if (opts.body) headers['Content-Type'] = 'application/json';

    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    try {
        var res = await fetch(path, {
            method: opts.method || 'GET',
            headers: headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined,
            signal: ctrl ? ctrl.signal : undefined
        });
        var data = null;
        try { data = await res.json(); } catch (_) { data = null; }
        if (!res.ok) {
            var msg = (data && (data.error || data.message)) || ('请求失败 HTTP ' + res.status);
            throw new Error(msg);
        }
        return data || {};
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function p0ErrorHtml(e) {
    var msg = e && e.message ? e.message : String(e || '未知错误');
    return '<div class="p0-empty">⚠️ ' + p0Esc(msg) +
        '<br><br><span style="font-size:12px;color:#9aa9bc">第一次部署请先完成两步：① 在 Supabase 执行 supabase-setup-v4.sql；② 把 functions/api/profile.ts、courses.ts、teams.ts 一起发布到 Cloudflare Pages。</span>' +
        '<br><br><button class="p0-btn sm" onclick="p0Reload()">重试</button></div>';
}

/* ---------------- 弹窗 ---------------- */

function p0Modal(html) {
    var seq = ++P0.modalSeq;
    var el = document.getElementById('p0-modal');
    if (!el) {
        el = document.createElement('div');
        el.id = 'p0-modal';
        el.className = 'p0-modal';
        el.addEventListener('click', function (e) { if (e.target === el) p0CloseModal(); });
        document.body.appendChild(el);
    }
    el.innerHTML = '<div class="p0-modal-box">' + html + '</div>';
    el.classList.add('show');
    document.body.style.overflow = 'hidden';
    return seq;
}

function p0CloseModal() {
    P0.modalSeq++;
    var el = document.getElementById('p0-modal');
    if (el) {
        el.classList.remove('show');
        el.innerHTML = '';
    }
    document.body.style.overflow = '';
}

function p0ModalShell(title, body) {
    return '<div class="p0-modal-head"><h3>' + p0Esc(title) + '</h3>' +
        '<button class="p0-modal-close" type="button" onclick="p0CloseModal()">&times;</button></div>' +
        '<div class="p0-modal-body">' + body + '</div>';
}

/* ---------------- 入口与切换 ---------------- */

function p0Enter(mod) {
    if (typeof enterMain === 'function') enterMain('all');
    document.querySelectorAll('.nav-tab').forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-page') === mod);
    });
    setTimeout(function () { p0Show(mod); }, 50);
}

function p0Show(mod) {
    P0.module = mod || 'all';

    document.querySelectorAll('.p0-tab').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-mod') === P0.module);
    });

    var row = document.querySelector('#main-screen .row-layout');
    if (row) row.style.display = (P0.module === 'all') ? '' : 'none';
    // 统计横条（共享资料/竞赛活动/校园美景）只在「资料·比赛·美景」显示，其余模块隐藏
    var dash = document.querySelector('#main-screen .dashboard');
    if (dash) dash.style.display = (P0.module === 'all') ? '' : 'none';
    if (P0.module === 'all') {
        document.querySelectorAll('#main-screen .module-card').forEach(function (c) { c.style.display = 'block'; });
    }

    ['courses', 'teams', 'lostfound', 'mine', 'stats'].forEach(function (k) {
        var sec = document.getElementById('p0-' + k);
        if (sec) sec.classList.toggle('active', P0.module === k);
    });

    if (P0.module === 'courses' && !P0.loaded.courses) p0LoadCourses();
    if (P0.module === 'teams' && !P0.loaded.teams) p0LoadTeams();
    if (P0.module === 'lostfound' && !P0.loaded.lostfound) p0LoadLostFound();
    if (P0.module === 'mine') p0LoadMine(true);
    if (P0.module === 'stats') p0LoadStats();

    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) {}
}

function p0Reload() {
    if (P0.module === 'courses') { P0.loaded.courses = false; p0LoadCourses(); }
    else if (P0.module === 'teams') { P0.loaded.teams = false; p0LoadTeams(); }
    else if (P0.module === 'lostfound') { P0.loaded.lostfound = false; p0LoadLostFound(); }
    else if (P0.module === 'mine') p0LoadMine(true);
    else if (P0.module === 'stats') p0LoadStats();
    else {
        P0.loaded.courses = false;
        P0.loaded.teams = false;
        P0.loaded.lostfound = false;
        p0Toast('已重新连接，切换模块即可看到最新数据', 'ok');
    }
}

/* 登录 / 退出后由 index.html 调用 */
function p0OnAuthChange() {
    P0.loaded.mine = false;
    if (P0.module === 'mine') p0LoadMine(true);
    else if (P0.module === 'teams' && P0.loaded.teams) { P0.loaded.teams = false; p0LoadTeams(); }
    else if (P0.module === 'lostfound' && P0.loaded.lostfound) { P0.loaded.lostfound = false; p0LoadLostFound(); }
}

/* ---------------- 课程中心 ---------------- */

async function p0LoadCourses() {
    var sec = document.getElementById('p0-courses');
    if (!sec) return;
    sec.innerHTML = '<div class="p0-panel"><div class="p0-loading">正在加载课程中心…</div></div>';
    try {
        var q = P0.courseQ;
        var data = await p0Fetch('/api/courses' + (q ? '?q=' + encodeURIComponent(q) : ''));
        P0.courses = data.courses || [];
        P0.loaded.courses = true;
        p0RenderCourses();
        p0FillCourseSelect();
    } catch (e) {
        sec.innerHTML = '<div class="p0-panel">' + p0ErrorHtml(e) + '</div>';
    }
}

function p0RenderCourses() {
    var sec = document.getElementById('p0-courses');
    if (!sec) return;

    var cards = P0.courses.map(function (c) {
        var meta = [c.teacher, c.college, c.credit ? (c.credit + ' 学分') : '', c.term].filter(Boolean).join(' · ');
        return '<div class="p0-card" onclick="p0OpenCourse(' + Number(c.id) + ')">' +
            '<div class="p0-card-title">' + p0Esc(c.name) + '</div>' +
            '<div class="p0-meta">' + p0Esc(meta || '暂无课程信息') + '</div>' +
            '<div class="p0-card-foot">' +
                '<span class="p0-chip">📚 ' + (c.docCount || 0) + ' 份资料</span>' +
                '<span class="p0-chip gray">💬 ' + (c.reviewCount || 0) + ' 条攻略</span>' +
                (c.exam_type ? '<span class="p0-chip ' + (/考试/.test(c.exam_type) ? 'red' : 'green') + '">' + p0Esc(c.exam_type) + '</span>' : '') +
            '</div></div>';
    }).join('');

    sec.innerHTML = '<div class="p0-panel">' +
        '<div class="p0-head">' +
            '<div><h3>🎓 课程中心</h3><p class="p0-sub">按课程找资料、看攻略、找队友 · 共 ' + P0.courses.length + ' 门课</p></div>' +
            '<div class="p0-actions">' +
                '<input class="p0-input" id="p0-course-q" value="' + p0Esc(P0.courseQ) + '" placeholder="搜课程 / 老师 / 学院" onkeydown="if(event.key===\'Enter\'){p0CourseSearch()}">' +
                '<button class="p0-btn" onclick="p0CourseSearch()">搜索</button>' +
                '<button class="p0-btn primary" onclick="p0OpenCourseForm()">＋ 建课程</button>' +
            '</div>' +
        '</div>' +
        (P0.courses.length ? '<div class="p0-grid">' + cards + '</div>'
            : '<div class="p0-empty">还没有课程。<br>点右上角「＋ 建课程」添加你们专业的第一门课（需要先完成校园认证）。</div>') +
        '</div>';
}

function p0CourseSearch() {
    var input = document.getElementById('p0-course-q');
    P0.courseQ = input ? input.value.trim() : '';
    P0.loaded.courses = false;
    p0LoadCourses();
}

async function p0OpenCourse(id) {
    var seq = p0Modal(p0ModalShell('课程详情', '<div class="p0-loading">正在加载…</div>'));
    try {
        var d = await p0Fetch('/api/courses?id=' + encodeURIComponent(id));
        if (seq !== P0.modalSeq) return;
        p0RenderCourseDetail(d);
    } catch (e) {
        if (seq !== P0.modalSeq) return;
        p0Modal(p0ModalShell('课程详情', p0ErrorHtml(e)));
    }
}

function p0RenderCourseDetail(d) {
    var c = d.course || {};
    var docs = d.docs || [];
    var reviews = d.reviews || [];
    var teams = d.teams || [];
    var cid = Number(c.id);

    var meta = [c.teacher, c.college, c.credit ? (c.credit + ' 学分') : '', c.term, c.exam_type].filter(Boolean).join(' · ');

    var docHtml = docs.length ? docs.map(function (x) {
        var btn = x.link
            ? '<a class="p0-btn sm" href="' + p0Esc(p0Safe(x.link)) + '" target="_blank" rel="noopener noreferrer" onclick="p0TrackDoc(' + Number(x.id) + ')">下载 / 预览</a>'
            : '<span class="p0-chip gray">未附文件</span>';
        return '<div class="p0-list-item"><div class="p0-li-main">' +
            '<div class="p0-li-title">📄 ' + p0Esc(x.name || '未命名资料') + '</div>' +
            '<div class="p0-li-sub">' + p0Esc(x.type || '') + (x.owner_email ? ' · by ' + p0Esc(String(x.owner_email).split('@')[0]) : '') + '</div>' +
            '</div><div class="p0-li-actions">' + btn + '</div></div>';
    }).join('') : '<div class="p0-empty">这门课还没有资料。登录后点下方按钮，把课件 / 往年题 / 笔记传上来。</div>';

    var reviewHtml = reviews.length ? reviews.map(function (r) {
        return '<div class="p0-review">' +
            '<div class="p0-review-head"><span class="p0-review-author">' + p0Esc(r.author || '同学') +
                (r.author_college ? '<span class="p0-chip gray" style="margin-left:6px">' + p0Esc(r.author_college) + '</span>' : '') +
            '</span><span class="p0-stars">' + p0Stars(r.rating) + '</span></div>' +
            '<div class="p0-review-text">' + p0Esc(r.content) + '</div>' +
            '<div class="p0-meta">' + p0Esc(r.term || '') + ' ' + p0Date(r.created_at) + '</div>' +
            '</div>';
    }).join('') : '<div class="p0-empty">还没有人写攻略。你可以成为第一个：写下考核方式、给分、作业量，帮到后面的同学。</div>';

    var reviewForm = p0IsLogged()
        ? '<div class="p0-field"><label>评分</label><select id="p0-review-rating" class="p0-select">' +
            '<option value="5">★★★★★ 5 分</option><option value="4">★★★★☆ 4 分</option>' +
            '<option value="3">★★★☆☆ 3 分</option><option value="2">★★☆☆☆ 2 分</option><option value="1">★☆☆☆☆ 1 分</option></select></div>' +
          '<div class="p0-field"><label>学期</label><input id="p0-review-term" class="p0-input" placeholder="如 2025-2026-1"></div>' +
          '<div class="p0-field"><label>你的攻略</label><textarea id="p0-review-text" class="p0-textarea" placeholder="考核方式、给分情况、作业量、复习重点、避雷提醒…"></textarea></div>' +
          '<button class="p0-btn primary" onclick="p0SubmitReview(' + cid + ')">发布攻略</button>'
        : '<div class="p0-hint">登录并完成校园认证后，可以写课程攻略。<button class="p0-btn sm" onclick="p0CloseModal();openAuthModal(\'login\')">去登录</button></div>';

    var teamHtml = teams.length ? teams.map(function (t) {
        return '<div class="p0-list-item"><div class="p0-li-main">' +
            '<div class="p0-li-title">🤝 ' + p0Esc(t.title) + '</div>' +
            '<div class="p0-li-sub">' + p0Esc(t.owner_nickname || '同学') + ' · ' + (t.joined_count || 1) + '/' + (t.need_count || 3) + ' 人 · ' + p0Esc(t.status === 'open' ? '招募中' : '已关闭') + '</div>' +
            '</div><div class="p0-li-actions"><button class="p0-btn sm" onclick="p0OpenTeam(' + Number(t.id) + ')">查看</button></div></div>';
    }).join('') : '<div class="p0-meta">这门课暂时没有组队信息，你可以发起一个。</div>';

    var body =
        '<div class="p0-meta">' + p0Esc(meta || '暂无课程信息') + '</div>' +
        (c.intro ? '<p style="color:#33475e;line-height:1.8;font-size:14px;margin-top:10px">' + p0Esc(c.intro) + '</p>' : '') +
        '<div class="p0-card-foot" style="margin-top:12px">' +
            '<span class="p0-chip">📚 ' + docs.length + ' 份资料</span>' +
            '<span class="p0-chip gray">💬 ' + reviews.length + ' 条攻略</span>' +
            '<span class="p0-chip green">🤝 ' + teams.length + ' 个组队</span>' +
        '</div>' +
        '<div class="p0-actions" style="margin:16px 0 6px">' +
            '<button class="p0-btn primary" onclick="p0OpenCourseUpload(' + cid + ')">📤 上传资料到这门课</button>' +
            '<button class="p0-btn" onclick="p0OpenTeamForm(' + cid + ')">🤝 发起组队</button>' +
        '</div>' +
        '<div class="p0-section-title">📚 这门课的资料 <span class="p0-chip gray">' + docs.length + '</span></div>' +
        '<div class="p0-list">' + docHtml + '</div>' +
        '<div class="p0-section-title">💬 课程攻略 <span class="p0-chip gray">' + reviews.length + '</span></div>' +
        reviewForm +
        '<div style="margin-top:14px">' + reviewHtml + '</div>' +
        '<div class="p0-section-title">🤝 相关组队</div>' +
        teamHtml;

    p0Modal(p0ModalShell(c.name || '课程详情', body));
}

async function p0SubmitReview(courseId) {
    if (!p0IsLogged()) { p0CloseModal(); if (typeof openAuthModal === 'function') openAuthModal('login'); return; }
    var rating = document.getElementById('p0-review-rating').value;
    var term = document.getElementById('p0-review-term').value.trim();
    var text = document.getElementById('p0-review-text').value.trim();
    if (text.length < 5) { p0Toast('攻略至少写 5 个字', 'err'); return; }
    try {
        await p0Fetch('/api/courses', { method: 'POST', body: { action: 'review', course_id: courseId, rating: Number(rating), content: text, term: term } });
        p0Toast('攻略已发布', 'ok');
        P0.loaded.courses = false;
        p0OpenCourse(courseId);
        p0LoadCourses();
    } catch (e) {
        p0Toast(e.message || '发布失败', 'err');
    }
}

function p0OpenCourseForm() {
    if (!p0IsLogged()) { if (typeof requireLogin === 'function') requireLogin('建课程'); return; }
    var body =
        '<div class="p0-hint blue">建课程后，大家可以往这门课上传资料、写攻略、发组队。创建需要已认证的校园身份。</div>' +
        '<div class="p0-field"><label>课程名称 *</label><input id="p0-c-name" class="p0-input" placeholder="如：数据结构"></div>' +
        '<div class="p0-row2">' +
            '<div class="p0-field"><label>任课老师</label><input id="p0-c-teacher" class="p0-input" placeholder="如：张老师"></div>' +
            '<div class="p0-field"><label>学院</label><input id="p0-c-college" class="p0-input" placeholder="如：计算机学院"></div>' +
        '</div>' +
        '<div class="p0-row2">' +
            '<div class="p0-field"><label>课程代码</label><input id="p0-c-code" class="p0-input" placeholder="可空"></div>' +
            '<div class="p0-field"><label>学分</label><input id="p0-c-credit" class="p0-input" type="number" step="0.5" min="0" max="20" placeholder="如 4"></div>' +
        '</div>' +
        '<div class="p0-row2">' +
            '<div class="p0-field"><label>学期</label><input id="p0-c-term" class="p0-input" placeholder="如 2025-2026-1"></div>' +
            '<div class="p0-field"><label>考核方式</label><select id="p0-c-exam" class="p0-select"><option value="">不限</option><option>考试</option><option>论文</option><option>大作业</option><option>考查</option></select></div>' +
        '</div>' +
        '<div class="p0-field"><label>课程简介</label><textarea id="p0-c-intro" class="p0-textarea" placeholder="一句话说明这门课学什么（可空）"></textarea></div>' +
        '<div class="p0-modal-foot"><button class="p0-btn" onclick="p0CloseModal()">取消</button><button class="p0-btn primary" id="p0-c-submit" onclick="p0SubmitCourse()">创建课程</button></div>';
    p0Modal(p0ModalShell('建一门课', body));
}

async function p0SubmitCourse() {
    var name = document.getElementById('p0-c-name').value.trim();
    if (!name) { p0Toast('请填写课程名称', 'err'); return; }
    var btn = document.getElementById('p0-c-submit');
    if (btn) { btn.disabled = true; btn.textContent = '创建中…'; }
    try {
        await p0Fetch('/api/courses', {
            method: 'POST',
            body: {
                action: 'create',
                name: name,
                teacher: document.getElementById('p0-c-teacher').value,
                college: document.getElementById('p0-c-college').value,
                code: document.getElementById('p0-c-code').value,
                credit: document.getElementById('p0-c-credit').value,
                term: document.getElementById('p0-c-term').value,
                exam_type: document.getElementById('p0-c-exam').value,
                intro: document.getElementById('p0-c-intro').value
            }
        });
        p0Toast('课程已创建', 'ok');
        p0CloseModal();
        P0.courseQ = '';
        P0.loaded.courses = false;
        p0LoadCourses();
    } catch (e) {
        p0Toast(e.message || '创建失败', 'err');
        if (btn) { btn.disabled = false; btn.textContent = '创建课程'; }
    }
}

/* 在课程详情里直接上传资料（不再跳到资料模块，避免挂错课程） */
function p0OpenCourseUpload(courseId) {
    if (!p0IsLogged()) { if (typeof requireLogin === 'function') requireLogin('上传资料'); return; }
    var body =
        '<div class="p0-hint blue">资料会直接挂到这门课下，上传后课程页立刻能看到，也会出现在资料共享库。</div>' +
        '<div class="p0-field"><label>资料名称 *</label><input id="p0-cu-name" class="p0-input" maxlength="80" placeholder="如：C语言-指针与结构体-笔记.pdf"></div>' +
        '<div class="p0-row2">' +
            '<div class="p0-field"><label>资料类型</label><select id="p0-cu-type" class="p0-select"><option value="学生笔记">学生笔记</option><option value="老师上传">老师课件</option></select></div>' +
            '<div class="p0-field"><label>选择文件 *</label><input id="p0-cu-file" class="p0-input" type="file" style="background:#fff"></div>' +
        '</div>' +
        '<div class="p0-modal-foot"><button class="p0-btn" onclick="p0CloseModal()">取消</button><button class="p0-btn primary" id="p0-cu-submit" onclick="p0SubmitCourseUpload(' + Number(courseId) + ')">上传并发布</button></div>';
    p0Modal(p0ModalShell('上传资料到这门课', body));
}

async function p0SubmitCourseUpload(courseId) {
    var nameEl = document.getElementById('p0-cu-name');
    var fileEl = document.getElementById('p0-cu-file');
    var name = nameEl ? nameEl.value.trim() : '';
    var file = (fileEl && fileEl.files) ? fileEl.files[0] : null;
    if (!name) { p0Toast('请填写资料名称', 'err'); return; }
    if (!file) { p0Toast('请选择要上传的文件', 'err'); return; }

    var maxMb = (typeof MAX_DOC_MB !== 'undefined') ? MAX_DOC_MB : 20;
    if (file.size > maxMb * 1024 * 1024) {
        p0Toast('文件超过 ' + maxMb + 'MB，请压缩后再传', 'err');
        return;
    }
    if (typeof supabaseClient === 'undefined' || !supabaseClient.storage) {
        p0Toast('存储组件未加载，请刷新页面重试', 'err');
        return;
    }

    var btn = document.getElementById('p0-cu-submit');
    if (btn) { btn.disabled = true; btn.textContent = '上传中…'; }
    try {
        var bucket = (typeof BUCKET_NAME !== 'undefined') ? BUCKET_NAME : 'file';
        var ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        var fileName = 'course_' + courseId + '_' + Date.now() + '.' + ext;
        var up = await supabaseClient.storage.from(bucket).upload(fileName, file);
        if (up.error) throw new Error('文件上传失败：' + up.error.message);
        var pub = supabaseClient.storage.from(bucket).getPublicUrl(fileName);
        var link = (pub.data && pub.data.publicUrl) || '';

        // 直接写 site_items，并带上 course_id + 归属信息（RLS 要求 owner_id = 当前用户）
        await p0Fetch('/api/items', {
            method: 'POST',
            body: {
                id: Date.now(),
                kind: 'doc',
                name: name,
                type: document.getElementById('p0-cu-type').value || '学生笔记',
                link: link,
                course_id: Number(courseId),
                owner_id: currentUser.id,
                owner_email: currentUser.email
            }
        });

        p0Toast('资料已上传到这门课', 'ok');
        p0CloseModal();
        P0.loaded.courses = false;
        p0LoadCourses();
        p0OpenCourse(courseId);
    } catch (e) {
        p0Toast(e.message || '上传失败', 'err');
        if (btn) { btn.disabled = false; btn.textContent = '上传并发布'; }
    }
}

function p0TrackDoc(id) {
    if (typeof trackMetric === 'function') trackMetric('download', id);
}

/* ---------------- 组队广场 ---------------- */

async function p0LoadTeams() {
    var sec = document.getElementById('p0-teams');
    if (!sec) return;
    sec.innerHTML = '<div class="p0-panel"><div class="p0-loading">正在加载组队广场…</div></div>';
    try {
        var data = await p0Fetch('/api/teams?kind=' + encodeURIComponent(P0.teamKind) + (P0.teamQ ? '&q=' + encodeURIComponent(P0.teamQ) : ''));
        P0.teams = data.teams || [];
        P0.loaded.teams = true;
        p0RenderTeams();
    } catch (e) {
        sec.innerHTML = '<div class="p0-panel">' + p0ErrorHtml(e) + '</div>';
    }
}

function p0RenderTeams() {
    var sec = document.getElementById('p0-teams');
    if (!sec) return;

    var kinds = [['all', '全部'], ['competition', '🏆 竞赛'], ['course', '📚 课程大作业'], ['study', '☕ 学习搭子']];
    var tabs = kinds.map(function (k) {
        return '<button class="p0-subtab' + (P0.teamKind === k[0] ? ' active' : '') + '" onclick="p0TeamKind(\'' + k[0] + '\')">' + k[1] + '</button>';
    }).join('');

    var cards = P0.teams.map(function (t) {
        var pct = Math.min(100, Math.round((Number(t.joined_count) || 1) / (Number(t.need_count) || 3) * 100));
        var closed = t.status !== 'open';
        return '<div class="p0-card' + (closed ? ' static' : '') + '" onclick="p0OpenTeam(' + Number(t.id) + ')">' +
            '<div class="p0-card-title">' + p0Esc(t.title) + '</div>' +
            '<div class="p0-meta">' +
                p0Esc(t.owner_nickname || '同学') + (t.owner_college ? ' · ' + p0Esc(t.owner_college) : '') +
                (t.competition ? '<br>🏆 ' + p0Esc(t.competition) : '') +
            '</div>' +
            '<div class="p0-card-foot">' +
                '<span class="p0-chip ' + p0KindClass(t.kind) + '">' + p0KindLabel(t.kind) + '</span>' +
                '<span class="p0-chip ' + (closed ? 'gray' : 'green') + '">' + (t.joined_count || 1) + '/' + (t.need_count || 3) + ' 人' + (closed ? ' · 已结束' : '') + '</span>' +
                (t.deadline ? '<span class="p0-chip orange">截止 ' + p0Esc(String(t.deadline).slice(0, 10)) + '</span>' : '') +
                (t.myStatus === 'pending' ? '<span class="p0-chip gray">已申请</span>' : '') +
                (t.myStatus === 'accepted' ? '<span class="p0-chip green">已入队</span>' : '') +
            '</div>' +
            '<div class="p0-progress"><i style="width:' + pct + '%"></i></div>' +
            '</div>';
    }).join('');

    sec.innerHTML = '<div class="p0-panel">' +
        '<div class="p0-head">' +
            '<div><h3>🤝 组队广场</h3><p class="p0-sub">比赛缺队友、大作业缺人手、考研想找搭子，都从这里开始</p></div>' +
            '<div class="p0-actions">' +
                '<input class="p0-input" id="p0-team-q" value="' + p0Esc(P0.teamQ) + '" placeholder="搜比赛 / 队伍 / 技能" onkeydown="if(event.key===\'Enter\'){p0TeamSearch()}">' +
                '<button class="p0-btn" onclick="p0TeamSearch()">搜索</button>' +
                '<button class="p0-btn primary" onclick="p0OpenTeamForm()">＋ 发起组队</button>' +
            '</div>' +
        '</div>' +
        '<div class="p0-subtabs">' + tabs + '</div>' +
        (P0.teams.length ? '<div class="p0-grid">' + cards + '</div>'
            : '<div class="p0-empty">还没有队伍。<br>发一个「互联网+ 缺一个前端」或「数据结构大作业找队友」，让同学能直接申请加入。</div>') +
        '</div>';
}

function p0TeamKind(kind) {
    P0.teamKind = kind;
    P0.loaded.teams = false;
    p0LoadTeams();
}

function p0TeamSearch() {
    var input = document.getElementById('p0-team-q');
    P0.teamQ = input ? input.value.trim() : '';
    P0.loaded.teams = false;
    p0LoadTeams();
}

async function p0OpenTeam(id) {
    P0.openTeam = id;
    var seq = p0Modal(p0ModalShell('队伍详情', '<div class="p0-loading">正在加载…</div>'));
    try {
        var d = await p0Fetch('/api/teams?id=' + encodeURIComponent(id));
        if (seq !== P0.modalSeq) return;
        p0RenderTeamDetail(d);
    } catch (e) {
        if (seq !== P0.modalSeq) return;
        p0Modal(p0ModalShell('队伍详情', p0ErrorHtml(e)));
    }
}

function p0RenderTeamDetail(d) {
    var t = d.team || {};
    var apps = d.applications || [];
    var isOwner = !!t.isOwner;
    var pct = Math.min(100, Math.round((Number(t.joined_count) || 1) / (Number(t.need_count) || 3) * 100));

    var actions = '';
    if (isOwner) {
        actions = t.status === 'open'
            ? '<button class="p0-btn danger" onclick="p0CloseTeam(' + Number(t.id) + ')">关闭招募</button>'
            : '<span class="p0-chip gray">招募已关闭</span>';
    } else if (!p0IsLogged()) {
        actions = '<button class="p0-btn primary" onclick="p0CloseModal();openAuthModal(\'login\')">登录后申请</button>';
    } else if (t.myStatus === 'pending') {
        actions = '<span class="p0-chip gray">已申请，等待队长处理</span>';
    } else if (t.myStatus === 'accepted') {
        actions = '<span class="p0-chip green">你已在这个队伍里</span>';
    } else if (t.status === 'open') {
        actions = '<button class="p0-btn primary" onclick="p0OpenApply(' + Number(t.id) + ')">申请加入</button>';
    } else {
        actions = '<span class="p0-chip gray">已停止招募</span>';
    }

    var appHtml = '';
    if (isOwner) {
        appHtml = '<div class="p0-section-title">📥 收到的申请 <span class="p0-chip gray">' + apps.length + '</span></div>' +
            (apps.length ? '<div class="p0-list">' + apps.map(function (a) {
                var st = a.status === 'accepted' ? '<span class="p0-chip green">已通过</span>'
                    : a.status === 'rejected' ? '<span class="p0-chip red">已拒绝</span>'
                    : '<span class="p0-chip orange">待处理</span>';
                var btns = a.status === 'pending'
                    ? '<button class="p0-btn sm primary" onclick="p0Decide(' + Number(a.id) + ',\'accepted\',' + Number(t.id) + ')">通过</button>' +
                      '<button class="p0-btn sm danger" onclick="p0Decide(' + Number(a.id) + ',\'rejected\',' + Number(t.id) + ')">拒绝</button>'
                    : '';
                return '<div class="p0-list-item"><div class="p0-li-main">' +
                    '<div class="p0-li-title">' + p0Esc(a.nickname || '同学') +
                        (a.verified ? '<span class="p0-badge" style="margin-left:6px">✅ 已认证</span>' : '') + '</div>' +
                    '<div class="p0-li-sub">' + p0Esc([a.college, a.major].filter(Boolean).join(' · ')) + ' ' + p0Date(a.created_at) + '</div>' +
                    (a.message ? '<div class="p0-review-text">' + p0Esc(a.message) + '</div>' : '') +
                    '</div><div class="p0-li-actions">' + st + btns + '</div></div>';
            }).join('') + '</div>' : '<div class="p0-empty">还没有人申请。把队伍分享给同学，或者去课程页发一条。</div>');
    }

    var body =
        '<div class="p0-card-foot">' +
            '<span class="p0-chip ' + p0KindClass(t.kind) + '">' + p0KindLabel(t.kind) + '</span>' +
            (t.competition ? '<span class="p0-chip orange">🏆 ' + p0Esc(t.competition) + '</span>' : '') +
            '<span class="p0-chip ' + (t.status === 'open' ? 'green' : 'gray') + '">' + (t.joined_count || 1) + '/' + (t.need_count || 3) + ' 人</span>' +
            (t.deadline ? '<span class="p0-chip gray">截止 ' + p0Esc(String(t.deadline).slice(0, 10)) + '</span>' : '') +
        '</div>' +
        '<div class="p0-progress"><i style="width:' + pct + '%"></i></div>' +
        '<p style="color:#33475e;line-height:1.8;font-size:14px;margin-top:12px;white-space:pre-wrap">' + p0Esc(t.desc_text || '队长还没有写介绍。') + '</p>' +
        '<div class="p0-meta">发起人：' + p0Esc(t.owner_nickname || '同学') + (t.owner_college ? ' · ' + p0Esc(t.owner_college) : '') + '</div>' +
        (t.skills ? '<div class="p0-card-foot"><span class="p0-chip gray">需要：' + p0Esc(t.skills) + '</span></div>' : '') +
        '<div class="p0-actions" style="margin-top:16px">' + actions + '</div>' +
        appHtml;

    p0Modal(p0ModalShell(t.title || '队伍详情', body));
}

function p0OpenTeamForm(courseId) {
    if (!p0IsLogged()) { if (typeof requireLogin === 'function') requireLogin('发起组队'); return; }
    var courseOptions = '<option value="">不关联课程</option>' + P0.courses.map(function (c) {
        return '<option value="' + Number(c.id) + '"' + (Number(courseId) === Number(c.id) ? ' selected' : '') + '>' + p0Esc(c.name) + '</option>';
    }).join('');

    var body =
        '<div class="p0-hint blue">写清楚「打什么比赛 / 缺什么角色 / 什么时候截止」，通过率会高很多。发布需要已认证的校园身份。</div>' +
        '<div class="p0-field"><label>队伍标题 *</label><input id="p0-t-title" class="p0-input" placeholder="如：互联网+ 校赛，缺一个前端"></div>' +
        '<div class="p0-row2">' +
            '<div class="p0-field"><label>类型</label><select id="p0-t-kind" class="p0-select"><option value="competition">竞赛组队</option><option value="course">课程大作业</option><option value="study">学习搭子</option></select></div>' +
            '<div class="p0-field"><label>招募人数（含自己）</label><input id="p0-t-need" class="p0-input" type="number" min="2" max="20" value="3"></div>' +
        '</div>' +
        '<div class="p0-row2">' +
            '<div class="p0-field"><label>比赛名称</label><input id="p0-t-comp" class="p0-input" placeholder="如：中国国际大学生创新大赛"></div>' +
            '<div class="p0-field"><label>截止日期</label><input id="p0-t-deadline" class="p0-input" type="date"></div>' +
        '</div>' +
        '<div class="p0-field"><label>关联课程（可选）</label><select id="p0-t-course" class="p0-select">' + courseOptions + '</select></div>' +
        '<div class="p0-field"><label>需要的技能</label><input id="p0-t-skills" class="p0-input" placeholder="如：前端,UI设计,答辩"></div>' +
        '<div class="p0-field"><label>队伍介绍</label><textarea id="p0-t-desc" class="p0-textarea" placeholder="项目方向、目前进度、希望队友做什么、联系方式怎么给（建议站内申请，不要直接留手机号）"></textarea></div>' +
        '<div class="p0-modal-foot"><button class="p0-btn" onclick="p0CloseModal()">取消</button><button class="p0-btn primary" id="p0-t-submit" onclick="p0SubmitTeam()">发布队伍</button></div>';
    p0Modal(p0ModalShell('发起组队', body));
}

async function p0SubmitTeam() {
    var title = document.getElementById('p0-t-title').value.trim();
    if (title.length < 2) { p0Toast('队伍标题至少 2 个字', 'err'); return; }
    var btn = document.getElementById('p0-t-submit');
    if (btn) { btn.disabled = true; btn.textContent = '发布中…'; }
    try {
        await p0Fetch('/api/teams', {
            method: 'POST',
            body: {
                action: 'create',
                title: title,
                kind: document.getElementById('p0-t-kind').value,
                need_count: Number(document.getElementById('p0-t-need').value) || 3,
                competition: document.getElementById('p0-t-comp').value,
                deadline: document.getElementById('p0-t-deadline').value,
                course_id: document.getElementById('p0-t-course').value || null,
                skills: document.getElementById('p0-t-skills').value,
                desc: document.getElementById('p0-t-desc').value
            }
        });
        p0Toast('队伍已发布', 'ok');
        p0CloseModal();
        P0.loaded.teams = false;
        p0LoadTeams();
    } catch (e) {
        p0Toast(e.message || '发布失败', 'err');
        if (btn) { btn.disabled = false; btn.textContent = '发布队伍'; }
    }
}

function p0OpenApply(teamId) {
    if (!p0IsLogged()) { if (typeof requireLogin === 'function') requireLogin('申请入队'); return; }
    var body =
        '<div class="p0-hint">申请会发给队长，由队长决定是否通过。建议写清楚你能负责的部分和可投入时间，不要直接留手机号。</div>' +
        '<div class="p0-field"><label>申请留言</label><textarea id="p0-apply-msg" class="p0-textarea" placeholder="如：我会前端（Vue/小程序），每周能投入 10 小时，做过 2 个课程项目"></textarea></div>' +
        '<div class="p0-modal-foot"><button class="p0-btn" onclick="p0CloseModal()">取消</button><button class="p0-btn primary" onclick="p0SubmitApply(' + Number(teamId) + ')">发送申请</button></div>';
    p0Modal(p0ModalShell('申请加入', body));
}

async function p0SubmitApply(teamId) {
    var msg = document.getElementById('p0-apply-msg').value.trim();
    try {
        await p0Fetch('/api/teams', { method: 'POST', body: { action: 'apply', team_id: teamId, message: msg } });
        p0Toast('申请已发送，等队长处理', 'ok');
        p0CloseModal();
        P0.loaded.teams = false;
        p0LoadTeams();
        p0OpenTeam(teamId);
    } catch (e) {
        p0Toast(e.message || '申请失败', 'err');
    }
}

async function p0Decide(appId, decision, teamId) {
    try {
        await p0Fetch('/api/teams', { method: 'POST', body: { action: 'decide', application_id: appId, decision: decision } });
        p0Toast(decision === 'accepted' ? '已通过' : '已拒绝', 'ok');
        P0.loaded.teams = false;
        p0LoadTeams();
        if (P0.module === 'mine') p0LoadMine(true);
        if (teamId) p0OpenTeam(teamId);
    } catch (e) {
        p0Toast(e.message || '操作失败', 'err');
    }
}

async function p0CloseTeam(teamId) {
    var ok = true;
    if (typeof askConfirm === 'function') {
        ok = await askConfirm('关闭后队伍将不再显示"招募中"，也不能再收到新申请。确定关闭吗？', { title: '关闭招募', okText: '确定关闭', icon: '🤝' });
    }
    if (!ok) return;
    try {
        await p0Fetch('/api/teams', { method: 'POST', body: { action: 'close', team_id: teamId } });
        p0Toast('已关闭招募', 'ok');
        P0.loaded.teams = false;
        p0LoadTeams();
        p0OpenTeam(teamId);
    } catch (e) {
        p0Toast(e.message || '操作失败', 'err');
    }
}

/* ---------------- 失物招领 ---------------- */

async function p0LoadLostFound() {
    var sec = document.getElementById('p0-lostfound');
    if (!sec) return;
    sec.innerHTML = '<div class="p0-panel"><div class="p0-loading">正在加载失物招领…</div></div>';
    try {
        var qs = '/api/lostfound?kind=' + encodeURIComponent(P0.lfKind);
        if (P0.lfQ) qs += '&q=' + encodeURIComponent(P0.lfQ);
        var data = await p0Fetch(qs);
        P0.lostfound = data.items || [];
        P0.loaded.lostfound = true;
        p0RenderLostFound();
    } catch (e) {
        sec.innerHTML = '<div class="p0-panel">' + p0ErrorHtml(e) + '</div>';
    }
}

function p0RenderLostFound() {
    var sec = document.getElementById('p0-lostfound');
    if (!sec) return;

    var tabs = [['all', '全部'], ['lost', '🔴 我丢了'], ['found', '🟢 我捡到了']].map(function (k) {
        return '<button class="p0-subtab' + (P0.lfKind === k[0] ? ' active' : '') + '" onclick="p0LFKind(\'' + k[0] + '\')">' + k[1] + '</button>';
    }).join('');

    var cards = P0.lostfound.map(function (it) {
        var img = it.image_url
            ? '<img class="p0-lf-thumb" src="' + p0Esc(p0Safe(it.image_url)) + '" loading="lazy" decoding="async" alt="">'
            : '<div class="p0-lf-thumb p0-lf-noimg">🔍</div>';
        var status = it.status === 'resolved' ? '<span class="p0-chip green">已找回</span>'
            : it.status === 'closed' ? '<span class="p0-chip gray">已关闭</span>'
            : '<span class="p0-chip orange">寻找中</span>';
        var mine = it.myClaim
            ? '<span class="p0-chip gray">' + (it.myClaim === 'accepted' ? '已确认' : '已提交线索') + '</span>'
            : '';
        return '<div class="p0-card p0-lf-card" onclick="p0OpenLostFound(' + Number(it.id) + ')">' +
            img +
            '<div class="p0-lf-main">' +
                '<div class="p0-card-title">' + p0Esc(it.title) + '</div>' +
                '<div class="p0-meta">' + (it.kind === 'found' ? '🟢 我捡到了' : '🔴 我丢了') +
                    (it.place ? ' · ' + p0Esc(it.place) : '') +
                    (it.happened_at ? ' · ' + p0Esc(String(it.happened_at).slice(0, 10)) : '') + '</div>' +
                '<div class="p0-card-foot">' + status + mine + (it.isOwner ? '<span class="p0-chip">我发布的</span>' : '') + '</div>' +
            '</div></div>';
    }).join('');

    sec.innerHTML = '<div class="p0-panel">' +
        '<div class="p0-head">' +
            '<div><h3>🔍 失物招领</h3><p class="p0-sub">丢了 / 捡到东西发一条，有照片更容易认领 · 共 ' + P0.lostfound.length + ' 条</p></div>' +
            '<div class="p0-actions">' +
                '<input class="p0-input" id="p0-lf-q" value="' + p0Esc(P0.lfQ) + '" placeholder="搜物品 / 地点" onkeydown="if(event.key===\'Enter\'){p0LFSearch()}">' +
                '<button class="p0-btn" onclick="p0LFSearch()">搜索</button>' +
                '<button class="p0-btn primary" onclick="p0OpenLostFoundForm()">＋ 发布</button>' +
            '</div>' +
        '</div>' +
        '<div class="p0-subtabs">' + tabs + '</div>' +
        (P0.lostfound.length ? '<div class="p0-grid">' + cards + '</div>'
            : '<div class="p0-empty">还没有失物信息。<br>发布一条「捡到校园卡」或「丢了耳机」，让同校同学能看到。</div>') +
        '</div>';
}

function p0LFKind(kind) {
    P0.lfKind = kind;
    P0.loaded.lostfound = false;
    p0LoadLostFound();
}

function p0LFSearch() {
    var input = document.getElementById('p0-lf-q');
    P0.lfQ = input ? input.value.trim() : '';
    P0.loaded.lostfound = false;
    p0LoadLostFound();
}

function p0OpenLostFoundForm() {
    if (!p0IsLogged()) { if (typeof requireLogin === 'function') requireLogin('发布失物招领'); return; }
    var body =
        '<div class="p0-hint blue">写清楚「丢了什么 / 在哪丢的 / 什么时候」，再配一张照片，找回概率会高很多。<br>发布需要已认证的校园身份。</div>' +
        '<div class="p0-row2">' +
            '<div class="p0-field"><label>类型</label><select id="p0-lf-kind" class="p0-select"><option value="lost">🔴 我丢了</option><option value="found">🟢 我捡到了</option></select></div>' +
            '<div class="p0-field"><label>发生日期</label><input id="p0-lf-date" class="p0-input" type="date"></div>' +
        '</div>' +
        '<div class="p0-field"><label>物品名称 *</label><input id="p0-lf-title" class="p0-input" maxlength="60" placeholder="如：校园卡 / 黑色耳机 / 一把钥匙"></div>' +
        '<div class="p0-field"><label>地点</label><input id="p0-lf-place" class="p0-input" maxlength="60" placeholder="如：一食堂二楼 / 图书馆三楼"></div>' +
        '<div class="p0-field"><label>照片（可选，建议上传）</label><input id="p0-lf-photo" class="p0-input" type="file" accept="image/*" style="background:#fff"></div>' +
        '<div class="p0-field"><label>补充描述</label><textarea id="p0-lf-desc" class="p0-textarea" maxlength="800" placeholder="颜色、特征、里面有什么、怎么联系你（建议站内留言，不要直接留手机号）"></textarea></div>' +
        '<div class="p0-modal-foot"><button class="p0-btn" onclick="p0CloseModal()">取消</button><button class="p0-btn primary" id="p0-lf-submit" onclick="p0SubmitLostFound()">发布</button></div>';
    p0Modal(p0ModalShell('发布失物招领', body));
}

async function p0SubmitLostFound() {
    var title = (document.getElementById('p0-lf-title').value || '').trim();
    if (title.length < 2) { p0Toast('物品名称至少 2 个字', 'err'); return; }
    var photoEl = document.getElementById('p0-lf-photo');
    var file = photoEl && photoEl.files ? photoEl.files[0] : null;
    var btn = document.getElementById('p0-lf-submit');
    if (btn) { btn.disabled = true; btn.textContent = '发布中…'; }

    try {
        var imageUrl = '';
        if (file) {
            var maxMb = (typeof MAX_IMAGE_MB !== 'undefined') ? MAX_IMAGE_MB : 15;
            if (file.size > maxMb * 1024 * 1024) throw new Error('照片超过 ' + maxMb + 'MB，请先压缩或换一张');
            if (typeof supabaseClient === 'undefined' || !supabaseClient.storage) throw new Error('存储组件未加载，请刷新页面重试');
            var uploadFile = file;
            if (typeof compressImageFile === 'function') uploadFile = await compressImageFile(file, 1600, 0.82);
            var bucket = (typeof BUCKET_NAME !== 'undefined') ? BUCKET_NAME : 'file';
            var name = 'lostfound_' + Date.now() + '.jpg';
            var up = await supabaseClient.storage.from(bucket).upload(name, uploadFile);
            if (up.error) throw new Error('照片上传失败：' + up.error.message);
            var pub = supabaseClient.storage.from(bucket).getPublicUrl(name);
            imageUrl = (pub.data && pub.data.publicUrl) || '';
        }

        await p0Fetch('/api/lostfound', {
            method: 'POST',
            body: {
                action: 'create',
                kind: document.getElementById('p0-lf-kind').value,
                title: title,
                place: document.getElementById('p0-lf-place').value,
                happened_at: document.getElementById('p0-lf-date').value,
                desc: document.getElementById('p0-lf-desc').value,
                image_url: imageUrl
            }
        });
        p0Toast('已发布，等同学提供线索', 'ok');
        p0CloseModal();
        P0.loaded.lostfound = false;
        p0LoadLostFound();
    } catch (e) {
        p0Toast(e.message || '发布失败', 'err');
        if (btn) { btn.disabled = false; btn.textContent = '发布'; }
    }
}

async function p0OpenLostFound(id) {
    var seq = p0Modal(p0ModalShell('失物详情', '<div class="p0-loading">正在加载…</div>'));
    try {
        var d = await p0Fetch('/api/lostfound?id=' + encodeURIComponent(id));
        if (seq !== P0.modalSeq) return;
        p0RenderLostFoundDetail(d);
    } catch (e) {
        if (seq !== P0.modalSeq) return;
        p0Modal(p0ModalShell('失物详情', p0ErrorHtml(e)));
    }
}

function p0RenderLostFoundDetail(d) {
    var it = d.item || {};
    var claims = d.claims || [];
    var isOwner = !!d.isOwner;
    var id = Number(it.id);
    var open = it.status === 'open';

    var statusText = it.status === 'resolved' ? '✅ 已找回' : it.status === 'closed' ? '已关闭' : '寻找中';
    var head = '<div class="p0-lf-detail-head">' +
        '<div class="p0-card-foot">' +
            '<span class="p0-chip ' + (it.kind === 'found' ? 'green' : 'red') + '">' + (it.kind === 'found' ? '🟢 我捡到了' : '🔴 我丢了') + '</span>' +
            '<span class="p0-chip ' + (it.status === 'open' ? 'orange' : 'gray') + '">' + statusText + '</span>' +
        '</div>' +
        '<div class="p0-meta">' + p0Esc([it.place, it.happened_at ? String(it.happened_at).slice(0, 10) : '', it.owner_nickname ? 'by ' + it.owner_nickname : ''].filter(Boolean).join(' · ')) + '</div>' +
    '</div>';

    var img = it.image_url
        ? '<img class="p0-lf-photo" src="' + p0Esc(p0Safe(it.image_url)) + '" loading="lazy" decoding="async" alt="失物照片">'
        : '';

    var claimHtml = '';
    if (isOwner) {
        claimHtml = '<div class="p0-section-title">📨 收到的线索 <span class="p0-chip gray">' + claims.length + '</span></div>' +
            (claims.length ? '<div class="p0-list">' + claims.map(function (c) {
                var st = c.status === 'accepted' ? '<span class="p0-chip green">已确认</span>'
                    : c.status === 'rejected' ? '<span class="p0-chip red">已拒绝</span>'
                    : '<span class="p0-chip orange">待处理</span>';
                var btns = c.status === 'pending'
                    ? '<button class="p0-btn sm primary" onclick="p0DecideClaim(' + Number(c.id) + ',\'accepted\',' + id + ')">确认</button>' +
                      '<button class="p0-btn sm danger" onclick="p0DecideClaim(' + Number(c.id) + ',\'rejected\',' + id + ')">拒绝</button>'
                    : '';
                return '<div class="p0-list-item"><div class="p0-li-main">' +
                    '<div class="p0-li-title">' + p0Esc(c.nickname || '同学') + (c.verified ? '<span class="p0-badge" style="margin-left:6px">✅ 已认证</span>' : '') + '</div>' +
                    '<div class="p0-li-sub">' + p0Esc([c.college, c.major].filter(Boolean).join(' · ')) + ' ' + p0Date(c.created_at) + '</div>' +
                    (c.message ? '<div class="p0-review-text">' + p0Esc(c.message) + '</div>' : '') +
                    '</div><div class="p0-li-actions">' + st + btns + '</div></div>';
            }).join('') + '</div>'
            : '<div class="p0-empty">还没有人提供线索。把这条分享给同学，或者先等一等。</div>');
    }

    var actionHtml = '';
    if (isOwner) {
        actionHtml = '<div class="p0-actions" style="margin-top:14px">' +
            (open ? '<button class="p0-btn primary" onclick="p0CloseLF(' + id + ',\'resolved\')">✅ 标记已找回</button>' : '') +
            (open ? '<button class="p0-btn danger" onclick="p0CloseLF(' + id + ',\'closed\')">关闭信息</button>' : '') +
        '</div>';
    } else if (open) {
        if (!p0IsLogged()) {
            actionHtml = '<div class="p0-hint">登录并完成校园认证后，可以提交认领线索。<button class="p0-btn sm" onclick="p0CloseModal();openAuthModal(\'login\')">去登录</button></div>';
        } else if (d.myClaim) {
            actionHtml = '<div class="p0-hint blue">你已提交线索，状态：' +
                (d.myClaim.status === 'accepted' ? '已确认' : d.myClaim.status === 'rejected' ? '未通过' : '等待发布者处理') + '</div>';
        } else {
            actionHtml = '<div class="p0-section-title">🙋 我捡到了 / 这是我的</div>' +
                '<div class="p0-hint">留一句只有失主能对上的线索（如“卡套是蓝色的”“耳机盒上有贴纸”），发布者会看到。不要在这里留手机号。</div>' +
                '<textarea id="p0-claim-msg" class="p0-textarea" maxlength="500" placeholder="描述你捡到的东西 / 证明这是你的东西"></textarea>' +
                '<div class="p0-actions" style="margin-top:10px"><button class="p0-btn primary" onclick="p0SubmitClaim(' + id + ')">提交线索</button></div>';
        }
    }

    var body = head + img +
        '<p style="color:#33475e;line-height:1.8;font-size:14px;margin-top:12px;white-space:pre-wrap">' + p0Esc(it.desc_text || '发布者没有写补充描述。') + '</p>' +
        actionHtml + claimHtml;

    p0Modal(p0ModalShell(it.title || '失物详情', body));
}

async function p0SubmitClaim(itemId) {
    var el = document.getElementById('p0-claim-msg');
    var msg = el ? el.value.trim() : '';
    try {
        await p0Fetch('/api/lostfound', { method: 'POST', body: { action: 'claim', item_id: itemId, message: msg } });
        p0Toast('线索已提交，等发布者处理', 'ok');
        P0.loaded.lostfound = false;
        p0LoadLostFound();
        p0OpenLostFound(itemId);
    } catch (e) {
        p0Toast(e.message || '提交失败', 'err');
    }
}

async function p0DecideClaim(claimId, decision, itemId) {
    try {
        await p0Fetch('/api/lostfound', { method: 'POST', body: { action: 'decide', claim_id: claimId, decision: decision } });
        p0Toast(decision === 'accepted' ? '已确认，信息标记为已找回' : '已拒绝', 'ok');
        P0.loaded.lostfound = false;
        p0LoadLostFound();
        p0OpenLostFound(itemId);
    } catch (e) {
        p0Toast(e.message || '操作失败', 'err');
    }
}

async function p0CloseLF(itemId, status) {
    var ok = true;
    if (typeof askConfirm === 'function') {
        ok = await askConfirm(status === 'resolved' ? '确认已经找回？信息会标记为「已找回」。' : '关闭后不再显示为寻找中，确定吗？',
            { title: '失物招领', okText: '确定', icon: '🔍' });
    }
    if (!ok) return;
    try {
        await p0Fetch('/api/lostfound', { method: 'POST', body: { action: 'close', item_id: itemId, status: status } });
        p0Toast('已更新', 'ok');
        P0.loaded.lostfound = false;
        p0LoadLostFound();
        p0OpenLostFound(itemId);
    } catch (e) {
        p0Toast(e.message || '操作失败', 'err');
    }
}

/* ---------------- 数据看板 ---------------- */

function p0Num(n) {
    var v = Number(n) || 0;
    return v.toLocaleString('zh-CN');
}

async function p0LoadStats() {
    var sec = document.getElementById('p0-stats');
    if (!sec) return;
    sec.innerHTML = '<div class="p0-panel"><div class="p0-loading">正在读取真实数据…</div></div>';
    try {
        var data = await p0Fetch('/api/stats');
        P0.stats = data;
        P0.loaded.stats = true;
        p0RenderStats();
    } catch (e) {
        sec.innerHTML = '<div class="p0-panel">' + p0ErrorHtml(e) + '</div>';
    }
}

function p0RenderStats() {
    var sec = document.getElementById('p0-stats');
    if (!sec) return;
    var d = P0.stats || {};
    var s = d.stats || {};
    var top = d.topDocs || [];

    var cards = [
        ['👀', '累计访问', s.visits],
        ['📅', '今日访问', s.visitsToday],
        ['📥', '资料下载', s.downloads],
        ['🤖', 'AI 提问', s.ai],
        ['🎓', '课程数', s.courses],
        ['🤝', '组队数', s.teams],
        ['🔍', '失物发布', s.lostfound],
        ['✅', '已找回', s.lostfoundResolved],
        ['📚', '资料数', s.docs],
        ['👥', '注册用户', s.users]
    ].map(function (x) {
        return '<div class="p0-stat-card"><div class="p0-stat-icon">' + x[0] + '</div>' +
            '<div class="p0-stat-num">' + p0Num(x[2]) + '</div>' +
            '<div class="p0-stat-label">' + x[1] + '</div></div>';
    }).join('');

    var max = top.reduce(function (m, x) { return Math.max(m, Number(x.views) || 0); }, 1);
    var bars = top.length ? top.map(function (x) {
        var w = Math.max(4, Math.round((Number(x.views) || 0) / max * 100));
        return '<div class="p0-bar-row">' +
            '<span class="p0-bar-name">' + p0Esc(x.name) + '</span>' +
            '<span class="p0-bar-track"><i style="width:' + w + '%"></i></span>' +
            '<span class="p0-bar-val">' + p0Num(x.views) + '</span></div>';
    }).join('') : '<div class="p0-empty">还没有下载数据。等第一份资料被查看后，这里就会出现排名。</div>';

    sec.innerHTML = '<div class="p0-panel">' +
        '<div class="p0-head">' +
            '<div><h3>📊 数据看板</h3><p class="p0-sub">站内真实埋点，60 秒缓存 · 更新于 ' + p0Esc(new Date(d.generatedAt || Date.now()).toLocaleString('zh-CN')) + '</p></div>' +
            '<div class="p0-actions"><button class="p0-btn" onclick="p0LoadStats()">🔄 刷新</button></div>' +
        '</div>' +
        '<div class="p0-stat-grid">' + cards + '</div>' +
        '<div class="p0-section-title">🔥 资料下载排行</div>' +
        bars +
        '<p class="p0-meta" style="margin-top:16px">数据来自 /api/track 的真实访问、下载和 AI 提问记录；不包含任何个人信息。</p>' +
        '</div>';
}

/* ---------------- 我的 ---------------- */

async function p0LoadMine(force) {
    var sec = document.getElementById('p0-mine');
    if (!sec) return;

    if (!p0IsLogged()) {
        P0.loaded.mine = false;
        sec.innerHTML = '<div class="p0-panel">' +
            '<div class="p0-head"><div><h3>👤 我的</h3><p class="p0-sub">登录后可以管理资料、组队和校园认证</p></div></div>' +
            '<div class="p0-empty">你当前是游客。<br><br>' +
            '<button class="p0-btn primary" onclick="openAuthModal(\'login\')">登录</button> ' +
            '<button class="p0-btn" onclick="openAuthModal(\'register\')">注册</button></div></div>';
        return;
    }

    if (!force && P0.mine) { p0RenderMine(P0.mine); return; }

    sec.innerHTML = '<div class="p0-panel"><div class="p0-loading">正在加载我的资料…</div></div>';
    try {
        var data = await p0Fetch('/api/profile?action=me');
        P0.mine = data;
        P0.loaded.mine = true;
        p0RenderMine(data);
    } catch (e) {
        sec.innerHTML = '<div class="p0-panel">' + p0ErrorHtml(e) + '</div>';
    }
}

function p0RenderMine(d) {
    var sec = document.getElementById('p0-mine');
    if (!sec) return;
    var p = d.profile || {};
    var counts = d.counts || {};
    var nickname = p.nickname || (currentUser && currentUser.email ? String(currentUser.email).split('@')[0] : '同学');
    var verified = !!p.verified;
    var initial = String(nickname).charAt(0).toUpperCase();

    var incoming = d.incoming || [];
    var incomingHtml = incoming.length ? incoming.map(function (a) {
        return '<div class="p0-list-item"><div class="p0-li-main">' +
            '<div class="p0-li-title">' + p0Esc(a.nickname) + (a.verified ? '<span class="p0-badge" style="margin-left:6px">✅ 已认证</span>' : '') + '</div>' +
            '<div class="p0-li-sub">申请加入「' + p0Esc(a.team_title) + '」· ' + p0Esc([a.college, a.major].filter(Boolean).join(' · ')) + ' · ' + p0Date(a.created_at) + '</div>' +
            (a.message ? '<div class="p0-review-text">' + p0Esc(a.message) + '</div>' : '') +
            '</div><div class="p0-li-actions">' +
            '<button class="p0-btn sm primary" onclick="p0Decide(' + Number(a.id) + ',\'accepted\',' + Number(a.team_id) + ')">通过</button>' +
            '<button class="p0-btn sm danger" onclick="p0Decide(' + Number(a.id) + ',\'rejected\',' + Number(a.team_id) + ')">拒绝</button>' +
            '</div></div>';
    }).join('') : '<div class="p0-empty">暂无待处理申请。你发布的队伍收到申请后会出现在这里。</div>';

    var docs = d.myDocs || [];
    var docsHtml = docs.length ? docs.map(function (x) {
        return '<div class="p0-list-item"><div class="p0-li-main">' +
            '<div class="p0-li-title">📄 ' + p0Esc(x.name || '未命名资料') + (x.status === 'takedown' ? ' <span class="p0-chip red">已下架</span>' : '') + '</div>' +
            '<div class="p0-li-sub">' + p0Esc(x.type || '') + ' · ' + p0Date(x.created_at) + '</div>' +
            '</div><div class="p0-li-actions">' +
            (x.link ? '<a class="p0-btn sm" href="' + p0Esc(p0Safe(x.link)) + '" target="_blank" rel="noopener noreferrer">打开</a>' : '<span class="p0-chip gray">无文件</span>') +
            '</div></div>';
    }).join('') : '<div class="p0-empty">还没上传过资料。去课程页选一门课，把课件传上去。</div>';

    var myTeams = d.myTeams || [];
    var teamsHtml = myTeams.length ? myTeams.map(function (t) {
        return '<div class="p0-list-item"><div class="p0-li-main">' +
            '<div class="p0-li-title">🤝 ' + p0Esc(t.title) + '</div>' +
            '<div class="p0-li-sub">' + p0KindLabel(t.kind) + ' · ' + (t.joined_count || 1) + '/' + (t.need_count || 3) + ' 人 · ' + (t.status === 'open' ? '招募中' : '已关闭') + ' · ' + p0Date(t.created_at) + '</div>' +
            '</div><div class="p0-li-actions">' +
            '<button class="p0-btn sm" onclick="p0OpenTeam(' + Number(t.id) + ')">管理</button>' +
            '</div></div>';
    }).join('') : '<div class="p0-empty">还没发起过队伍。竞赛缺人时，去组队广场发一个。</div>';

    var apps = d.myApplications || [];
    var appsHtml = apps.length ? apps.map(function (a) {
        var st = a.status === 'accepted' ? '<span class="p0-chip green">已通过</span>'
            : a.status === 'rejected' ? '<span class="p0-chip red">未通过</span>'
            : '<span class="p0-chip orange">等待处理</span>';
        return '<div class="p0-list-item"><div class="p0-li-main">' +
            '<div class="p0-li-title">' + p0Esc(a.team_title || '队伍') + '</div>' +
            '<div class="p0-li-sub">' + p0Date(a.created_at) + '</div>' +
            '</div><div class="p0-li-actions">' + st +
            '<button class="p0-btn sm" onclick="p0OpenTeam(' + Number(a.team_id) + ')">查看</button></div></div>';
    }).join('') : '<div class="p0-empty">还没申请过队伍。去组队广场看看谁在招人。</div>';

    sec.innerHTML =
        '<div class="p0-panel">' +
            '<div class="p0-profile">' +
                '<div class="p0-avatar">' + p0Esc(initial) + '</div>' +
                '<div style="min-width:0">' +
                    '<div class="p0-profile-name">' + p0Esc(nickname) +
                        (verified ? '<span class="p0-badge">✅ 校园已认证</span>' : '<span class="p0-badge off">未认证</span>') +
                    '</div>' +
                    '<div class="p0-profile-sub">' + p0Esc(p.email || (currentUser && currentUser.email) || '') + '</div>' +
                    '<div class="p0-profile-sub">' + p0Esc([p.college, p.major, p.grade ? p.grade + ' 级' : ''].filter(Boolean).join(' · ') || '还没填学院 / 专业 / 年级') + '</div>' +
                    (p.bio ? '<div class="p0-profile-sub">' + p0Esc(p.bio) + '</div>' : '') +
                '</div>' +
                '<div class="p0-points"><b>' + (d.points || 0) + '</b><span>贡献值</span></div>' +
            '</div>' +
            '<div class="p0-actions" style="margin-top:16px">' +
                '<button class="p0-btn primary" onclick="p0EditProfile()">✏️ 编辑资料</button>' +
                '<button class="p0-btn" onclick="p0OpenVerify()">' + (verified ? '✅ 已认证' : '🛡 校园认证') + '</button>' +
                '<button class="p0-btn ghost" onclick="p0LoadMine(true)">🔄 刷新</button>' +
            '</div>' +
            '<div class="p0-stat-row">' +
                '<div class="p0-stat"><b>' + (counts.docs || 0) + '</b><span>我的资料</span></div>' +
                '<div class="p0-stat"><b>' + (counts.teams || 0) + '</b><span>我的队伍</span></div>' +
                '<div class="p0-stat"><b>' + (counts.applications || 0) + '</b><span>我的申请</span></div>' +
                '<div class="p0-stat"><b>' + (counts.incoming || 0) + '</b><span>待处理</span></div>' +
            '</div>' +
        '</div>' +
        '<div class="p0-panel"><div class="p0-section-title">📥 待处理申请 <span class="p0-chip gray">' + incoming.length + '</span></div><div class="p0-list">' + incomingHtml + '</div></div>' +
        '<div class="p0-panel"><div class="p0-section-title">📚 我的资料 <span class="p0-chip gray">' + docs.length + '</span></div><div class="p0-list">' + docsHtml + '</div></div>' +
        '<div class="p0-panel"><div class="p0-section-title">🤝 我的队伍 <span class="p0-chip gray">' + myTeams.length + '</span></div><div class="p0-list">' + teamsHtml + '</div></div>' +
        '<div class="p0-panel"><div class="p0-section-title">📨 我的申请 <span class="p0-chip gray">' + apps.length + '</span></div><div class="p0-list">' + appsHtml + '</div></div>';
}

function p0EditProfile() {
    if (!p0IsLogged()) return;
    var p = (P0.mine && P0.mine.profile) || {};
    var body =
        '<div class="p0-field"><label>昵称 *</label><input id="p0-p-nickname" class="p0-input" maxlength="20" value="' + p0Esc(p.nickname || '') + '"></div>' +
        '<div class="p0-row2">' +
            '<div class="p0-field"><label>学院</label><input id="p0-p-college" class="p0-input" maxlength="30" value="' + p0Esc(p.college || '') + '" placeholder="如：计算机学院"></div>' +
            '<div class="p0-field"><label>专业</label><input id="p0-p-major" class="p0-input" maxlength="30" value="' + p0Esc(p.major || '') + '" placeholder="如：软件工程"></div>' +
        '</div>' +
        '<div class="p0-field"><label>年级</label><input id="p0-p-grade" class="p0-input" maxlength="10" value="' + p0Esc(p.grade || '') + '" placeholder="如：2024"></div>' +
        '<div class="p0-field"><label>一句话介绍</label><input id="p0-p-bio" class="p0-input" maxlength="120" value="' + p0Esc(p.bio || '') + '" placeholder="如：会一点前端，正在准备互联网+"></div>' +
        '<div class="p0-modal-foot"><button class="p0-btn" onclick="p0CloseModal()">取消</button><button class="p0-btn primary" onclick="p0SubmitProfile()">保存</button></div>';
    p0Modal(p0ModalShell('编辑资料', body));
}

async function p0SubmitProfile() {
    var nickname = document.getElementById('p0-p-nickname').value.trim();
    if (!nickname) { p0Toast('昵称不能为空', 'err'); return; }
    try {
        await p0Fetch('/api/profile', {
            method: 'POST',
            body: {
                action: 'save',
                nickname: nickname,
                college: document.getElementById('p0-p-college').value,
                major: document.getElementById('p0-p-major').value,
                grade: document.getElementById('p0-p-grade').value,
                bio: document.getElementById('p0-p-bio').value
            }
        });
        p0Toast('资料已保存', 'ok');
        p0CloseModal();
        p0LoadMine(true);
    } catch (e) {
        p0Toast(e.message || '保存失败', 'err');
    }
}

function p0OpenVerify() {
    if (!p0IsLogged()) { if (typeof requireLogin === 'function') requireLogin('校园认证'); return; }
    var verified = !!(P0.mine && P0.mine.profile && P0.mine.profile.verified);
    var body = verified
        ? '<div class="p0-hint blue">你已完成校园认证，可以建课程、发组队、写攻略。</div>'
        : '<div class="p0-hint">认证后才能在课程中心建课、在组队广场发帖、写课程攻略。认证方式二选一：<br>① 用学校邮箱注册 / 登录（学校在后台配置了域名白名单时自动通过）<br>② 输入学生会或管理员发给你的班级邀请码</div>' +
          '<div class="p0-field"><label>班级邀请码</label><input id="p0-v-code" class="p0-input" placeholder="向管理员获取"></div>' +
          '<div class="p0-modal-foot"><button class="p0-btn" onclick="p0CloseModal()">取消</button><button class="p0-btn primary" onclick="p0SubmitVerify()">提交认证</button></div>';
    p0Modal(p0ModalShell('校园认证', body));
}

async function p0SubmitVerify() {
    var el = document.getElementById('p0-v-code');
    var code = el ? el.value.trim() : '';
    try {
        var r = await p0Fetch('/api/profile', { method: 'POST', body: { action: 'verify', code: code } });
        p0Toast('认证通过，欢迎加入', 'ok');
        p0CloseModal();
        P0.loaded.courses = false;
        p0LoadMine(true);
        if (r && r.verified) {
            p0MineRefreshSoon();
        }
    } catch (e) {
        p0Toast(e.message || '认证失败', 'err');
    }
}

function p0MineRefreshSoon() {
    setTimeout(function () { if (P0.module === 'mine') p0LoadMine(true); }, 300);
}

/* ---------------- 资料上传：课程下拉框 ---------------- */

async function p0FillCourseSelect() {
    var sel = document.getElementById('doc-course');
    if (!sel) return;

    var list = P0.courses;
    if (!list || !list.length) {
        try {
            var d = await p0Fetch('/api/courses');
            list = d.courses || [];
            if (!P0.courses.length) P0.courses = list;
        } catch (_) {
            return; // SQL 还没执行时不打扰用户，下拉框保持"不关联课程"
        }
    }

    var current = sel.value;
    var html = '<option value="">不关联课程</option>';
    list.forEach(function (c) {
        html += '<option value="' + Number(c.id) + '">' + p0Esc(c.name) + (c.teacher ? ' · ' + p0Esc(c.teacher) : '') + '</option>';
    });
    sel.innerHTML = html;
    sel.value = current;
}

/* ---------------- 初始化 ---------------- */

function p0Init() {
    if (!document.getElementById('p0-courses')) return;
    p0FillCourseSelect();
}

p0Init();
