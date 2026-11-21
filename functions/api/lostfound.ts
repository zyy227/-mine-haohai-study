/**
 * Cloudflare Pages Function: /api/lostfound
 * 校园互助 · 失物招领（含照片、认领留言）
 *
 * 权限：列表所有人可读；发布 / 认领 / 处理需要已认证用户；只有发布者能处理认领和关闭
 *
 * 接口：
 *   GET  /api/lostfound?kind=lost|found&q=关键词&status=open  → { items }
 *   GET  /api/lostfound?id=1                                  → { item, claims, myClaim, isOwner }
 *   POST /api/lostfound {action:'create', kind, title, place, happened_at, desc, image_url}
 *   POST /api/lostfound {action:'claim', item_id, message}
 *   POST /api/lostfound {action:'decide', claim_id, decision:'accepted'|'rejected'}
 *   POST /api/lostfound {action:'close', item_id, status:'resolved'|'closed'}
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
            // ---------- 详情 ----------
            const id = url.searchParams.get('id');
            if (id) {
                const rows = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                    '/lost_found?id=eq.' + encodeURIComponent(id) + '&select=*');
                if (!rows.length) return json({ error: '这条信息不存在或已删除' }, 404);
                const item = rows[0];
                const isOwner = !!uid && String(item.owner_id) === String(uid);

                let claimsList = [];
                let myClaim = null;
                if (token) {
                    const mine = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                        '/lost_found_claims?select=*&item_id=eq.' + Number(item.id) + '&user_id=eq.' + uid);
                    myClaim = mine[0] || null;
                }
                if (isOwner) {
                    claimsList = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                        '/lost_found_claims?select=*&item_id=eq.' + Number(item.id) + '&order=created_at.asc');
                    const uids = Array.from(new Set(claimsList.map(function (c) { return c.user_id; }).filter(Boolean)));
                    let profs = [];
                    if (uids.length) {
                        profs = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                            '/profiles?select=id,nickname,college,major,verified&id=in.(' + uids.join(',') + ')');
                    }
                    const pm = {};
                    profs.forEach(function (p) { pm[p.id] = p; });
                    claimsList = claimsList.map(function (c) {
                        const p = pm[c.user_id] || {};
                        return Object.assign({}, c, {
                            nickname: p.nickname || '同学',
                            college: p.college || '',
                            major: p.major || '',
                            verified: !!p.verified
                        });
                    });
                }

                return json({ item: item, claims: claimsList, myClaim: myClaim, isOwner: isOwner });
            }

            // ---------- 列表 ----------
            const kind = clip(url.searchParams.get('kind'), 10);
            const status = clip(url.searchParams.get('status'), 20);
            const q = clip(url.searchParams.get('q'), 40).replace(/[,()*]/g, ' ');
            let path = '/lost_found?select=*&order=created_at.desc&limit=100';
            if (kind === 'lost' || kind === 'found') path += '&kind=eq.' + kind;
            if (status === 'open' || status === 'resolved' || status === 'closed') path += '&status=eq.' + status;
            if (q) {
                const s = encodeURIComponent(q);
                path += '&or=(title.ilike.*' + s + '*,place.ilike.*' + s + '*,desc_text.ilike.*' + s + '*)';
            }
            const items = await getRows(SUPABASE_URL, SUPABASE_KEY, token, path);

            let myClaims = {};
            if (token) {
                const rows = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                    '/lost_found_claims?select=item_id,status&user_id=eq.' + uid);
                rows.forEach(function (r) { myClaims[String(r.item_id)] = r.status; });
            }

            return json({
                items: items.map(function (it) {
                    return Object.assign({}, it, {
                        isOwner: !!uid && String(it.owner_id) === String(uid),
                        myClaim: myClaims[String(it.id)] || ''
                    });
                })
            });
        }

        if (method !== 'POST') return json({ error: '不支持的请求方法' }, 405);
        if (!token) return json({ error: '请先登录' }, 401);
        if (!uid) return json({ error: '登录状态无效，请重新登录' }, 401);

        const body = await request.json().catch(function () { return null; });
        if (!body) return json({ error: '请求体必须是 JSON' }, 400);

        // ---------- 发布 ----------
        if (body.action === 'create') {
            if (!(await isVerified(SUPABASE_URL, SUPABASE_KEY, token, uid))) {
                return json({ error: '发布失物招领需要先完成校园认证（在「我的」里认证）' }, 403);
            }
            const title = clip(body.title, 60);
            if (title.length < 2) return json({ error: '标题至少 2 个字' }, 400);
            const kind = body.kind === 'found' ? 'found' : 'lost';
            let happened = clip(body.happened_at, 10);
            if (happened && !/^\d{4}-\d{2}-\d{2}$/.test(happened)) happened = '';
            const imageUrl = clip(body.image_url, 500);
            if (imageUrl && !/^https?:\/\//i.test(imageUrl)) return json({ error: '图片地址不合法' }, 400);

            let nickname = '同学', college = '';
            try {
                const p = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                    '/profiles?id=eq.' + uid + '&select=nickname,college');
                if (p[0]) { nickname = p[0].nickname || nickname; college = p[0].college || ''; }
            } catch (_) {}

            const row = {
                kind: kind,
                title: title,
                desc_text: clip(body.desc, 800) || null,
                place: clip(body.place, 60) || null,
                happened_at: happened || null,
                image_url: imageUrl || null,
                owner_id: uid,
                owner_nickname: nickname,
                owner_college: college
            };
            const data = await writeRows(SUPABASE_URL, SUPABASE_KEY, token, '/lost_found', 'POST', row);
            return json({ ok: true, item: Array.isArray(data) ? data[0] : data });
        }

        // ---------- 认领 / 提供线索 ----------
        if (body.action === 'claim') {
            if (!(await isVerified(SUPABASE_URL, SUPABASE_KEY, token, uid))) {
                return json({ error: '认领需要先完成校园认证（在「我的」里认证）' }, 403);
            }
            const itemId = Number(body.item_id);
            if (!itemId) return json({ error: '缺少失物 ID' }, 400);

            const items = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                '/lost_found?id=eq.' + itemId + '&select=id,owner_id,status,title');
            if (!items.length) return json({ error: '这条信息不存在' }, 404);
            const item = items[0];
            if (String(item.owner_id) === String(uid)) return json({ error: '这是你自己发布的信息' }, 400);
            if (item.status !== 'open') return json({ error: '这条信息已经结束，不能再认领' }, 400);

            try {
                const data = await writeRows(
                    SUPABASE_URL, SUPABASE_KEY, token,
                    '/lost_found_claims?on_conflict=item_id,user_id', 'POST',
                    { item_id: itemId, user_id: uid, message: clip(body.message, 500) || null },
                    'resolution=ignore-duplicates,return=representation'
                );
                if (!Array.isArray(data) || !data.length) return json({ error: '你已经提交过了，等对方处理吧' }, 409);
                return json({ ok: true });
            } catch (e) {
                if (e.status === 409 || /duplicate|23505/i.test(e.message)) {
                    return json({ error: '你已经提交过了，等对方处理吧' }, 409);
                }
                throw e;
            }
        }

        // ---------- 发布者处理认领 ----------
        if (body.action === 'decide') {
            const claimId = Number(body.claim_id);
            const decision = body.decision === 'accepted' ? 'accepted' : 'rejected';
            if (!claimId) return json({ error: '缺少认领记录 ID' }, 400);

            const rows = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                '/lost_found_claims?id=eq.' + claimId + '&select=*');
            if (!rows.length) return json({ error: '认领记录不存在或无权处理' }, 404);
            const claim = rows[0];

            const items = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                '/lost_found?id=eq.' + Number(claim.item_id) + '&select=*');
            if (!items.length) return json({ error: '这条信息不存在' }, 404);
            const item = items[0];
            if (String(item.owner_id) !== String(uid)) return json({ error: '只有发布者可以处理' }, 403);
            if (claim.status !== 'pending') return json({ error: '这条认领已经处理过了' }, 400);

            await writeRows(
                SUPABASE_URL, SUPABASE_KEY, token,
                '/lost_found_claims?id=eq.' + claimId, 'PATCH',
                { status: decision }, 'return=minimal'
            );

            if (decision === 'accepted') {
                await writeRows(
                    SUPABASE_URL, SUPABASE_KEY, token,
                    '/lost_found?id=eq.' + Number(item.id), 'PATCH',
                    { status: 'resolved' }, 'return=minimal'
                );
                // 其他还在等待的认领自动拒绝，避免继续打扰
                try {
                    await writeRows(
                        SUPABASE_URL, SUPABASE_KEY, token,
                        '/lost_found_claims?item_id=eq.' + Number(item.id) + '&status=eq.pending&id=neq.' + claimId,
                        'PATCH', { status: 'rejected' }, 'return=minimal'
                    );
                } catch (_) {}
            }
            return json({ ok: true, decision: decision });
        }

        // ---------- 关闭 / 标记已找回 ----------
        if (body.action === 'close') {
            const itemId = Number(body.item_id);
            if (!itemId) return json({ error: '缺少失物 ID' }, 400);
            const status = body.status === 'closed' ? 'closed' : 'resolved';
            const items = await getRows(SUPABASE_URL, SUPABASE_KEY, token,
                '/lost_found?id=eq.' + itemId + '&select=owner_id,status');
            if (!items.length) return json({ error: '这条信息不存在' }, 404);
            if (String(items[0].owner_id) !== String(uid)) return json({ error: '只有发布者可以操作' }, 403);
            await writeRows(SUPABASE_URL, SUPABASE_KEY, token,
                '/lost_found?id=eq.' + itemId, 'PATCH', { status: status }, 'return=minimal');
            return json({ ok: true, status: status });
        }

        return json({ error: '未知的 action' }, 400);
    } catch (err) {
        return json({ error: err && err.message ? err.message : String(err) }, 502);
    }
}
