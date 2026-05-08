// src/pages/api/auth/login.ts
export const prerender = false;

export async function POST({ request, env, cookies }: { request: Request; env: any; cookies: any }) {
  try {
    const { username, password } = await request.json();
    if (!username || !password) {
      return Response.json({ error: '사용자 이름과 비밀번호가 필요합니다.' }, { status: 400 });
    }

    const db: D1Database = env.DB;

    // 사용자 조회 (이메일 또는 로그인명)
    const user = await db.prepare(
      `SELECT ID, user_login, user_pass, user_email, display_name
       FROM wp_users
       WHERE user_login = ? OR user_email = ?
       LIMIT 1`
    ).bind(username, username).first<any>().catch(() => null);

    if (!user) {
      return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 401 });
    }

    // 비밀번호 검증 (간단한 bcrypt-like 해시 비교)
    // 실제로는 wp-password-hash 라이브러리를 사용해야 하지만
    // 여기서는 직접 해시된 값과 비교
    const isValid = await verifyPassword(password, user.user_pass, env);
    if (!isValid) {
      return Response.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    // JWT 세션 토큰 생성
    const token = await createJwt(
      { sub: String(user.ID), username: user.user_login, email: user.user_email },
      env.JWT_SECRET || 'dev-secret'
    );

    // 쿠키 설정
    const headers = new Headers();
    headers.append('Set-Cookie',
      `cp_cms_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
    );
    headers.append('Content-Type', 'application/json');

    return new Response(JSON.stringify({
      success: true,
      user: { id: user.ID, username: user.user_login, email: user.user_email }
    }), { status: 200, headers });

  } catch (e: any) {
    return Response.json({ error: e.message || '서버 오류' }, { status: 500 });
  }
}

// ── JWT 생성 (HS256, Web Crypto API) ────────────────────────────────────────
async function createJwt(payload: Record<string, any>, secret: string): Promise<string> {
  const header  = { alg: 'HS256', typ: 'JWT' };
  const now     = Math.floor(Date.now() / 1000);
  const claims  = { ...payload, iat: now, exp: now + 60 * 60 * 24 * 7 };

  const enc     = (obj: any) => btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const sigData = `${enc(header)}.${enc(claims)}`;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(sigData));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

  return `${sigData}.${sigB64}`;
}

// ── 비밀번호 검증 ────────────────────────────────────────────────────────────
async function verifyPassword(plain: string, hash: string, env: any): Promise<boolean> {
  // WordPress phpass 형식 ($P$) 또는 일반 bcrypt 처리
  // 간단한 구현: plain text 또는 SHA1 매칭 (개발 환경용)
  // 프로덕션에서는 php-wasm을 통해 WordPress의 wp_check_password() 호출 권장

  // 평문 비교 (초기 설정용)
  if (hash === plain) return true;

  // SHA-256 해시 비교
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
  const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
  if (hash === hashHex) return true;

  // WordPress MD5 기반 해시 ($P$)
  if (hash.startsWith('$P$') || hash.startsWith('$apr1$')) {
    // phpass 검증은 php-wasm에서 처리
    // 여기서는 환경변수 WP_ADMIN_PASS와 직접 비교 (초기 설정)
    if (env.WP_ADMIN_PASS && plain === env.WP_ADMIN_PASS) return true;
  }

  return false;
}
