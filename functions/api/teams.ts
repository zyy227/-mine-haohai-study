/**
 * Cloudflare Pages Function: /api/teams
 * P0 组队广场：发布队伍 / 申请加入 / 队长通过或拒绝 / 关闭队伍
 *
 * 权限：队伍列表所有人可读；发布和申请需要「已认证」用户；只有队长能处理申请
 *
 * 接口：
 *   GET  /api/teams?kind=competition&q=关键词   → { teams:[{..., isOwner, myStatus}] }
 *   GET  /api/teams?mine=1                      → { myTeams, myApplications }
 *   POST /api/teams {action:'create', title, kind, competition, skills, need_count, desc, deadline, course_id}
 *   POST /api/teams {action:'apply', team_id, message}
 *   POST /api/teams {action:'decide', application_id, decision:'accepted'|'rejected'}
 *   POST /api/teams {action:'close', team_id}
 */

const DEFAULT_URL = 'https://ihvusuaeksxynxewcmjs.supabase.co';
const DEFAULT_KEY = 'sb_publishable_NrbDiThGb-gPPSAVmVZXyA_PXXBslVc';

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
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (!res.ok) {
        const msg = (data && (data.message || data.hint)) || text || ('HTTP ' + res.status);
        throw new Error(msg);
    }
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
        const msg = (data && (data.message || data.hint || data.details)) || text || ('HTTP ' + res.status);
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }
    return data;
}

async function isVerified(url, key, token, uid) {
    try {
        const rows = await getRows(url, key, token, '/profiles?id=eq.' + uid + '&select=verified');
        return !!(rows[0] && rows[0].verified === true);
    } catch (_) {
        return false;
    }
}

