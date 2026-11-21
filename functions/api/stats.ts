/**
 * Cloudflare Pages Function: /api/stats
 * 公开数据看板：访问量 / 下载量 / AI 使用 / 内容与课程规模 / 组队 / 失物找回
 *
 * 只返回聚合数字，不返回任何用户邮箱、手机号等个人信息。
 * 读取 site_stats 需要 service_role（RLS 只允许服务端读）；没配时降级为 0，不影响页面。
 *
 * 接口：GET /api/stats  → { stats, topDocs, generatedAt }
 */

const DEFAULT_URL = 'https://ihvusuaeksxynxewcmjs.supabase.co';
const DEFAULT_KEY = 'sb_publishable_NrbDiThGb-gPPSAVmVZXyA_PXXBslVc';

function json(data, status, headers) {
    return Response.json(data, { status: status || 200, headers: headers || {} });
}

async function countRows(url, key, path) {
    try {
        const res = await fetch(url + '/rest/v1' + path, {
            headers: {
                'apikey': key,
                'Authorization': 'Bearer ' + key,
                'Prefer': 'count=exact',
                'Range': '0-0'
            },
            cf: { cacheTtl: 0 }
        });
        if (!res.ok) return 0;
        const cr = res.headers.get('content-range') || '';
        const m = /\/(\d+)/.exec(cr);
        return m ? Number(m[1]) : 0;
    } catch (_) {
        return 0;
    }
}

async function getRows(url, key, path) {
    try {
        const res = await fetch(url + '/rest/v1' + path, {
            headers: { 'apikey': key, 'Authorization': 'Bearer ' + key },
            cf: { cacheTtl: 0 }
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (_) {
        return [];
    }
}

async function countUsers(url, serviceRole) {
    if (!serviceRole) return 0;
    try {
        const res = await fetch(url + '/auth/v1/admin/users?per_page=200', {
            headers: { 'apikey': serviceRole, 'Authorization': 'Bearer ' + serviceRole }
        });
        if (!res.ok) return 0;
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data.users || []);
        const cr = res.headers.get('content-range') || '';
        const m = /\/(\d+)/.exec(cr);
        return m ? Number(m[1]) : arr.length;
    } catch (_) {
        return 0;
    }
}

export async function onRequest({ request, env }) {
    if (request.method.toUpperCase() !== 'GET') {
        return json({ error: '只支持 GET' }, 405);
    }

    const SUPABASE_URL = (env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
    const SUPABASE_KEY = env.SUPABASE_KEY || DEFAULT_KEY;
    const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE || '';
    const READ_KEY = SERVICE_ROLE || SUPABASE_KEY;

    try {
        const [docs, comps, scenery, courses, teams, lostfound, lostfoundResolved, users, statRows, topDocs] = await Promise.all([
            countRows(SUPABASE_URL, READ_KEY, '/site_items?select=id&kind=eq.doc&status=eq.approved'),
            countRows(SUPABASE_URL, READ_KEY, '/site_items?select=id&kind=eq.comp&status=eq.approved'),
            countRows(SUPABASE_URL, READ_KEY, '/site_items?select=id&kind=eq.scenery&status=eq.approved'),
            countRows(SUPABASE_URL, READ_KEY, '/courses?select=id&status=eq.approved'),
            countRows(SUPABASE_URL, READ_KEY, '/teams?select=id'),
            countRows(SUPABASE_URL, READ_KEY, '/lost_found?select=id'),
            countRows(SUPABASE_URL, READ_KEY, '/lost_found?select=id&status=eq.resolved'),
            countUsers(SUPABASE_URL, SERVICE_ROLE),
            getRows(SUPABASE_URL, READ_KEY, '/site_stats?select=day,metric,cnt'),
            getRows(SUPABASE_URL, READ_KEY, '/site_items?select=name,view_count&kind=eq.doc&status=eq.approved&order=view_count.desc&limit=5')
        ]);

        const today = new Date().toISOString().slice(0, 10);
        function sum(metric, onlyToday) {
            return statRows.reduce(function (acc, r) {
                if (r.metric !== metric) return acc;
                if (onlyToday && r.day !== today) return acc;
                return acc + (Number(r.cnt) || 0);
            }, 0);
        }

        return json({
            stats: {
                visits: sum('visit', false),
                visitsToday: sum('visit', true),
                downloads: sum('download', false),
                downloadsToday: sum('download', true),
                ai: sum('ai', false),
                aiToday: sum('ai', true),
                docs: docs,
                comps: comps,
                scenery: scenery,
                courses: courses,
                teams: teams,
                lostfound: lostfound,
                lostfoundResolved: lostfoundResolved,
                users: users
            },
            topDocs: topDocs.map(function (d) {
                return { name: d.name || '未命名资料', views: Number(d.view_count) || 0 };
            }),
            generatedAt: new Date().toISOString()
        }, 200, { 'Cache-Control': 'public, s-maxage=60, max-age=0' });
    } catch (err) {
        return json({ error: '统计数据读取失败：' + (err && err.message ? err.message : String(err)) }, 502);
    }
}
