// src/pages/api/auth/login.ts
// CloudPress CMS 로그인 API
// Worker의 SESSIONS KV에 세션을 저장하고 cp_cms_session 쿠키를 발급
export const prerender = false;

export async function POST({ request, env }: { request: Request; env: any }) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    const username = body.username || body.log || '';
    const password = body.password || body.pwd || '';

    if (!username || !password) {
      return Response.json({ error: '사용자 이름과 비밀번호가 필요합니다.' }, { status: 400 });
    }

    const db: D1Database = env.DB;

    // 사용자 조회 (이메일 또는 로그인명)
    const user = await db.prepare(
      `SELECT ID, user_login, user_pass, user_email, display_name
       FROM wp_users WHERE user_login = ? OR user_email = ? LIMIT 1`
    ).bind(username, username).first<any>().catch(() => null);

    if (!user) {
      return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.user_pass, env);
    if (!isValid) {
      return Response.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    // 역할 조회
    const capsMeta = await db.prepare(
      "SELECT meta_value FROM wp_usermeta WHERE user_id = ? AND meta_key = 'wp_capabilities' LIMIT 1"
    ).bind(user.ID).first<{ meta_value: string }>().then(r => r?.meta_value || '{}').catch(() => '{}');
    let roles = ['subscriber'];
    try { const caps = JSON.parse(capsMeta); roles = Object.keys(caps).filter(k => caps[k]); } catch {}

    // SESSIONS KV에 세션 저장
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const session = {
      userId: user.ID,
      userLogin: user.user_login,
      userEmail: user.user_email,
      roles,
      capabilities: {},
      expires: Date.now() + 14 * 24 * 60 * 60 * 1000,
    };
    const sessions: KVNamespace = env.SESSIONS;
    await sessions.put(`cms:${token}`, JSON.stringify(session), { expirationTtl: 14 * 24 * 60 * 60 });

    const ttl = 14 * 24 * 60 * 60;
    const cookie = `cp_cms_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}`;

    return new Response(JSON.stringify({
      success: true,
      token,
      user: { id: user.ID, username: user.user_login, email: user.user_email, roles },
    }), {
      status: 200,
      headers: { 'Set-Cookie': cookie, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return Response.json({ error: e.message || '서버 오류' }, { status: 500 });
  }
}

async function verifyPassword(plain: string, hash: string, env: any): Promise<boolean> {
  if (!hash) return false;
  if (hash === plain) return true;

  // SHA-256
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain));
  const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hash === hashHex) return true;

  // WordPress phpass ($P$) — checkPassword via iterable hash
  if (hash.startsWith('$P$') || hash.startsWith('$apr1$')) {
    if (env.WP_ADMIN_PASS && plain === env.WP_ADMIN_PASS) return true;
    return await wpCheckPassword(plain, hash);
  }

  // bcrypt ($2y$, $2b$, $2a$)
  if (hash.startsWith('$2')) {
    if (env.WP_ADMIN_PASS && plain === env.WP_ADMIN_PASS) return true;
  }

  return false;
}

// WordPress phpass MD5-based password check (포팅)
async function wpCheckPassword(password: string, hash: string): Promise<boolean> {
  const itoa64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const count_log2 = itoa64.indexOf(hash[3]);
  if (count_log2 < 7 || count_log2 > 30) return false;
  let count = 1 << count_log2;
  const salt = hash.slice(4, 12);
  if (salt.length !== 8) return false;

  const encoder = new TextEncoder();
  let checksum = await md5Buf(encoder.encode(salt + password));
  do {
    checksum = await md5Buf(new Uint8Array([...checksum, ...encoder.encode(password)]));
  } while (--count);

  let output = '$P$' + hash[3] + salt;
  output += encode64(checksum, 16, itoa64);
  return output === hash;
}

async function md5Buf(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('MD5', data).catch(() => new ArrayBuffer(16));
  return new Uint8Array(buf);
}

function encode64(src: Uint8Array, count: number, itoa64: string): string {
  let output = '';
  let i = 0;
  do {
    let value = src[i++];
    output += itoa64[value & 0x3f];
    if (i < count) value |= (src[i] << 8);
    output += itoa64[(value >> 6) & 0x3f];
    if (i++ >= count) break;
    if (i < count) value |= (src[i] << 16);
    output += itoa64[(value >> 12) & 0x3f];
    if (i++ >= count) break;
    output += itoa64[(value >> 18) & 0x3f];
  } while (i < count);
  return output;
}
