/**
 * Cloudflare Pages Function: /api/profile
 * P0 身份层：用户资料 + 校园认证 + 我的主页数据
 *
 * 安全：
 *   · 所有写操作都带 X-User-Token，服务端解析出 uid，Supabase RLS 再校验一次
 *   · verified 字段普通用户无权修改（数据库列级授权），只能由本函数用 service_role 写入
 *   · 认证方式：① 学校邮箱域名（CAMPUS_EMAIL_DOMAINS）② 班级邀请码（CAMPUS_INVITE_CODE）
 *
 * 接口：
 *   GET  /api/profile?action=me        → { profile, counts, myDocs, myTeams, myApplications, incoming }
 *   GET  /api/profile?action=user&id=  → { profile }
 *   POST /api/profile  {action:'save', nickname, college, major, grade, bio}
 *   POST /api/profile  {action:'verify', code}
 */

const DEFAULT_URL = 'https://ihvusuaeksxynxewcmjs.supabase.co';
const DEFAULT_KEY = 'sb_publishable_NrbDiThGb-gPPSAVmVZXyA_PXXBslVc';
const DEFAULT_ADMIN_EMAIL = '2984054909@qq.com';

function json(data, status) {
    return Response.json(data, { status: status || 200 });
}

function parseJwt(token) {
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

function clip(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max);
}

function restHeaders(key, token) {
    return { 'apikey': key, 'Authorization': 'Bearer ' + (token || key) };
}

