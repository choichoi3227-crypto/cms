# CloudPress CMS 배포 가이드

## 전체 순서 요약

```
1. wrangler d1 create  →  wrangler.toml에 ID 입력
2. wrangler kv namespace create (2개)  →  wrangler.toml에 ID 입력
3. DB 스키마 적용 (schema.sql)
4. 관리자 계정 비밀번호 초기화
5. npm run build → wrangler deploy  또는  Pages 대시보드 연결
```

---

## 1단계: Cloudflare 리소스 생성

```bash
# D1 데이터베이스
wrangler d1 create cloudpress-cms-db
# → 출력된 database_id → wrangler.toml [[d1_databases]].database_id 에 입력

# KV 네임스페이스 (2개)
wrangler kv namespace create CACHE
# → 첫 번째 [[kv_namespaces]].id 에 입력

wrangler kv namespace create SESSION_SWAP
# → 두 번째 [[kv_namespaces]].id 에 입력
```

## 2단계: DB 스키마 적용

```bash
wrangler d1 execute cloudpress-cms-db --remote --file=schema.sql
```

## 3단계: 관리자 계정 설정

```bash
# 초기화 스크립트로 SQL 생성
WP_ADMIN_PASS=원하는비밀번호 node scripts/init-admin.mjs

# 출력된 wrangler 명령어 복사해서 실행
wrangler d1 execute cloudpress-cms-db --remote --command="UPDATE wp_users SET ..."
```

## 4단계: Secrets 설정

```bash
wrangler secret put JWT_SECRET
# (랜덤 문자열, 예: openssl rand -base64 32)

wrangler secret put GITHUB_TOKEN
# (repo 권한이 있는 GitHub PAT)
```

## 5단계: 배포

### 방법 A — CLI 직접 배포

```bash
npm install
npm run build
wrangler deploy
```

### 방법 B — Cloudflare Pages Git 연동 (권장)

1. Cloudflare 대시보드 → Workers & Pages → Create application → Pages
2. GitHub 레포 연결
3. 빌드 설정:
   - **Framework preset**: Astro
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. 환경변수 추가 (Settings → Environment variables):
   - `JWT_SECRET`, `GITHUB_TOKEN`, `WP_ADMIN_PASS` 등

---

## 로그인

배포 완료 후 `https://your-project.pages.dev/login` 으로 접속

- **사용자**: `admin` (또는 WP_ADMIN_USER)
- **비밀번호**: 3단계에서 설정한 값

---

## wrangler.toml 작성 예시

```toml
name                   = "cloudpress-cms"
pages_build_output_dir = "dist"
compatibility_date     = "2025-04-01"
compatibility_flags    = ["nodejs_compat"]

[[d1_databases]]
binding       = "DB"
database_name = "cloudpress-cms-db"
database_id   = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

[[kv_namespaces]]
binding = "CACHE"
id      = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

[[kv_namespaces]]
binding = "SESSION_SWAP"
id      = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"

[vars]
WP_TABLE_PREFIX = "wp_"
SITE_URL        = "https://your-project.pages.dev"
```
