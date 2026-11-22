/**
 * Cloudflare Pages Function: /api/supabase/*
 * 作用：把 Supabase SDK 的请求（登录/注册/上传等）转发到 Supabase，
 *      让手机只连自己的域名，绕开国内直连 *.supabase.co 经常超时的问题。
 *
 * 为什么需要：页面数据已经走 /api/items 中转，但 supabase-js 的
 * auth（登录/注册）和 storage（上传）仍然直连 supabase.co，
 * 手机 4G/5G 下经常报“网络连接失败”。
 *
 * 安全：只允许转发到固定的 Supabase 项目，路径限定 auth/rest/storage/functions，
 *      不接受任意 URL，不会被当成开放代理。
 */

const DEFAULT_URL = 'https://ihvusuaeksxynxewcmjs.supabase.co';
const ALLOWED_PREFIXES = ['/auth/v1', '/rest/v1', '/storage/v1', '/functions/v1'];

export async function onRequest({ request, params, env }) {
    const url = new URL(request.url);
    const raw = params && params.path;
    const path = '/' + (Array.isArray(raw) ? raw.join('/') : (raw || ''));

    if (!ALLOWED_PREFIXES.some(function (p) {
        return path === p || path.indexOf(p + '/') === 0;
    })) {
        return Response.json({ error: '不允许的代理路径' }, { status: 403 });
    }

    const SUPABASE_URL = (env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
    const target = SUPABASE_URL + path + url.search;

    // 复制请求头，去掉 Cloudflare/浏览器相关、可能干扰上游的字段
    const headers = new Headers();
    const drop = new Set([
        'host', 'connection', 'content-length', 'cf-connecting-ip', 'cf-ipcountry',
        'x-forwarded-for', 'x-real-ip', 'origin', 'referer', 'cookie'
    ]);
    request.headers.forEach(function (value, key) {
        if (!drop.has(String(key).toLowerCase())) headers.set(key, value);
    });

    const method = request.method.toUpperCase();
    const init = { method: method, headers: headers, redirect: 'manual' };
    if (method !== 'GET' && method !== 'HEAD') {
        init.body = await request.arrayBuffer();
    }

    let upstream;
    try {
        upstream = await fetch(target, init);
    } catch (err) {
        return Response.json({ error: 'Supabase 代理请求失败：' + (err && err.message ? err.message : String(err)) }, { status: 502 });
    }

    const outHeaders = new Headers();
    ['content-type', 'content-range', 'content-disposition', 'cache-control', 'etag', 'last-modified', 'x-supabase-api-version', 'location'].forEach(function (k) {
        const v = upstream.headers.get(k);
        if (v) outHeaders.set(k, v);
    });

    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
}
