// src/pages/api/tools/health.ts
export const prerender = false;
import { getSessionUser } from '../auth/me';

export async function GET({ request, env }: { request: Request; env: any }) {
  try {
    await getSessionUser(request, env);
    const db     = env.DB as D1Database;
    const checks = [];

    // D1 데이터베이스 연결
    try {
      await db.prepare('SELECT 1').first();
      checks.push({ icon:'🗄️', label:'데이터베이스 연결', description:'Cloudflare D1에 정상적으로 연결되어 있습니다.', status:'good' });
    } catch {
      checks.push({ icon:'🗄️', label:'데이터베이스 연결', description:'D1 데이터베이스에 연결할 수 없습니다.', status:'error' });
    }

    // KV 캐시
    if (env.CACHE) {
      checks.push({ icon:'⚡', label:'KV 캐시', description:'Cloudflare KV 캐시가 활성화되어 있습니다.', status:'good' });
    } else {
      checks.push({ icon:'⚡', label:'KV 캐시', description:'KV 캐시가 설정되지 않았습니다. wrangler.toml에서 CACHE 바인딩을 확인하세요.', status:'warning' });
    }

    // GitHub 연동
    if (env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO) {
      try {
        const ghRes = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`, {
          headers: { Authorization: `token ${env.GITHUB_TOKEN}`, 'User-Agent': 'CloudPress/1.0' },
        });
        if (ghRes.ok) {
          checks.push({ icon:'🐱', label:'GitHub 연동', description:`${env.GITHUB_OWNER}/${env.GITHUB_REPO} 레포지토리에 정상 연결되어 있습니다.`, status:'good' });
        } else {
          checks.push({ icon:'🐱', label:'GitHub 연동', description:'GitHub 토큰 또는 레포지토리 설정을 확인하세요.', status:'warning' });
        }
      } catch {
        checks.push({ icon:'🐱', label:'GitHub 연동', description:'GitHub API에 연결할 수 없습니다.', status:'error' });
      }
    } else {
      checks.push({ icon:'🐱', label:'GitHub 연동', description:'GitHub 설정이 없습니다. 파일 저장이 D1로만 이루어집니다.', status:'warning' });
    }

    // JWT 시크릿
    if (env.JWT_SECRET && env.JWT_SECRET !== 'dev-secret') {
      checks.push({ icon:'🔐', label:'보안 키', description:'JWT 시크릿이 안전하게 설정되어 있습니다.', status:'good' });
    } else {
      checks.push({ icon:'🔐', label:'보안 키', description:'기본 JWT 시크릿을 사용 중입니다. 프로덕션에서는 반드시 변경하세요.', status:'warning' });
    }

    // WordPress 테이블
    try {
      const tables = ['wp_posts', 'wp_options', 'wp_users', 'wp_postmeta'];
      let allExist = true;
      for (const t of tables) {
        const r = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`).first<any>();
        if (!r) { allExist = false; break; }
      }
      if (allExist) {
        checks.push({ icon:'📋', label:'WordPress 테이블', description:'모든 필수 WordPress 테이블이 존재합니다.', status:'good' });
      } else {
        checks.push({ icon:'📋', label:'WordPress 테이블', description:'일부 테이블이 누락되었습니다. schema.sql을 다시 실행하세요.', status:'error' });
      }
    } catch {
      checks.push({ icon:'📋', label:'WordPress 테이블', description:'테이블 확인 중 오류가 발생했습니다.', status:'error' });
    }

    // R2 미디어 스토리지
    if (env.MEDIA) {
      checks.push({ icon:'🪣', label:'R2 미디어 스토리지', description:'Cloudflare R2 버킷이 연결되어 있습니다. 미디어 파일이 R2에 저장됩니다.', status:'good' });
    } else {
      checks.push({ icon:'🪣', label:'R2 미디어 스토리지', description:'R2 버킷이 없습니다. 미디어 파일이 D1(청크)에 저장됩니다. 대용량 파일에는 R2 설정을 권장합니다.', status:'warning' });
    }

    const good    = checks.filter(c => c.status === 'good').length;
    const total   = checks.length;
    const overall = good === total ? 'good' : good >= total * 0.7 ? 'warning' : 'error';

    return Response.json({ checks, overall, score: `${good}/${total}` });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
