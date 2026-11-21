/**
 * Cloudflare Pages Function: /api/items
 * 作用：代理 site_items 清单的读写。让访客（尤其手机 4G）只连本站域名，
 *      由 Cloudflare 服务器去连 Supabase，绕开海外域名在移动网络下不稳定的问题。
 *
 * 用户身份（注册登录 + 权限隔离）：
 *   前端登录后，把 Supabase 的 access_token 放在请求头 X-User-Token 传来。
 *   本函数把这个 token 作为 Bearer 转发给 Supabase REST，Supabase RLS 据此判断
 *   "当前是谁"，从而做到：人人可读、登录可增、只能删改自己的内容。
 *   注意：publishable key 是公开的（前端明文带着），不算密钥；真正的权限靠 RLS + 用户 token。
 *
 * 接口约定（前端 index.html 调用）：
 *   GET  /api/items                → 返回 { items: [...] }
 *   POST /api/items                → body: 一行 row，插入；返回 { ok:true }
 *   PATCH /api/items?id=X          → body: 部分字段，仅改自己的行；返回 { ok:true }
 *   DELETE /api/items?id=X&kind=Y  → 删除一行；返回 { ok:true }
 */

export async function onRequest({ request, env }) {
    // 内置默认值（与前端 index.html 一致，开箱即用）；环境变量可覆盖，方便日后换项目
    const DEFAULT_URL = 'https://ihvusuaeksxynxewcmjs.supabase.co';
    const DEFAULT_KEY = 'sb_publishable_NrbDiThGb-gPPSAVmVZXyA_PXXBslVc';
    const SUPABASE_URL = (env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
    const SUPABASE_KEY = env.SUPABASE_KEY || DEFAULT_KEY;

    const restUrl = SUPABASE_URL + '/rest/v1/site_items';

    // 取前端传来的登录 token；有就代表"以该用户身份"访问，没有就是游客（anon）
    const userToken = (request.headers.get('X-User-Token') || '').trim();
    const authToken = userToken || SUPABASE_KEY;

    // apikey 固定用项目公钥；Authorization 用用户 token（登录）或公钥（游客）
    const baseHeaders = {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + authToken
    };

    const method = request.method.toUpperCase();

    try {
        if (method === 'GET') {
            // 分页上限：默认 1000 条，和前端 ITEM_FETCH_LIMIT 保持一致
            // 超过上限时返回 truncated:true，前端会提示"仅显示最近 N 条"，不再静默丢数据
            const pageUrl = new URL(request.url);
            const rawLimit = Number(pageUrl.searchParams.get('limit'));
            const limit = Math.min(Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 1000, 1), 1000);
            const upstream = await fetch(restUrl + '?select=*&order=id.desc&limit=' + limit, {
                headers: baseHeaders,
                cf: { cacheTtl: 0 }
            });
            const data = await upstream.json();
            if (!upstream.ok) return Response.json(data, { status: upstream.status });
            const items = Array.isArray(data) ? data : [];
            return Response.json({ items: items, limit: limit, truncated: items.length >= limit });
        }

        if (method === 'POST' || method === 'PATCH') {
            let body;
            try { body = await request.json(); }
            catch (_) { return Response.json({ error: '请求体必须是 JSON' }, { status: 400 }); }

            if (method === 'POST') {
                const rows = Array.isArray(body) ? body : [body];
                if (!rows.length || rows.some(function (r) { return !r || typeof r.id === 'undefined' || !r.kind; })) {
                    return Response.json({ error: '缺少 id 或 kind' }, { status: 400 });
                }
                if (!userToken) {
                    return Response.json({ error: '请先登录后再发布' }, { status: 401 });
                }
                const upstream = await fetch(restUrl, {
                    method: 'POST',
                    headers: { ...baseHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                    body: JSON.stringify(rows)
                });
                if (!upstream.ok) {
                    const msg = await upstream.text();
                    return Response.json({ error: msg }, { status: upstream.status });
                }
                return Response.json({ ok: true });
            }

            // PATCH：编辑自己的行（RLS 保证只能改自己的）
            const url = new URL(request.url);
            const id = url.searchParams.get('id');
            if (!id) return Response.json({ error: '缺少 id' }, { status: 400 });
            if (!userToken) return Response.json({ error: '请先登录后再编辑' }, { status: 401 });
            const upstream = await fetch(restUrl + '?id=eq.' + encodeURIComponent(id), {
                method: 'PATCH',
                headers: { ...baseHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify(body)
            });
            if (!upstream.ok) {
                const msg = await upstream.text();
                return Response.json({ error: msg }, { status: upstream.status });
            }
            return Response.json({ ok: true });
        }

        if (method === 'DELETE') {
            if (!userToken) return Response.json({ error: '请先登录后再删除' }, { status: 401 });
            const url = new URL(request.url);
            const id = url.searchParams.get('id');
            const kind = url.searchParams.get('kind');
            if (!id || !kind) {
                return Response.json({ error: '缺少 id 或 kind' }, { status: 400 });
            }
            const upstream = await fetch(
                restUrl + '?id=eq.' + encodeURIComponent(id) + '&kind=eq.' + encodeURIComponent(kind),
                { method: 'DELETE', headers: baseHeaders }
            );
            if (!upstream.ok) {
                const msg = await upstream.text();
                return Response.json({ error: msg }, { status: upstream.status });
            }
            return Response.json({ ok: true });
        }

        return Response.json({ error: '不支持的请求方法' }, { status: 405 });
    } catch (err) {
        return Response.json(
            { error: '请求 Supabase 失败：' + (err?.message || String(err)) },
            { status: 502 }
        );
    }
}
