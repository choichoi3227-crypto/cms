# CF-WordPress

**Cloudflare Workers 기반 WordPress 호환 CMS**

Cloudflare Workers에서 동작하는 서버리스 CMS입니다. D1은 관계형 CMS 데이터, KV는 세션·옵션·응답 캐시, Durable Object는 원자적 캐시 무효화를 담당하며 GitHub는 선택적인 파일 스토리지로 사용할 수 있습니다.

---

## ✨ 주요 기능

- **WordPress 호환 API** - WordPress REST API v2, 관리자 UI, 구텐베르크 블록 에디터 제공
- **WordPress 플러그인/테마 지원** - WordPress.org에서 직접 검색·설치, zip 파일 업로드 설치
- **구텐베르크 블록 에디터** - `/` 명령어로 35+ 블록 타입 삽입, 실시간 편집
- **GitHub 스토리지** - 미디어, 테마, 플러그인 파일을 GitHub 레포지토리에 저장
- **일관된 고속 캐시** - KV 페이지 캐시와 Durable Object generation 기반 즉시 무효화
- **번들 플러그인** - WP Rocket, AIBP Pro, AL Pack, Bridge Migration 기본 포함

---

## 📋 사전 요구사항

- [Cloudflare 계정](https://cloudflare.com) (Workers 플랜 - 무료 플랜 가능)
- [Node.js](https://nodejs.org) 18 이상
- [GitHub Personal Access Token](https://github.com/settings/tokens) (repo 권한)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

---

## 🚀 빠른 시작

### 1. 설치

```bash
# 저장소 클론 또는 파일 다운로드
cd cf-wordpress

# 의존성 설치
npm install

# 자동 설정 실행 (D1 + KV 자동 생성)
node scripts/setup.mjs
```

`setup.mjs`는 D1 1개와 KV namespace 3개(`cache`, `sessions`, `options`)를 생성하고 `wrangler.toml`의 placeholder를 실제 ID로 교체한 뒤 D1 마이그레이션을 적용합니다. Durable Object는 `wrangler.toml`에 선언되어 있으므로 최초 `wrangler deploy`에서 자동 프로비저닝됩니다. 여러 사이트를 한 계정에 설치할 경우 `CLOUDPRESS_RESOURCE_PREFIX=my-site node scripts/setup.mjs`로 리소스 이름을 분리하세요.

GitHub 스토리지는 선택 사항입니다. 설치 화면에서 토큰 인증 또는 레포지토리 생성이 실패해도 D1/KV 기반 CMS 설치는 계속됩니다. GitHub를 사용하려면 classic PAT의 `repo` 권한 또는 대상 레포지토리에 대한 fine-grained PAT의 **Contents: Read and write** 권한을 사용하세요.

### 자동화 API 토큰

호스팅 자동화 서비스는 관리자 로그인 세션으로 `POST /api/v1/tokens`를 호출해 토큰을 발급할 수 있습니다. 요청에는 `name`, `type` (`public` 또는 `secret`), `scopes`를 포함합니다. 토큰 원문은 발급 응답에서 한 번만 제공되며 D1에는 SHA-256 해시만 저장됩니다. `GET /api/v1/site`에는 `Authorization: Bearer cp_pub_...` 또는 `cp_sec_...`와 `site:read` scope가 필요합니다. 지원 scope는 `site:read`, `content:read`, `content:write`, `users:manage`이며, `DELETE /api/v1/tokens/:id`로 토큰을 폐기할 수 있습니다.

### 2. Secrets 설정

```bash
# 필수 secrets 설정
npx wrangler secret put JWT_SECRET
# 입력: 임의의 긴 문자열 (예: openssl rand -hex 32)

npx wrangler secret put ENCRYPTION_KEY
# 입력: 임의의 긴 문자열
```

### 3. 로컬 개발

```bash
npm run dev:worker
# http://localhost:8787 에서 실행
# /wp-setup 으로 이동하여 설치 마법사 시작
```

### 4. 배포

```bash
npx wrangler deploy
# 배포 후 https://your-worker.workers.dev/wp-setup 에서 설치
```

---

## 운영 보안과 자동화

- 공개 페이지는 로그인 쿠키, 관리자, API 경로를 캐시하지 않습니다. `Set-Cookie`가 포함된 응답도 캐시 저장에서 제외합니다.
- CMS 쓰기 요청과 예약 발행은 Durable Object의 cache generation을 증가시킵니다. 기존 KV 키를 순회 삭제하지 않아도 다음 읽기부터 새 generation만 사용하므로 빠르고 경합이 없습니다.
- `JWT_SECRET`, `ENCRYPTION_KEY`, `GITHUB_TOKEN`은 반드시 `wrangler secret put <NAME>`으로 설정하고 저장소·`wrangler.toml`에 넣지 마세요.
- 배포 전 `npm run build`와 `npm run check:worker`를 실행하세요. 후자는 실제 배포 없이 Worker 번들 및 D1/KV/DO binding을 검증합니다.

---

## 📁 프로젝트 구조

```
cf-wordpress/
├── worker/
│   └── src/
│       ├── index.ts              # 메인 Worker 진입점
│       ├── types/
│       │   └── env.ts            # TypeScript 타입 정의
│       ├── middleware/
│       │   ├── auth.ts           # 인증 미들웨어
│       │   ├── cors.ts           # CORS 처리
│       │   └── cache.ts          # 캐싱 미들웨어
│       ├── utils/
│       │   ├── db.ts             # WordPress DB 호환 레이어
│       │   ├── github.ts         # GitHub Storage API
│       │   ├── crypto.ts         # 비밀번호 해싱
│       │   ├── blocks.ts         # 구텐베르크 블록 파서/렌더러
│       │   ├── plugins.ts        # 플러그인 엔진
│       │   └── theme.ts          # 테마 엔진 (PHP 변환기)
│       ├── admin/
│       │   ├── admin-renderer.ts # WordPress 관리자 UI
│       │   ├── admin-css.ts      # 관리자 스타일
│       │   ├── admin-js.ts       # 관리자 JavaScript
│       │   ├── gutenberg.ts      # 구텐베르크 에디터
│       │   └── install-page.ts   # 설치 마법사
│       └── routes/
│           ├── install.ts        # 설치 라우트
│           ├── admin-api.ts      # 관리자 API
│           ├── wp-rest-api.ts    # WordPress REST API v2
│           ├── frontend.ts       # 공개 사이트
│           ├── media.ts          # 미디어 서빙
│           └── public-api.ts     # 내부 API
├── migrations/
│   └── 0001_initial_schema.sql  # D1 마이그레이션
├── bundled-plugins/
│   ├── manifest.json            # 번들 플러그인 목록
│   ├── aibp-pro-script.js       # AIBP Pro 프론트엔드
│   ├── aibp-pro-style.css       # AIBP Pro 스타일
│   └── alpack-tracking.js       # AL Pack 추적 스크립트
├── scripts/
│   └── setup.mjs                # 자동 설정 스크립트
├── wrangler.toml                # Cloudflare 설정
├── tsconfig.json                # TypeScript 설정
└── package.json
```

---

## ⚙️ 설정 파일 (wrangler.toml)

`scripts/setup.mjs` 실행 후 자동으로 채워집니다:

```toml
name = "cf-wordpress"
main = "worker/src/index.ts"
compatibility_date = "2024-09-23"

[[d1_databases]]
binding = "DB"
database_name = "cfwp-db"
database_id = "YOUR_D1_ID"   # 자동 입력

[[kv_namespaces]]
binding = "CACHE"
id = "YOUR_KV_ID"            # 자동 입력

[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_KV_ID"            # 자동 입력

[[kv_namespaces]]
binding = "OPTIONS"
id = "YOUR_KV_ID"            # 자동 입력
```

---

## 🔌 번들 플러그인

### WP Rocket
- Cloudflare KV 기반 페이지 캐시
- CSS/JS 최소화 및 압축
- 이미지 지연 로딩(Lazy Load)
- JS 지연 실행(Defer)

### AIBP Pro
- GPT-4o/Claude AI로 블로그 글 자동 작성
- AI 썸네일 이미지 생성 (`https://aibp100.jiji15899.workers.dev` 고정)
- SEO 메타 자동화 (제목, 설명, 슬러그, 포커스 키워드)
- 구텐베르크 메타박스 통합

### AL Pack (PressLearn)
- 실시간 방문자 통계 (Cloudflare D1 저장)
- 소셜 공유 버튼 (카카오/네이버/페이스북/X/라인)
- 무효 클릭 차단 (애드센스 보호)
- 스크롤 깊이 추적

### Bridge Migration
- WordPress XML/JSON 가져오기
- 모든 호스팅에서 마이그레이션 (클라우드웨이즈, 카페24, 가비아 등)
- 자동 백업 (Cloudflare KV 30일 보관)
- 게시글/페이지/설정/사용자 이전

---

## 🔗 WordPress 호환성

| 기능 | 지원 여부 |
|------|-----------|
| REST API v2 | ✅ 100% |
| 구텐베르크 에디터 | ✅ 35+ 블록 |
| 플러그인 설치 (WordPress.org) | ✅ |
| 플러그인 업로드 (zip) | ✅ |
| 테마 설치 (WordPress.org) | ✅ |
| 관리자 UI | ✅ 100% 동일 |
| wp-login.php | ✅ |
| admin-ajax.php | ✅ |
| wp-json/ | ✅ |
| 고유주소 구조 | ✅ |
| 카테고리/태그 | ✅ |
| 미디어 라이브러리 | ✅ |
| 댓글 | ✅ |
| 다중 사용자 | ✅ |
| RSS 피드 | ✅ |
| 사이트맵 XML | ✅ |
| WXR 내보내기 | ✅ |

---

## 🛠️ 커스텀 플러그인 개발

플러그인은 `PluginRuntime` 인터페이스를 구현하면 됩니다:

```typescript
import { PluginRuntime } from './worker/src/utils/plugins';

const myPlugin: PluginRuntime = {
  slug: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  hooks: {
    filters: {
      'the_content': [{
        tag: 'the_content',
        callback: async (content: string) => {
          return content + '<p>Custom footer</p>';
        },
        priority: 10, acceptedArgs: 1, type: 'filter'
      }]
    },
    actions: {}
  },
  menus: [{
    pageTitle: 'My Plugin Settings',
    menuTitle: 'My Plugin',
    capability: 'manage_options',
    menuSlug: 'my-plugin',
    callback: async () => '<div class="wrap"><h1>My Plugin</h1></div>',
    iconUrl: 'dashicons-admin-plugins',
    position: 80
  }],
  // ... 나머지 필드
};
```

---

## 📊 성능

| 지표 | CF-WordPress | 일반 WordPress (VPS) |
|------|-------------|---------------------|
| TTFB | ~20ms (Edge) | ~200-500ms |
| 글로벌 CDN | ✅ 기본 포함 | ❌ 별도 설정 필요 |
| 캐시 | KV (인메모리) | 파일 캐시 |
| 스케일링 | 무제한 (서버리스) | VPS 스펙 제한 |
| 비용 | 무료 (Workers 플랜) | 월 $5-20 |

---

## 📜 라이선스

MIT License

---

## 🤝 기여

이슈와 PR을 환영합니다!

---

**CF-WordPress** — WordPress의 완벽한 대체제, Cloudflare Edge에서 실행
