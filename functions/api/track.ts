/**
 * Cloudflare Pages Function: /api/track
 * 作用：统计埋点（网站访问 / 下载查看 / AI 提问），按天聚合写入 Supabase。
 *
 * 设计：
 *   · 用 publishable key（anon）调用数据库函数 bump_stat / bump_view
 *   · 无需登录，游客也能埋点；数据只有服务端用 service_role 才能读
 *   · 失败不影响主功能（fire-and-forget 语义，前端不依赖返回值）
 *
 * 接口约定：
 *   POST /api/track  body: { metric: 'visit'|'download'|'ai', itemId?: number }
 *   GET  /api/track  → 简单健康检查 { ok: true }
 */

const DEFAULT_URL = 'https://ihvusuaeksxynxewcmjs.supabase.co';
const DEFAULT_KEY = 'sb_publishable_NrbDiThGb-gPPSAVmVZXyA_PXXBslVc';

const ALLOWED_METRICS = new Set(['visit', 'download', 'ai']);

function json(data, status) {
    return Response.json(data, { status: status || 200 });
}

export async function onRequest({ request, env }) {
    if (request.method.toUpperCase() === 'GET') return json({ ok: true });
    if (request.method.toUpperCase() !== 'POST') return json({ error: '不支持的请求方法' }, 405);

    const SUPABASE_URL = (env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
    const SUPABASE_KEY = env.SUPABASE_KEY || DEFAULT_KEY;

    let body;
    try { body = await request.json(); }
    catch (_) { return json({ error: '请求体必须是 JSON' }, 400); }

    const metric = body && body.metric;
    if (!ALLOWED_METRICS.has(metric)) return json({ error: '无效的统计类型' }, 400);

    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    };

    try {
        // 按天聚合计数
        const statRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/bump_stat', {
            method: 'POST', headers,
            body: JSON.stringify({ p_metric: metric })
        });

        // 如果是下载/查看，且带了 itemId，则给该条内容计数 +1
        let viewOk = true;
        const itemId = Number(body.itemId);
        if (metric === 'download' && itemId) {
            const viewRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/bump_view', {
                method: 'POST', headers,
                body: JSON.stringify({ p_id: itemId })
            });
            viewOk = viewRes.ok;
        }

        if (!statRes.ok) {
            const msg = await statRes.text();
            return json({ error: '统计写入失败：' + msg }, statRes.status);
        }
        return json({ ok: viewOk });
    } catch (err) {
        return json({ error: '统计请求失败：' + (err?.message || String(err)) }, 502);
    }
}
