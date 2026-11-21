/**
 * Cloudflare Pages Function: /api/courses
 * P0 课程中心：课程列表 / 课程详情（资料 + 攻略 + 相关组队）/ 新建课程 / 写课程攻略
 *
 * 权限：课程和攻略所有人可读；新建课程、写攻略需要「已认证」用户（服务端先查一次，数据库 RLS 再兜底）
 *
 * 接口：
 *   GET  /api/courses?q=关键词            → { courses:[{..., docCount, reviewCount}] }
 *   GET  /api/courses?id=1                → { course, docs, reviews, teams }
 *   POST /api/courses {action:'create', name, teacher, ...}
 *   POST /api/courses {action:'review', course_id, rating, content, term}
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

    try {
        if (method === 'GET') {
            const id = url.searchParams.get('id');

            // ---------- 课程详情 ----------
            if (id) {
                const cRows = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                    '/courses?id=eq.' + encodeURIComponent(id) + '&select=*');
                if (!cRows.length) return json({ error: '课程不存在或已隐藏' }, 404);
                const course = cRows[0];

                const [docs, reviews, teams] = await Promise.all([
                    getRows(SUPABASE_URL, SUPABASE_KEY, token,
                        '/site_items?select=*&kind=eq.doc&course_id=eq.' + encodeURIComponent(id) + '&order=created_at.desc&limit=100'),
                    getRows(SUPABASE_URL, SUPABASE_KEY, token,
                        '/course_reviews?select=*&course_id=eq.' + encodeURIComponent(id) + '&order=created_at.desc&limit=50'),
                    getRows(SUPABASE_URL, SUPABASE_KEY, token,
                        '/teams?select=*&course_id=eq.' + encodeURIComponent(id) + '&order=created_at.desc&limit=20')
                ]);

                // 攻略作者昵称
                const uids = Array.from(new Set(reviews.map(function (r) { return r.user_id; }).filter(Boolean)));
                let profs = [];
                if (uids.length) {
                    profs = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                        '/profiles?select=id,nickname,college&id=in.(' + uids.join(',') + ')');
                }
                const pm = {};
                profs.forEach(function (p) { pm[p.id] = p; });
                const reviewsWithAuthor = reviews.map(function (r) {
                    const p = pm[r.user_id] || {};
                    return Object.assign({}, r, { author: p.nickname || '同学', author_college: p.college || '' });
                });

                return json({ course: course, docs: docs, reviews: reviewsWithAuthor, teams: teams });
            }

            // ---------- 课程列表 ----------
            const q = clip(url.searchParams.get('q'), 40).replace(/[,()*]/g, ' ');
            let path = '/courses?select=*&status=eq.approved&order=created_at.desc&limit=100';
            if (q) {
                const s = encodeURIComponent(q);
                path += '&or=(name.ilike.*' + s + '*,teacher.ilike.*' + s + '*,college.ilike.*' + s + '*,code.ilike.*' + s + '*)';
            }
            const courses = await getRows(SUPABASE_URL, SUPABASE_KEY, token, path);

            // 资料数 / 攻略数（一次查全量再本地聚合，数据量小）
            const [docRows, reviewRows] = await Promise.all([
                getRows(SUPABASE_URL, SUPABASE_KEY, token,
                    '/site_items?select=course_id&kind=eq.doc&course_id=not.is.null&limit=1000'),
                getRows(SUPABASE_URL, SUPABASE_KEY, token,
                    '/course_reviews?select=course_id&status=eq.approved&limit=1000')
            ]);
            const docCount = {}, reviewCount = {};
            docRows.forEach(function (r) { const k = String(r.course_id); docCount[k] = (docCount[k] || 0) + 1; });
            reviewRows.forEach(function (r) { const k = String(r.course_id); reviewCount[k] = (reviewCount[k] || 0) + 1; });

            return json({
                courses: courses.map(function (c) {
                    return Object.assign({}, c, {
                        docCount: docCount[String(c.id)] || 0,
                        reviewCount: reviewCount[String(c.id)] || 0
                    });
                })
            });
        }

        if (method !== 'POST') return json({ error: '不支持的请求方法' }, 405);
        if (!token) return json({ error: '请先登录' }, 401);

        const claims = parseJwt(token);
        const uid = claims.sub;
        if (!uid) return json({ error: '登录状态无效，请重新登录' }, 401);

        const body = await request.json().catch(function () { return null; });
        if (!body) return json({ error: '请求体必须是 JSON' }, 400);

        const verified = await isVerified(SUPABASE_URL, SUPABASE_KEY, token, uid);

        if (body.action === 'create') {
            if (!verified) return json({ error: '建课程需要先完成校园认证（在「我的」里认证）' }, 403);
            const name = clip(body.name, 60);
            if (!name) return json({ error: '课程名称不能为空' }, 400);
            const row = {
                name: name,
                code: clip(body.code, 20) || null,
                teacher: clip(body.teacher, 30) || null,
                college: clip(body.college, 30) || null,
                term: clip(body.term, 20) || null,
                exam_type: clip(body.exam_type, 20) || null,
                intro: clip(body.intro, 500) || null,
                credit: body.credit === '' || body.credit == null ? null : Number(body.credit),
                created_by: uid
            };
            if (row.credit != null && (isNaN(row.credit) || row.credit < 0 || row.credit > 20)) row.credit = null;
            try {
                const data = await writeRows(SUPABASE_URL, SUPABASE_KEY, token, '/courses', 'POST', row);
                return json({ ok: true, course: Array.isArray(data) ? data[0] : data });
            } catch (e) {
                if (e.status === 409 || /duplicate|23505/i.test(e.message)) {
                    return json({ error: '这门课已经存在了，直接去课程列表搜索它吧' }, 409);
                }
                throw e;
            }
        }

        if (body.action === 'review') {
            if (!verified) return json({ error: '写课程攻略需要先完成校园认证' }, 403);
            const courseId = Number(body.course_id);
            const rating = Number(body.rating);
            const content = clip(body.content, 800);
            if (!courseId) return json({ error: '缺少课程 ID' }, 400);
            if (!(rating >= 1 && rating <= 5)) return json({ error: '评分需要在 1–5 之间' }, 400);
            if (content.length < 5) return json({ error: '攻略内容太短了，至少写 5 个字' }, 400);

            const row = {
                course_id: courseId,
                user_id: uid,
                rating: Math.round(rating),
                content: content,
                term: clip(body.term, 20) || null
            };
            const data = await writeRows(
                SUPABASE_URL, SUPABASE_KEY, token,
                '/course_reviews?on_conflict=course_id,user_id', 'POST', row,
                'resolution=merge-duplicates,return=representation'
            );
            return json({ ok: true, review: Array.isArray(data) ? data[0] : data });
        }

        return json({ error: '未知的 action' }, 400);
    } catch (err) {
        return json({ error: err && err.message ? err.message : String(err) }, 502);
    }
}
