/**
 * Cloudflare Pages Function: /api/chat
 * 作用：代理 OpenRouter 请求，API 密钥只存在于服务端环境变量中，前端看不到。
 *
 * 部署后需要在 Cloudflare Pages → 设置 → 环境变量 中添加：
 *   OPENROUTER_API_KEY  =  你的 OpenRouter 密钥（必填）
 *   ALLOWED_ORIGIN      =  你的网站域名，如 https://haohai.pages.dev（可选，防止别人盗用接口）
 */

export async function onRequestPost({ request, env }) {
    // 可选：限制只有自己的网站能调用这个接口
    const allowedOrigin = env.ALLOWED_ORIGIN;
    if (allowedOrigin) {
        const origin = request.headers.get('Origin') || '';
        if (origin && origin !== allowedOrigin) {
            return Response.json({ error: { message: 'Forbidden' } }, { status: 403 });
        }
    }

    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return Response.json(
            { error: { message: '服务端未配置 OPENROUTER_API_KEY，请在 Cloudflare Pages → 设置 → 环境变量中添加' } },
            { status: 500 }
        );
    }

    let payload;
    try {
        payload = await request.json();
    } catch (_) {
        return Response.json({ error: { message: '请求体必须是 JSON' } }, { status: 400 });
    }

    const { model, messages, stream = true, temperature = 0.7 } = payload || {};
    if (!model || !Array.isArray(messages)) {
        return Response.json({ error: { message: '缺少 model 或 messages 参数' } }, { status: 400 });
    }

    const siteOrigin = new URL(request.url).origin;

    let upstream;
    try {
        upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': allowedOrigin || siteOrigin,
                'X-Title': 'HaoHai Campus AI'
            },
            body: JSON.stringify({ model, messages, stream, temperature }),
            signal: request.signal
        });
    } catch (err) {
        return Response.json(
            { error: { message: '上游请求失败：' + (err?.message || String(err)) } },
            { status: 502 }
        );
    }

    // 把 OpenRouter 的响应原样透传回去（含 SSE 流），前端原有的流式解析不用改
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json; charset=utf-8');
    headers.set('Cache-Control', 'no-cache, no-transform');
    headers.set('X-Accel-Buffering', 'no');
    return new Response(upstream.body, { status: upstream.status, headers });
}
