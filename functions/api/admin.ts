/**
 * Cloudflare Pages Function: /api/admin
 * 作用：管理后台专用接口（管理员身份验证 / 用户列表 / 统计 / 内容下架）
 *
 * 安全设计（重点）：
 *   1) 前端每次调用都必须在 X-User-Token 头带上登录用户的 access_token
 *   2) 服务端拿这个 token 去 Supabase 换出用户邮箱，比对 ADMIN_EMAIL 白名单
 *      —— 邮箱比对在服务端完成，前端改代码也没用
 *   3) 只有确认是管理员后，才用 service_role 密钥（服务端最高权限）去读写数据
 *   4) service_role 密钥只存在于 Cloudflare 环境变量，绝不下发到前端
 *
 * 需要在 Cloudflare Pages → 设置 → 环境变量 中添加：
 *   SUPABASE_SERVICE_ROLE = Supabase → Settings → API → service_role secret（必填，绝密）
 *   ADMIN_EMAIL          = 管理员邮箱，默认 2984054909@qq.com（可选，多个用逗号分隔）
 *
 * 接口约定：
 *   GET  /api/admin?action=check              → 是否管理员 { isAdmin }
 *   GET  /api/admin?action=users              → 注册用户列表 { users: [...] }
 *   GET  /api/admin?action=stats              → 统计数据 { stats: {...} }
 *   GET  /api/admin?action=items              → 全部内容（含被下架）{ items: [...] }
 *   POST /api/admin  body:{action:'takedown'|'restore'|'delete', id, kind}
 */

const DEFAULT_URL = 'https://ihvusuaeksxynxewcmjs.supabase.co';
const DEFAULT_KEY = 'sb_publishable_NrbDiThGb-gPPSAVmVZXyA_PXXBslVc';
const DEFAULT_ADMIN_EMAIL = '2984054909@qq.com';