export async function onRequest({ request, env }) {
    const SUPABASE_URL = (env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
    const SUPABASE_KEY = env.SUPABASE_KEY || DEFAULT_KEY;
    const url = new URL(request.url);
    const token = (request.headers.get('X-User-Token') || '').trim();
    const method = request.method.toUpperCase();
    const claims = token ? parseJwt(token) : {};
    const uid = claims.sub || '';

    try {
        if (method === 'GET') {
            // ---------- 队伍详情（队长可见申请列表） ----------
            const detailId = url.searchParams.get('id');
            if (detailId) {
                const rows = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                    '/teams?id=eq.' + encodeURIComponent(detailId) + '&select=*');
                if (!rows.length) return json({ error: '队伍不存在' }, 404);
                const team = rows[0];
                const isOwner = !!uid && String(team.owner_id) === String(uid);

                let applications = [];
                let myStatus = '';
                if (token) {
                    const mine = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                        '/team_applications?select=status&team_id=eq.' + Number(team.id) + '&user_id=eq.' + uid);
                    myStatus = (mine[0] && mine[0].status) || '';
                    if (isOwner) {
                        applications = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                            '/team_applications?select=*&team_id=eq.' + Number(team.id) + '&order=created_at.asc');
                        const uids = Array.from(new Set(applications.map(function (a) { return a.user_id; }).filter(Boolean)));
                        let profs = [];
                        if (uids.length) {
                            profs = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                                '/profiles?select=id,nickname,college,major,verified&id=in.(' + uids.join(',') + ')');
                        }
                        const pm = {};
                        profs.forEach(function (p) { pm[p.id] = p; });
                        applications = applications.map(function (a) {
                            const p = pm[a.user_id] || {};
                            return Object.assign({}, a, {
                                nickname: p.nickname || '同学', college: p.college || '',
                                major: p.major || '', verified: !!p.verified
                            });
                        });
                    }
                }

                return json({
                    team: Object.assign({}, team, { isOwner: isOwner, myStatus: myStatus }),
                    applications: applications
                });
            }

            // ---------- 我的组队 ----------
            if (url.searchParams.get('mine') === '1') {
                if (!token) return json({ error: '请先登录' }, 401);
                const [myTeams, apps] = await Promise.all([
                    getRows(SUPABASE_URL, SUPABASE_KEY, token, '/teams?select=*&owner_id=eq.' + uid + '&order=created_at.desc&limit=50'),
                    getRows(SUPABASE_URL, SUPABASE_KEY, token, '/team_applications?select=*&user_id=eq.' + uid + '&order=created_at.desc&limit=50')
                ]);
                const ids = Array.from(new Set(apps.map(function (a) { return Number(a.team_id); }).filter(Boolean)));
                let teams = [];
                if (ids.length) {
                    teams = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                        '/teams?select=id,title,status,owner_nickname&id=in.(' + ids.join(',') + ')');
                }
                const tm = {};
                teams.forEach(function (t) { tm[Number(t.id)] = t; });
                const myApplications = apps.map(function (a) {
                    const t = tm[Number(a.team_id)] || {};
                    return Object.assign({}, a, { team_title: t.title || '（队伍已删除）', team_status: t.status || '' });
                });
                return json({ myTeams: myTeams, myApplications: myApplications });
            }

            // ---------- 队伍列表 ----------
            const kind = clip(url.searchParams.get('kind'), 20);
            const q = clip(url.searchParams.get('q'), 40).replace(/[,()*]/g, ' ');
            let path = '/teams?select=*&order=created_at.desc&limit=100';
            if (kind && kind !== 'all') path += '&kind=eq.' + encodeURIComponent(kind);
            if (q) {
                const s = encodeURIComponent(q);
                path += '&or=(title.ilike.*' + s + '*,competition.ilike.*' + s + '*,skills.ilike.*' + s + '*)';
            }
            const teams = await getRows(SUPABASE_URL, SUPABASE_KEY, token, path);

            // 我申请过的队伍状态（登录用户）
            let myStatus = {};
            if (token) {
                const apps = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                    '/team_applications?select=team_id,status&user_id=eq.' + uid);
                apps.forEach(function (a) { myStatus[String(a.team_id)] = a.status; });
            }

            return json({
                teams: teams.map(function (t) {
                    return Object.assign({}, t, {
                        isOwner: !!uid && String(t.owner_id) === String(uid),
                        myStatus: myStatus[String(t.id)] || ''
                    });
                })
            });
        }

        if (method !== 'POST') return json({ error: '不支持的请求方法' }, 405);
        if (!token) return json({ error: '请先登录' }, 401);
        if (!uid) return json({ error: '登录状态无效，请重新登录' }, 401);

        const body = await request.json().catch(function () { return null; });
        if (!body) return json({ error: '请求体必须是 JSON' }, 400);

        // ---------- 发布队伍 ----------
        if (body.action === 'create') {
            if (!(await isVerified(SUPABASE_URL, SUPABASE_KEY, token, uid))) {
                return json({ error: '发布组队需要先完成校园认证（在「我的」里认证）' }, 403);
            }
            const title = clip(body.title, 60);
            if (title.length < 2) return json({ error: '队伍标题至少 2 个字' }, 400);
            const kind = ['competition', 'course', 'study'].indexOf(body.kind) >= 0 ? body.kind : 'competition';
            const need = Number(body.need_count) || 3;
            if (need < 2 || need > 20) return json({ error: '招募人数需要在 2–20 之间' }, 400);
            let deadline = clip(body.deadline, 10);
            if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) deadline = '';

            let nickname = '同学', college = '';
            try {
                const p = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                    '/profiles?id=eq.' + uid + '&select=nickname,college');
                if (p[0]) { nickname = p[0].nickname || nickname; college = p[0].college || ''; }
            } catch (_) {}

            const row = {
                title: title,
                kind: kind,
                competition: clip(body.competition, 60) || null,
                course_id: Number(body.course_id) || null,
                skills: clip(body.skills, 100) || null,
                need_count: Math.round(need),
                desc_text: clip(body.desc, 1000) || null,
                deadline: deadline || null,
                owner_id: uid,
                owner_nickname: nickname,
                owner_college: college
            };
            const data = await writeRows(SUPABASE_URL, SUPABASE_KEY, token, '/teams', 'POST', row);
            return json({ ok: true, team: Array.isArray(data) ? data[0] : data });
        }

        // ---------- 申请加入 ----------
        if (body.action === 'apply') {
            if (!(await isVerified(SUPABASE_URL, SUPABASE_KEY, token, uid))) {
                return json({ error: '申请入队需要先完成校园认证（在「我的」里认证）' }, 403);
            }
            const teamId = Number(body.team_id);
            if (!teamId) return json({ error: '缺少队伍 ID' }, 400);
            const teams = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                '/teams?id=eq.' + teamId + '&select=id,owner_id,status,need_count,joined_count,title');
            if (!teams.length) return json({ error: '队伍不存在' }, 404);
            const team = teams[0];
            if (String(team.owner_id) === String(uid)) return json({ error: '这是你自己发的队伍' }, 400);
            if (team.status !== 'open') return json({ error: '该队伍已停止招募' }, 400);
            if (Number(team.joined_count) >= Number(team.need_count)) return json({ error: '队伍已满员' }, 400);

            try {
                const data = await writeRows(
                    SUPABASE_URL, SUPABASE_KEY, token,
                    '/team_applications?on_conflict=team_id,user_id', 'POST',
                    { team_id: teamId, user_id: uid, message: clip(body.message, 500) || null },
                    'resolution=ignore-duplicates,return=representation'
                );
                if (!Array.isArray(data) || !data.length) return json({ error: '你已经申请过这个队伍了' }, 409);
                return json({ ok: true });
            } catch (e) {
                if (e.status === 409 || /duplicate|23505/i.test(e.message)) {
                    return json({ error: '你已经申请过这个队伍了' }, 409);
                }
                throw e;
            }
        }

        // ---------- 队长处理申请 ----------
        if (body.action === 'decide') {
            const appId = Number(body.application_id);
            const decision = body.decision === 'accepted' ? 'accepted' : 'rejected';
            if (!appId) return json({ error: '缺少申请 ID' }, 400);

            const apps = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                '/team_applications?id=eq.' + appId + '&select=*');
            if (!apps.length) return json({ error: '申请不存在或无权处理' }, 404);
            const app = apps[0];

            const teams = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                '/teams?id=eq.' + Number(app.team_id) + '&select=*');
            if (!teams.length) return json({ error: '队伍不存在' }, 404);
            const team = teams[0];
            if (String(team.owner_id) !== String(uid)) return json({ error: '只有队长可以处理申请' }, 403);
            if (app.status !== 'pending') return json({ error: '这条申请已经处理过了' }, 400);
            if (decision === 'accepted' && Number(team.joined_count) >= Number(team.need_count)) {
                return json({ error: '队伍已满员，无法再通过申请' }, 400);
            }

            await writeRows(
                SUPABASE_URL, SUPABASE_KEY, token,
                '/team_applications?id=eq.' + appId, 'PATCH',
                { status: decision }, 'return=minimal'
            );

            if (decision === 'accepted') {
                await writeRows(
                    SUPABASE_URL, SUPABASE_KEY, token,
                    '/teams?id=eq.' + Number(app.team_id), 'PATCH',
                    { joined_count: Number(team.joined_count) + 1 }, 'return=minimal'
                );
            }
            return json({ ok: true, decision: decision });
        }

        // ---------- 关闭队伍 ----------
        if (body.action === 'close') {
            const teamId = Number(body.team_id);
            if (!teamId) return json({ error: '缺少队伍 ID' }, 400);
            const teams = await getRows(SUPABASE_URL, SUPABASE_KEY, token, '/teams?id=eq.' + teamId + '&select=owner_id,status');
            if (!teams.length) return json({ error: '队伍不存在' }, 404);
            if (String(teams[0].owner_id) !== String(uid)) return json({ error: '只有队长可以关闭队伍' }, 403);
            await writeRows(SUPABASE_URL, SUPABASE_KEY, token, '/teams?id=eq.' + teamId, 'PATCH', { status: 'closed' }, 'return=minimal');
            return json({ ok: true });
        }

        return json({ error: '未知的 action' }, 400);
    } catch (err) {
        return json({ error: err && err.message ? err.message : String(err) }, 502);
    }
}