async function getRows(url, key, token, path) {
    const res = await fetch(url + '/rest/v1' + path, { headers: restHeaders(key, token), cf: { cacheTtl: 0 } });
    if (!res.ok) throw new Error('读取失败 HTTP ' + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

async function writeRows(url, key, token, path, method, body, prefer) {
    const res = await fetch(url + '/rest/v1' + path, {
        method: method,
        headers: Object.assign({ 'Content-Type': 'application/json', 'Prefer': prefer || 'return=representation' }, restHeaders(key, token)),
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (!res.ok) {
        const msg = (data && (data.message || data.error_description || data.hint)) || text || ('HTTP ' + res.status);
        throw new Error(msg);
    }
    return data;
}

export async function onRequest({ request, env }) {
    const SUPABASE_URL = (env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
    const SUPABASE_KEY = env.SUPABASE_KEY || DEFAULT_KEY;
    const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE || '';
    const ADMIN_EMAILS = String(env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL)
        .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);

    const url = new URL(request.url);
    const action = url.searchParams.get('action') || '';
    const token = (request.headers.get('X-User-Token') || '').trim();

    const method = request.method.toUpperCase();

    try {
        // ---------------- 读 ----------------
        if (method === 'GET') {
            if (action === 'user') {
                const id = url.searchParams.get('id');
                if (!id) return json({ error: '缺少 id' }, 400);
                const rows = await getRows(SUPABASE_URL, SUPABASE_KEY, token, '/profiles?id=eq.' + encodeURIComponent(id) + '&select=*');
                return json({ profile: rows[0] || null });
            }

            // action=me（默认）
            if (!token) return json({ error: '请先登录' }, 401);
            const claims = parseJwt(token);
            const uid = claims.sub;
            if (!uid) return json({ error: '登录状态无效，请重新登录' }, 401);

            const profiles = await getRows(SUPABASE_URL, SUPABASE_KEY, token, '/profiles?id=eq.' + uid + '&select=*');
            let profile = profiles[0] || null;
            if (!profile) {
                profile = { id: uid, nickname: (claims.email || '').split('@')[0], verified: false };
            }
            profile.email = claims.email || '';

            const [docRows, teamRows, appRows] = await Promise.all([
                getRows(SUPABASE_URL, SUPABASE_KEY, token, '/site_items?select=id,name,type,link,course_id,status,created_at&kind=eq.doc&owner_id=eq.' + uid + '&order=created_at.desc&limit=50'),
                getRows(SUPABASE_URL, SUPABASE_KEY, token, '/teams?select=*&owner_id=eq.' + uid + '&order=created_at.desc&limit=50'),
                getRows(SUPABASE_URL, SUPABASE_KEY, token, '/team_applications?select=*&user_id=eq.' + uid + '&order=created_at.desc&limit=50')
            ]);

            // 我的申请 → 补上队伍标题
            const appTeamIds = Array.from(new Set(appRows.map(function (a) { return Number(a.team_id); }).filter(Boolean)));
            let appTeams = [];
            if (appTeamIds.length) {
                appTeams = await getRows(SUPABASE_URL, SUPABASE_KEY, token, '/teams?select=id,title,status,owner_nickname&id=in.(' + appTeamIds.join(',') + ')');
            }
            const teamMap = {};
            appTeams.forEach(function (t) { teamMap[Number(t.id)] = t; });
            const myApplications = appRows.map(function (a) {
                const t = teamMap[Number(a.team_id)] || {};
                return { id: a.id, team_id: a.team_id, status: a.status, message: a.message, created_at: a.created_at, team_title: t.title || '（队伍已删除）', team_status: t.status || '' };
            });

            // 我队里的待处理申请
            const myTeamIds = teamRows.map(function (t) { return Number(t.id); }).filter(Boolean);
            let incoming = [];
            if (myTeamIds.length) {
                const inRows = await getRows(SUPABASE_URL, SUPABASE_KEY, token, '/team_applications?select=*&team_id=in.(' + myTeamIds.join(',') + ')&status=eq.pending&order=created_at.asc');
                const userIds = Array.from(new Set(inRows.map(function (a) { return a.user_id; }).filter(Boolean)));
                let profs = [];
                if (userIds.length) {
                    profs = await getRows(SUPABASE_URL, SUPABASE_KEY, token, '/profiles?select=id,nickname,college,major,verified&id=in.(' + userIds.join(',') + ')');
                }
                const profMap = {};
                profs.forEach(function (p) { profMap[p.id] = p; });
                const teamTitle = {};
                teamRows.forEach(function (t) { teamTitle[Number(t.id)] = t.title; });
                incoming = inRows.map(function (a) {
                    const p = profMap[a.user_id] || {};
                    return {
                        id: a.id, team_id: a.team_id, team_title: teamTitle[Number(a.team_id)] || '',
                        user_id: a.user_id, nickname: p.nickname || '同学', college: p.college || '', major: p.major || '', verified: !!p.verified,
                        message: a.message || '', created_at: a.created_at
                    };
                });
            }

            const accepted = myApplications.filter(function (a) { return a.status === 'accepted'; }).length;
            const counts = {
                docs: docRows.length,
                teams: teamRows.length,
                applications: myApplications.length,
                accepted: accepted,
                incoming: incoming.length
            };
            const points = counts.docs * 5 + counts.teams * 10 + counts.accepted * 15 + (profile.verified ? 20 : 0);

            return json({ profile: profile, counts: counts, points: points, myDocs: docRows, myTeams: teamRows, myApplications: myApplications, incoming: incoming });
        }

        // ---------------- 写 ----------------
        if (method !== 'POST') return json({ error: '不支持的请求方法' }, 405);
        if (!token) return json({ error: '请先登录' }, 401);

        const claims = parseJwt(token);
        const uid = claims.sub;
        if (!uid) return json({ error: '登录状态无效，请重新登录' }, 401);

        let body;
        try { body = await request.json(); } catch (_) { return json({ error: '请求体必须是 JSON' }, 400); }

        if (action === 'save') {
            const patch = {
                id: uid,
                nickname: clip(body.nickname, 20),
                college: clip(body.college, 30),
                major: clip(body.major, 30),
                grade: clip(body.grade, 10),
                bio: clip(body.bio, 120)
            };
            if (!patch.nickname) return json({ error: '昵称不能为空' }, 400);
            const data = await writeRows(
                SUPABASE_URL, SUPABASE_KEY, token,
                '/profiles?on_conflict=id', 'POST', patch,
                'resolution=merge-duplicates,return=representation'
            );
            return json({ ok: true, profile: Array.isArray(data) ? data[0] : data });
        }

        if (action === 'verify') {
            if (!SERVICE_ROLE) return json({ error: '服务端未配置 SUPABASE_SERVICE_ROLE，无法完成认证' }, 500);

            // 拿真实邮箱（JWT 里通常有；再向 Supabase 校验一次 token 有效性）
            let email = String(claims.email || '').toLowerCase();
            try {
                const who = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: restHeaders(SUPABASE_KEY, token) });
                if (!who.ok) return json({ error: '登录已过期，请重新登录' }, 401);
                const info = await who.json();
                if (info && info.email) email = String(info.email).toLowerCase();
            } catch (_) {
                if (!email) return json({ error: '身份校验失败，请重试' }, 502);
            }

            const domains = String(env.CAMPUS_EMAIL_DOMAINS || '')
                .split(',').map(function (s) { return s.trim().toLowerCase().replace(/^@/, ''); }).filter(Boolean);
            const invite = String(env.CAMPUS_INVITE_CODE || 'HAOHAI2026').trim();
            const code = clip(body.code, 64);

            const isAdminEmail = ADMIN_EMAILS.indexOf(email) !== -1;
            const byEmail = domains.some(function (d) { return email.endsWith('@' + d); });
            const byCode = !!code && code.toLowerCase() === invite.toLowerCase();

            if (!isAdminEmail && !byEmail && !byCode) {
                return json({ error: '认证未通过：请使用学校邮箱，或输入正确的班级邀请码' }, 400);
            }

            const method2 = isAdminEmail ? 'admin' : (byEmail ? 'email' : 'invite');

            // 只改认证字段，不动用户自己设置的昵称；资料行不存在时再补建
            const updated = await writeRows(
                SUPABASE_URL, SERVICE_ROLE, SERVICE_ROLE,
                '/profiles?id=eq.' + uid, 'PATCH',
                { verified: true, verify_method: method2 },
                'return=representation'
            );
            if (!Array.isArray(updated) || updated.length === 0) {
                await writeRows(
                    SUPABASE_URL, SERVICE_ROLE, SERVICE_ROLE,
                    '/profiles?on_conflict=id', 'POST',
                    { id: uid, nickname: (email.split('@')[0] || '同学'), verified: true, verify_method: method2 },
                    'resolution=merge-duplicates,return=minimal'
                );
            }
            return json({ ok: true, verified: true, method: method2 });
        }

        return json({ error: '未知的 action' }, 400);
    } catch (err) {
        return json({ error: err && err.message ? err.message : String(err) }, 502);
    }
}
