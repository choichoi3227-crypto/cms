// src/lib/auth.ts
// 공통 세션 인증 헬퍼 (정적 빌드용 — 타입 정의만 포함)
// 실제 인증 로직은 백엔드 API 서버에서 처리됩니다.

export interface SessionUser {
  ID: number;
  user_login: string;
  user_email: string;
  roles: string[];
}

/**
 * 클라이언트 사이드: 세션 쿠키에서 토큰 읽기
 */
export function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/cp_cms_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * 클라이언트 사이드: API에서 현재 사용자 정보 조회
 */
export async function fetchCurrentUser(): Promise<SessionUser | null> {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    const data = await res.json() as { user?: SessionUser };
    return data.user ?? null;
  } catch {
    return null;
  }
}