// 从 access_token（JWT）的 payload 里直接读出邮箱和用户ID。
// token 由 Supabase 用密钥签名，前端无法伪造；这里配合 /auth/v1/user 校验 token 有效性后使用。
function parseJwtPayload(token) {
    try {
        const seg = String(token || '').split('.')[1];
        if (!seg) return {};
        const base64 = seg.replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch (_) {
        return {};
    }
}

function json(data, status) {
    return Response.json(data, { status: status || 200 });
}

export async function onRequest({ request, env }) {
    const SUPABASE_URL = (env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
    const SUPABASE_KEY = env.SUPABASE_KEY || DEFAULT_KEY;
    const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE || '';
    const ADMIN_EMAIL = env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;

    const userToken = (request.headers.get('X-User-Token') || '').trim();
    if (!userToken) return json({ error: '缺少登录凭证，请先登录管理员账号' }, 401);

    // ---------- 第一步：服务端校验身份，拿到当前用户邮箱 ----------
    // 主通道：直接从 JWT payload 读邮箱（新版 Supabase 的 /auth/v1/user 可能不返回 email）
    const claims = parseJwtPayload(userToken);
    let userEmail = String(claims.email || '').toLowerCase();
    let userId = String(claims.sub || '');
    try {
        const who = await fetch(SUPABASE_URL + '/auth/v1/user', {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + userToken }
        });
        if (!who.ok) return json({ error: '登录已过期，请重新登录' }, 401);
        const info = await who.json();
        if (!userEmail && info.email) userEmail = String(info.email).toLowerCase();
        if (!userId && info.id) userId = String(info.id);
    } catch (err) {
        // JWT 里已拿到邮箱则照常用，不因接口网络抖动误判
        if (!userEmail) return json({ error: '身份验证失败：' + (err?.message || String(err)) }, 502);
    }

    const allowList = ADMIN_EMAIL.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);

    // check 操作：回答是不是管理员
    const url = new URL(request.url);
    // 重要：request body 只能读一次，先读出来复用，否则后面再读会得到空对象导致"缺少 id"
    const isPost = request.method.toUpperCase() === 'POST';
    const reqBody = isPost ? await safeBody(request) : {};
    const action = isPost
        ? (reqBody.action || url.searchParams.get('action') || '')
        : (url.searchParams.get('action') || '');

    if (action === 'check') {
        // 兜底：某些新版 Supabase 的 /auth/v1/user 不带 email，
        // 此时用 service_role 按用户ID去管理接口查真实邮箱
        let emailSource = claims.email ? 'jwt' : 'token';
        if (!userEmail && userId && SERVICE_ROLE) {
            try {
                const uRes = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + encodeURIComponent(userId), {
                    headers: { 'apikey': SERVICE_ROLE, 'Authorization': 'Bearer ' + SERVICE_ROLE }
                });
                if (uRes.ok) {
                    const u = await uRes.json();
                    userEmail = (u.email || '').toLowerCase();
                    emailSource = 'admin-api';
                }
            } catch (_) {}
        }
        const isAdmin = !!userEmail && allowList.indexOf(userEmail) !== -1;
        return json({
            isAdmin: isAdmin,
            email: userEmail,
            debug: { hasToken: !!userToken, hasUserId: !!userId, hasServiceRole: !!SERVICE_ROLE, emailSource: emailSource, allowList: allowList, envKeys: Object.keys(env || {}).filter(function (k) { return /supabase|service|admin|key|role/i.test(k); }).sort() }
        });
    }

    const isAdmin = !!userEmail && allowList.indexOf(userEmail) !== -1;

    if (!isAdmin) return json({ error: '无管理员权限' }, 403);
    if (!SERVICE_ROLE) {
        return json({ error: '服务端未配置 SUPABASE_SERVICE_ROLE，请在 Cloudflare Pages 环境变量中添加' }, 500);
    }

    // ---------- 第二步：确认管理员后，用 service_role 绕过 RLS 操作 ----------
    const adminHeaders = {
        'apikey': SERVICE_ROLE,
        'Authorization': 'Bearer ' + SERVICE_ROLE
    };

    try {
        if (request.method.toUpperCase() === 'GET') {
            if (action === 'users') {
                // 列出注册用户（GoTrue Admin API）
                const res = await fetch(SUPABASE_URL + '/auth/v1/admin/users?per_page=200', { headers: adminHeaders });
                if (!res.ok) {
                    const msg = await res.text();
                    return json({ error: '读取用户列表失败：' + msg }, res.status);
                }
                const data = await res.json();
                const users = (data.users || []).map(function (u) {
                    return {
                        id: u.id,
                        email: u.email || '',
                        created_at: u.created_at || '',
                        last_sign_in_at: u.last_sign_in_at || ''
                    };
                });
                return json({ users: users });
            }

            if (action === 'items') {
                // 全部内容（含被下架），供后台巡查
                const res = await fetch(SUPABASE_URL + '/rest/v1/site_items?select=*&order=id.desc', {
                    headers: adminHeaders, cf: { cacheTtl: 0 }
                });
                if (!res.ok) {
                    const msg = await res.text();
                    return json({ error: '读取内容失败：' + msg }, res.status);
                }
                return json({ items: await res.json() });
            }

            if (action === 'stats') {
                // 内容总数、各类型数量、被下架数量
                const itemsRes = await fetch(SUPABASE_URL + '/rest/v1/site_items?select=kind,status,view_count', { headers: adminHeaders });
                const items = itemsRes.ok ? await itemsRes.json() : [];

                // 注册用户数：直接取用户列表长度（最可靠），不再依赖 content-range 头
                let userCount = 0;
                try {
                    const uRes = await fetch(SUPABASE_URL + '/auth/v1/admin/users?per_page=200', {
                        headers: adminHeaders
                    });
                    if (uRes.ok) {
                        const ud = await uRes.json();
                        userCount = Array.isArray(ud) ? ud.length : ((ud.users || []).length);
                    }
                    // 兜底：若响应头带总数且比列表长度大，用总数
                    const cr = uRes.headers.get('content-range') || '';
                    const m = /\/(\d+)/.exec(cr);
                    if (m && Number(m[1]) > userCount) userCount = Number(m[1]);
                } catch (_) {}

                // 统计表：按 metric 汇总（总量 + 今日）
                let statRows = [];
                try {
                    const sRes = await fetch(SUPABASE_URL + '/rest/v1/site_stats?select=day,metric,cnt', { headers: adminHeaders });
                    if (sRes.ok) statRows = await sRes.json();
                } catch (_) {}

                const today = new Date().toISOString().slice(0, 10);
                function sum(metric, onlyToday) {
                    return statRows.reduce(function (acc, r) {
                        if (r.metric !== metric) return acc;
                        if (onlyToday && r.day !== today) return acc;
                        return acc + (Number(r.cnt) || 0);
                    }, 0);
                }

                const totalViews = items.reduce(function (a, r) { return a + (Number(r.view_count) || 0); }, 0);

                return json({
                    stats: {
                        contentTotal: items.length,
                        docCount: items.filter(function (r) { return r.kind === 'doc'; }).length,
                        compCount: items.filter(function (r) { return r.kind === 'comp'; }).length,
                        sceneryCount: items.filter(function (r) { return r.kind === 'scenery'; }).length,
                        takedownCount: items.filter(function (r) { return r.status === 'takedown'; }).length,
                        userCount: userCount,
                        visitTotal: sum('visit', false),
                        visitToday: sum('visit', true),
                        downloadTotal: sum('download', false),
                        downloadToday: sum('download', true),
                        aiTotal: sum('ai', false),
                        aiToday: sum('ai', true),
                        itemViews: totalViews
                    },
                    topItems: items
                        .map(function (r) { return { kind: r.kind, name: r.name, views: Number(r.view_count) || 0 }; })
                        .sort(function (a, b) { return b.views - a.views; })
                        .slice(0, 10)
                });
            }

            return json({ error: '未知的 action' }, 400);
        }

        if (isPost) {
            const id = reqBody.id;
            if (!id && id !== 0) return json({ error: '缺少 id' }, 400);

            if (action === 'takedown' || action === 'restore') {
                const newStatus = action === 'takedown' ? 'takedown' : 'approved';
                const res = await fetch(SUPABASE_URL + '/rest/v1/site_items?id=eq.' + encodeURIComponent(id), {
                    method: 'PATCH',
                    headers: Object.assign({}, adminHeaders, { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
                    body: JSON.stringify({ status: newStatus })
                });
                if (!res.ok) {
                    const msg = await res.text();
                    return json({ error: '操作失败：' + msg }, res.status);
                }
                return json({ ok: true });
            }

            if (action === 'delete') {
                const res = await fetch(SUPABASE_URL + '/rest/v1/site_items?id=eq.' + encodeURIComponent(id), {
                    method: 'DELETE', headers: adminHeaders
                });
                if (!res.ok) {
                    const msg = await res.text();
                    return json({ error: '删除失败：' + msg }, res.status);
                }
                return json({ ok: true });
            }

            return json({ error: '未知的 action' }, 400);
        }

        return json({ error: '不支持的请求方法' }, 405);
    } catch (err) {
        return json({ error: '请求失败：' + (err?.message || String(err)) }, 502);
    }
}

async function safeBody(request) {
    try { return (await request.json()) || {}; }
    catch (_) { return {}; }
}
