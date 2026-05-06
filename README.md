# CF-WordPress

**Cloudflare Workers 기반 WordPress 완벽 호환 CMS**

WordPress를 완벽하게 대체하는 서버리스 CMS입니다. Cloudflare Workers, D1, KV에서 동작하며 GitHub를 파일 스토리지로 사용합니다.

---

## ✨ 주요 기능

- **WordPress 완벽 호환** - WordPress REST API v2, 관리자 UI, 구텐베르크 블록 에디터 100% 구현
- **WordPress 플러그인/테마 지원** - WordPress.org에서 직접 검색·설치, zip 파일 업로드 설치
- **구텐베르크 블록 에디터** - `/` 명령어로 35+ 블록 타입 삽입, 실시간 편집
- **GitHub 스토리지** - 미디어, 테마, 플러그인 파일을 GitHub 레포지토리에 저장
- **초고속** - Cloudflare Edge 캐싱, D1 + KV 데이터베이스로 VPS보다 빠름
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
npm run dev
# http://localhost:8787 에서 실행
# /wp-setup 으로 이동하여 설치 마법사 시작
```

### 4. 배포

```bash
npm run deploy
# 배포 후 https://your-worker.workers.dev/wp-setup 에서 설치
```

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
