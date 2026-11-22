/**
 * Cloudflare Pages Function: /api/auth/register
 * 作用：用 service_role 直接创建“已确认邮箱”的用户，绕过 Supabase 的 Confirm email 开关。
 *      注册后前端立刻用同一密码登录，不再发验证邮件、不需要去邮箱点链接。
 *
 * 安全说明：
 *   · service_role 只存在于 Cloudflare 环境变量，前端拿不到
 *   · 只接受 email + password + username，不接受任意字段
 *   · 注册时把 username 写进 profiles.nickname，网页前台只显示用户名
 *   · 这是“关闭邮箱验证”的替代方案，适合校园比赛/内部使用；
 *     公开运营时建议加邀请码/频率限制，避免被批量注册
 *
 * 接口：POST /api/auth/register  { email, password, username } → { ok, user }
 */

const DEFAULT_URL = 'https://ihvusuaeksxynxewcmjs.supabase.co';

function json(data, status) {
    return Response.json(data, { status: status || 200 });
}

function validPassword(pw) {
    return typeof pw === 'string' && pw.length >= 6 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

function validUsername(name) {
    return typeof name === 'string' && /^[\u4e00-\u9fa5A-Za-z0-9_-]{2,16}$/.test(name);
}

export async function onRequest({ request, env }) {
    if (request.method.toUpperCase() !== 'POST') {
        return json({ error: '只支持 POST' }, 405);
    }

    const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE || '';
    if (!SERVICE_ROLE) {
        return json({ error: '服务端未配置 SUPABASE_SERVICE_ROLE，无法直接注册' }, 500);
    }

    let body;
    try { body = await request.json(); } catch (_) {
        return json({ error: '请求体必须是 JSON' }, 400);
    }

    const email = String(body && body.email || '').trim().toLowerCase();
    const password = String(body && body.password || '');
    const username = String(body && body.username || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: '请输入正确的邮箱地址' }, 400);
    }
    if (!validUsername(username)) {
        return json({ error: '用户名需 2-16 个字，支持中文、字母、数字、下划线和短横线' }, 400);
    }
    if (!validPassword(password)) {
        return json({ error: '密码至少 6 位，且同时包含字母和数字' }, 400);
    }

    const SUPABASE_URL = (env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');

    let upstream;
    try {
        upstream = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
            method: 'POST',
            headers: {
                'apikey': SERVICE_ROLE,
                'Authorization': 'Bearer ' + SERVICE_ROLE,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: password,
                email_confirm: true,   // 关键：直接标记为已确认
                user_metadata: { username: username }
            })
        });
    } catch (err) {
        return json({ error: '创建账号失败：' + (err && err.message ? err.message : String(err)) }, 502);
    }

    const text = await upstream.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }

    if (!upstream.ok) {
        const msg = String((data && (data.msg || data.message || data.error_description || data.error)) || text || '');
        if (/already|exists|registered|duplicate/i.test(msg)) {
            return json({ error: '该邮箱已注册。如果之前注册的账号还没验证，请让管理员在 Supabase → Authentication → Users 里确认或删除后重试。' }, 409);
        }
        return json({ error: '创建账号失败：' + (msg || ('HTTP ' + upstream.status)) }, 502);
    }

    // 把注册时填的用户名写进 profiles.nickname；触发器可能已按邮箱建过行，这里用 upsert 覆盖
    let profileWarning = '';
    const uid = data && data.id;
    if (uid) {
        try {
            const profileRes = await fetch(SUPABASE_URL + '/rest/v1/profiles?on_conflict=id', {
                method: 'POST',
                headers: {
                    'apikey': SERVICE_ROLE,
                    'Authorization': 'Bearer ' + SERVICE_ROLE,
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=merge-duplicates,return=minimal'
                },
                body: JSON.stringify([{ id: uid, nickname: username }])
            });
            if (!profileRes.ok) {
                profileWarning = '账号已创建，但用户名保存失败，可在“我的-编辑资料”里补填昵称';
                console.warn('保存用户名失败：', await profileRes.text());
            }
        } catch (err) {
            profileWarning = '账号已创建，但用户名保存失败，可在“我的-编辑资料”里补填昵称';
            console.warn('保存用户名异常：', err);
        }
    }

    return json({
        ok: true,
        user: {
            id: uid,
            email: (data && data.email) || email,
            name: username
        },
        profile_warning: profileWarning
    });
}
