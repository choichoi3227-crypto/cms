#!/usr/bin/env node
// scripts/init-admin.mjs
// 최초 배포 후 관리자 계정 비밀번호를 올바르게 설정합니다.
//
// 사용법:
//   WP_ADMIN_PASS=yourpassword node scripts/init-admin.mjs
//   또는
//   node scripts/init-admin.mjs --pass yourpassword

import { createHash } from 'crypto';

const pass = process.env.WP_ADMIN_PASS
  || process.argv[process.argv.indexOf('--pass') + 1]
  || 'admin1234!';

const email = process.env.WP_ADMIN_EMAIL || 'admin@example.com';
const user  = process.env.WP_ADMIN_USER  || 'admin';

// SHA-256 해시 (CMS가 인식하는 형식)
const hash = createHash('sha256').update(pass).digest('hex');

console.log('\n📋 아래 SQL을 D1에 실행하세요:\n');
console.log('-- wrangler d1 execute cloudpress-cms-db --remote --command="..."');
console.log('');
console.log(`UPDATE wp_users`);
console.log(`SET user_login = '${user}',`);
console.log(`    user_pass  = '${hash}',`);
console.log(`    user_email = '${email}',`);
console.log(`    display_name = '관리자'`);
console.log(`WHERE ID = 1;`);
console.log('');
console.log('또는 wrangler CLI로 직접 실행:');
console.log('');
console.log(`wrangler d1 execute cloudpress-cms-db --remote --command="UPDATE wp_users SET user_login='${user}', user_pass='${hash}', user_email='${email}', display_name='관리자' WHERE ID=1"`);
console.log('');
console.log(`✅ 로그인 정보:`);
console.log(`   사용자: ${user}`);
console.log(`   비밀번호: ${pass}`);
console.log(`   URL: https://cloudpress-cms.pages.dev/login\n`);
