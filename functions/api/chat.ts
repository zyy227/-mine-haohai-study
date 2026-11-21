/**
 * Cloudflare Pages Function: /api/chat
 * 作用：代理 OpenRouter 请求，API 密钥只存在于服务端环境变量中，前端看不到。
 *
 * 安全防护：
 *   1) 模型白名单：只允许本站使用的两个免费模型，杜绝别人用你的密钥调用付费模型盗刷
 *   2) 消息数量/长度限制：防止单次请求烧掉大量 token
 *   3) 可选 Origin 校验：配置 ALLOWED_ORIGIN 后生效，多个域名用英文逗号分隔
 *
 * 需要在 Cloudflare Pages → 设置 → 环境变量 中添加：
 *   OPENROUTER_API_KEY  =  你的 OpenRouter 密钥（必填）
 *   ALLOWED_ORIGIN      =  允许的来源，多个用逗号分隔，如 https://xxx.pages.dev,https://yyy.pages.dev（可选）
 */

// 只允许的模型白名单 —— 以后新增模型时在这里加一行
const ALLOWED_MODELS = new Set([
  'openrouter/free',
  'google/gemini-2.0-flash-exp:free'
]);

const MAX_MESSAGES = 30;        // 单轮最多携带的消息数
const MAX_CONTENT_CHARS = 8000; // 单条消息最大字符数

export async function onRequestPost({ request, env, ctx }) {
    // 可选：限制只有自己的网站能调用（支持多个域名，逗号分隔）
    const allowedOrigin = env.ALLOWED_ORIGIN;
    if (allowedOrigin) {
        const origin = request.headers.get('Origin') || '';
        const allowList = allowedOrigin.split(',').map(s => s.trim()).filter(Boolean);
        // Origin 为空（同源/服务器直连）放行；非空但不在名单内则拒绝
        if (origin && !allowList.includes(origin)) {
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

    const { model, messages, stream = true, temperature = 0.7, max_tokens } = payload || {};
    if (!model || !Array.isArray(messages)) {
        return Response.json({ error: { message: '缺少 model 或 messages 参数' } }, { status: 400 });
    }
    // 限制单次输出长度：既能让回答更快结束，也防止一次烧掉太多 token
    const maxTokens = Math.min(Math.max(Number(max_tokens) || 1200, 200), 2000);

    // ① 模型白名单：只放行本站使用的免费模型，拒绝一切付费模型请求
    if (!ALLOWED_MODELS.has(model)) {
        return Response.json({ error: { message: '该模型不在允许列表内' } }, { status: 400 });
    }

    // ② 消息数量与长度限制，防止单次请求烧掉大量 token
    if (messages.length > MAX_MESSAGES) {
        return Response.json({ error: { message: '对话轮数过多，请开启新对话' } }, { status: 400 });
    }
    for (const m of messages) {
        if (!m || typeof m.content !== 'string' || m.content.length > MAX_CONTENT_CHARS) {
            return Response.json({ error: { message: '消息内容过长或格式不正确' } }, { status: 400 });
        }
    }

    const siteOrigin = new URL(request.url).origin;

    let upstream;
    try {
        upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': allowedOrigin ? allowedOrigin.split(',')[0].trim() : siteOrigin,
                'X-Title': 'HaoHai Campus AI'
            },
            body: JSON.stringify({ model, messages, stream, temperature, max_tokens: maxTokens }),
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

    // AI 用量埋点：记录一次提问（按天聚合）。失败不影响对话，用 waitUntil 后台执行不阻塞流。
    try {
        const SUPABASE_URL = (env.SUPABASE_URL || 'https://ihvusuaeksxynxewcmjs.supabase.co').replace(/\/$/, '');
        const SUPABASE_KEY = env.SUPABASE_KEY || 'sb_publishable_NrbDiThGb-gPPSAVmVZXyA_PXXBslVc';
        const trackPromise = fetch(SUPABASE_URL + '/rest/v1/rpc/bump_stat', {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ p_metric: 'ai' })
        }).catch(function () {});
        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(trackPromise);
    } catch (_) {}

    return new Response(upstream.body, { status: upstream.status, headers });
}
