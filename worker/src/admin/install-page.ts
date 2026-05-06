export const INSTALL_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>CF-WordPress 설치</title>
<style>
*,*::before,*::after{box-sizing:border-box}
:root{
  --blue:#2271b1;--blue-dark:#135e96;--green:#00a32a;--red:#d63638;
  --border:#c3c4c7;--bg:#f0f0f1;--white:#fff;--text:#1d2327;--muted:#646970
}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  font-size:15px;line-height:1.6;color:var(--text);background:var(--bg)}
.setup-shell{min-height:100vh;display:flex;flex-direction:column}
.setup-header{background:var(--text);color:#fff;padding:1.25rem 2rem;display:flex;align-items:center;gap:1rem}
.setup-logo{font-size:1.5rem;font-weight:700;color:#fff;text-decoration:none}
.setup-logo span{color:#2271b1}
.setup-body{flex:1;display:flex;align-items:flex-start;justify-content:center;padding:3rem 1rem}
.setup-card{background:var(--white);border-radius:8px;box-shadow:0 2px 20px rgba(0,0,0,.08);
  width:100%;max-width:680px;overflow:hidden}
.setup-progress{display:flex;border-bottom:1px solid var(--border)}
.step-indicator{flex:1;padding:.85rem 1rem;text-align:center;font-size:.8rem;font-weight:600;
  color:var(--muted);background:var(--bg);cursor:pointer;transition:.2s;border-bottom:3px solid transparent}
.step-indicator.active{background:var(--white);color:var(--blue);border-bottom-color:var(--blue)}
.step-indicator.done{color:var(--green);background:var(--white);border-bottom-color:var(--green)}
.setup-content{padding:2.5rem}
.step-panel{display:none}.step-panel.active{display:block}
h1{margin:0 0 .5rem;font-size:1.6rem;color:var(--text)}
.subtitle{color:var(--muted);margin:0 0 2rem;font-size:.95rem}
.field-group{margin-bottom:1.25rem}
label{display:block;font-weight:600;margin-bottom:.4rem;font-size:.9rem;color:var(--text)}
.field-hint{display:block;font-size:.8rem;color:var(--muted);margin-top:.25rem}
input[type=text],input[type=email],input[type=password],input[type=url],select,textarea{
  display:block;width:100%;padding:.6rem .9rem;border:1px solid var(--border);border-radius:4px;
  font-size:.95rem;line-height:1.5;color:var(--text);background:#fff;transition:.15s}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 2px rgba(34,113,177,.2)}
input.error{border-color:var(--red)}
.input-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.7rem 1.5rem;border:none;border-radius:4px;
  font-size:.95rem;font-weight:600;cursor:pointer;transition:.15s;text-decoration:none}
.btn-primary{background:var(--blue);color:#fff}.btn-primary:hover{background:var(--blue-dark)}
.btn-secondary{background:transparent;color:var(--blue);border:1px solid var(--blue)}
.btn-secondary:hover{background:#f0f6fc}
.btn-success{background:var(--green);color:#fff}
.btn-lg{padding:.9rem 2rem;font-size:1rem}
.btn-block{width:100%;justify-content:center}
.btn:disabled{opacity:.6;cursor:not-allowed}
.form-actions{display:flex;gap:.75rem;justify-content:flex-end;margin-top:2rem;
  padding-top:1.5rem;border-top:1px solid var(--border)}
.notice{padding:.85rem 1.1rem;border-radius:4px;margin-bottom:1.25rem;font-size:.9rem;
  display:flex;align-items:flex-start;gap:.6rem}
.notice-info{background:#f0f6fc;border-left:4px solid var(--blue)}
.notice-success{background:#f0faf0;border-left:4px solid var(--green)}
.notice-error{background:#fcf0f1;border-left:4px solid var(--red)}
.notice-warn{background:#fffaeb;border-left:4px solid #dba617}
.plugin-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1rem}
.plugin-card{border:2px solid var(--border);border-radius:6px;padding:1rem;cursor:pointer;
  transition:.15s;position:relative;user-select:none}
.plugin-card:hover{border-color:var(--blue);background:#f8fbff}
.plugin-card.selected{border-color:var(--blue);background:#f0f6fc}
.plugin-card input[type=checkbox]{position:absolute;top:.75rem;right:.75rem}
.plugin-card-name{font-weight:700;font-size:.95rem;margin-bottom:.25rem}
.plugin-card-desc{font-size:.8rem;color:var(--muted);line-height:1.4}
.plugin-card-badge{display:inline-block;font-size:.7rem;font-weight:700;
  padding:.15rem .5rem;border-radius:3px;background:#e0f0ff;color:var(--blue);margin-bottom:.4rem}
.github-status{padding:.7rem 1rem;border-radius:4px;background:#f6f7f7;border:1px solid var(--border);
  font-size:.85rem;margin-top:.5rem;display:flex;align-items:center;gap:.5rem}
.github-status.ok{background:#f0faf0;border-color:#8dba8d;color:#006400}
.github-status.err{background:#fcf0f1;border-color:#f5a6a7;color:var(--red)}
.spinner{width:18px;height:18px;border:2px solid #c3c4c7;border-top-color:var(--blue);
  border-radius:50%;animation:spin .7s linear infinite;display:none}
.spinner.active{display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
.progress-bar{height:4px;background:#e0e0e0;border-radius:2px;overflow:hidden;margin:1rem 0}
.progress-bar-inner{height:100%;background:var(--blue);border-radius:2px;transition:width .3s;width:0}
.install-log{background:#1a1a2e;color:#a8c8ff;font-family:monospace;font-size:.8rem;
  border-radius:4px;padding:1rem;height:160px;overflow-y:auto;margin:1rem 0}
.install-log-line{padding:.1rem 0}
.install-log-line.ok::before{content:"✓ ";color:#4ade80}
.install-log-line.err::before{content:"✗ ";color:#f87171}
.install-log-line.info::before{content:"→ ";color:#60a5fa}
.pw-toggle{position:relative}.pw-toggle input{padding-right:2.5rem}
.pw-eye{position:absolute;right:.75rem;top:50%;transform:translateY(-50%);
  background:none;border:none;cursor:pointer;color:var(--muted);font-size:1rem;padding:0}
.strength-bar{height:3px;border-radius:2px;margin-top:.35rem;transition:all .3s}
.done-checkmark{width:72px;height:72px;background:var(--green);border-radius:50%;
  display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;font-size:2.5rem}
.setup-footer{padding:1.5rem;border-top:1px solid var(--border);
  display:flex;justify-content:space-between;align-items:center}
.step-count{font-size:.8rem;color:var(--muted)}
@media(max-width:600px){.input-row{grid-template-columns:1fr}.plugin-grid{grid-template-columns:1fr}
  .setup-content{padding:1.5rem}.form-actions{flex-direction:column-reverse}}
</style>
</head>
<body>
<div class="setup-shell">
<header class="setup-header">
  <a class="setup-logo" href="/">CF-<span>WP</span></a>
  <span style="color:#aaa;font-size:.85rem">WordPress 완벽 호환 CMS on Cloudflare Workers</span>
</header>
<div class="setup-body">
<div class="setup-card">
  <div class="setup-progress">
    <div class="step-indicator active" data-step="1">① 시작</div>
    <div class="step-indicator" data-step="2">② GitHub</div>
    <div class="step-indicator" data-step="3">③ 사이트 설정</div>
    <div class="step-indicator" data-step="4">④ 플러그인</div>
    <div class="step-indicator" data-step="5">⑤ 설치 완료</div>
  </div>

  <!-- Step 1: Welcome -->
  <div class="step-panel active" id="step-1">
    <div class="setup-content">
      <h1>CF-WordPress에 오신 것을 환영합니다</h1>
      <p class="subtitle">Cloudflare Workers 위에서 동작하는 WordPress 완벽 호환 CMS입니다.<br/>
      이제 몇 가지 정보를 입력하여 사이트를 설정합니다.</p>
      <div class="notice notice-info">
        ℹ️ <div><strong>설치 전 준비사항</strong><br/>
        Cloudflare D1 데이터베이스, KV 네임스페이스가 wrangler.toml에 올바르게 바인딩되어 있는지 확인하세요.<br/>
        GitHub Personal Access Token (repo 권한)이 있으면 파일 스토리지를 사용할 수 있습니다.</div>
      </div>
      <div class="notice notice-warn">
        ⚠️ <div>이미 설치된 경우 이 페이지에 접근할 수 없습니다. 재설치하려면 D1과 KV를 초기화하세요.</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin:1.5rem 0">
        <div style="text-align:center;padding:1rem;border:1px solid var(--border);border-radius:6px">
          <div style="font-size:1.8rem">⚡</div>
          <div style="font-weight:700;margin:.25rem 0">초고속</div>
          <div style="font-size:.8rem;color:var(--muted)">Cloudflare Edge에서 실행</div>
        </div>
        <div style="text-align:center;padding:1rem;border:1px solid var(--border);border-radius:6px">
          <div style="font-size:1.8rem">🔌</div>
          <div style="font-weight:700;margin:.25rem 0">플러그인 호환</div>
          <div style="font-size:.8rem;color:var(--muted)">WordPress 플러그인 지원</div>
        </div>
        <div style="text-align:center;padding:1rem;border:1px solid var(--border);border-radius:6px">
          <div style="font-size:1.8rem">🐙</div>
          <div style="font-weight:700;margin:.25rem 0">GitHub 스토리지</div>
          <div style="font-size:.8rem;color:var(--muted)">파일을 GitHub에 저장</div>
        </div>
      </div>
    </div>
    <div class="setup-footer">
      <span class="step-count">단계 1 / 5</span>
      <button class="btn btn-primary btn-lg" onclick="goStep(2)">시작하기 →</button>
    </div>
  </div>

  <!-- Step 2: GitHub -->
  <div class="step-panel" id="step-2">
    <div class="setup-content">
      <h1>GitHub 스토리지 연결</h1>
      <p class="subtitle">미디어 파일, 테마, 플러그인을 GitHub 레포지토리에 저장합니다.<br/>
      건너뛰면 Cloudflare KV만 사용합니다 (미디어 제한 있음).</p>
      <div class="field-group">
        <label for="github-token">GitHub Personal Access Token <span style="color:var(--muted)">(선택)</span></label>
        <div class="pw-toggle">
          <input type="password" id="github-token" name="github_token" placeholder="ghp_xxxxxxxxxxxx"/>
          <button class="pw-eye" type="button" onclick="togglePw('github-token')">👁</button>
        </div>
        <span class="field-hint">Settings → Developer settings → Personal access tokens → repo 권한 필요</span>
      </div>
      <div class="field-group">
        <label for="github-repo">레포지토리 이름</label>
        <input type="text" id="github-repo" name="github_repo" value="cfwp-storage" placeholder="cfwp-storage"/>
        <span class="field-hint">새 레포가 자동으로 생성됩니다 (private)</span>
      </div>
      <div id="github-status" style="display:none"></div>
      <button class="btn btn-secondary" type="button" onclick="validateGithub()" id="github-validate-btn">
        <span class="spinner" id="github-spinner"></span>
        연결 확인
      </button>
    </div>
    <div class="setup-footer">
      <span class="step-count">단계 2 / 5</span>
      <div style="display:flex;gap:.75rem">
        <button class="btn btn-secondary" onclick="goStep(1)">← 이전</button>
        <button class="btn btn-primary" onclick="goStep(3)" id="step2-next">다음 →</button>
      </div>
    </div>
  </div>

  <!-- Step 3: Site Settings -->
  <div class="step-panel" id="step-3">
    <div class="setup-content">
      <h1>사이트 설정</h1>
      <p class="subtitle">관리자 계정과 사이트 기본 정보를 입력하세요.</p>
      <div class="field-group">
        <label for="site-title">사이트 이름 *</label>
        <input type="text" id="site-title" name="site_title" placeholder="나의 멋진 블로그" required/>
      </div>
      <div class="field-group">
        <label for="site-url">사이트 URL</label>
        <input type="url" id="site-url" name="site_url" placeholder="https://yourdomain.workers.dev"/>
        <span class="field-hint">비워두면 현재 URL이 자동으로 사용됩니다</span>
      </div>
      <hr style="border:none;border-top:1px solid var(--border);margin:1.5rem 0"/>
      <h3 style="margin:0 0 1rem;font-size:1rem">관리자 계정</h3>
      <div class="input-row">
        <div class="field-group">
          <label for="admin-user">사용자명 *</label>
          <input type="text" id="admin-user" name="admin_user" placeholder="admin" required
            oninput="this.value=this.value.replace(/[^a-zA-Z0-9_-]/g,'')"/>
        </div>
        <div class="field-group">
          <label for="admin-email">이메일 *</label>
          <input type="email" id="admin-email" name="admin_email" placeholder="admin@example.com" required/>
        </div>
      </div>
      <div class="field-group">
        <label for="admin-password">비밀번호 *</label>
        <div class="pw-toggle">
          <input type="password" id="admin-password" name="admin_password" placeholder="강력한 비밀번호 입력"
            oninput="checkStrength(this.value)" required/>
          <button class="pw-eye" type="button" onclick="togglePw('admin-password')">👁</button>
        </div>
        <div class="strength-bar" id="strength-bar" style="width:0;background:#ccc"></div>
        <span class="field-hint" id="strength-label">비밀번호를 입력하세요</span>
      </div>
      <div class="field-group">
        <label for="admin-password2">비밀번호 확인 *</label>
        <input type="password" id="admin-password2" placeholder="비밀번호 다시 입력" required/>
      </div>
    </div>
    <div class="setup-footer">
      <span class="step-count">단계 3 / 5</span>
      <div style="display:flex;gap:.75rem">
        <button class="btn btn-secondary" onclick="goStep(2)">← 이전</button>
        <button class="btn btn-primary" onclick="validateStep3()">다음 →</button>
      </div>
    </div>
  </div>

  <!-- Step 4: Plugins -->
  <div class="step-panel" id="step-4">
    <div class="setup-content">
      <h1>기본 플러그인 선택</h1>
      <p class="subtitle">설치와 함께 활성화할 플러그인을 선택하세요. 나중에 언제든지 변경 가능합니다.</p>
      <div class="plugin-grid">
        <label class="plugin-card" for="plugin-wprocket">
          <input type="checkbox" id="plugin-wprocket" value="wp-rocket" onchange="toggleCard(this)"/>
          <div class="plugin-card-badge">성능</div>
          <div class="plugin-card-name">🚀 WP Rocket</div>
          <div class="plugin-card-desc">페이지 캐싱, CSS/JS 최적화, 이미지 지연 로딩으로 사이트를 초고속으로 만듭니다.</div>
        </label>
        <label class="plugin-card" for="plugin-aibp">
          <input type="checkbox" id="plugin-aibp" value="aibp-pro" onchange="toggleCard(this)"/>
          <div class="plugin-card-badge">AI</div>
          <div class="plugin-card-name">🤖 AIBP Pro</div>
          <div class="plugin-card-desc">AI로 SEO 최적화된 블로그 글을 자동 작성합니다. AI 썸네일 생성 포함.</div>
        </label>
        <label class="plugin-card" for="plugin-alpack">
          <input type="checkbox" id="plugin-alpack" value="alpack" onchange="toggleCard(this)"/>
          <div class="plugin-card-badge">통계</div>
          <div class="plugin-card-name">📊 AL Pack</div>
          <div class="plugin-card-desc">방문자 통계, 소셜 공유, 무효 트래픽 차단, 스크롤 추적 등 통합 플러그인.</div>
        </label>
        <label class="plugin-card" for="plugin-bridge">
          <input type="checkbox" id="plugin-bridge" value="bridge-migration" onchange="toggleCard(this)"/>
          <div class="plugin-card-badge">마이그레이션</div>
          <div class="plugin-card-name">🌉 Bridge Migration</div>
          <div class="plugin-card-desc">기존 WordPress 사이트에서 모든 데이터를 완벽하게 이전합니다.</div>
        </label>
      </div>
      <div class="notice notice-info" style="margin-top:1rem">
        ℹ️ 플러그인은 설치 후 WordPress 관리자 → 플러그인 메뉴에서 추가/제거할 수 있습니다.
      </div>
    </div>
    <div class="setup-footer">
      <span class="step-count">단계 4 / 5</span>
      <div style="display:flex;gap:.75rem">
        <button class="btn btn-secondary" onclick="goStep(3)">← 이전</button>
        <button class="btn btn-primary btn-lg" onclick="startInstall()" id="install-btn">
          <span class="spinner" id="install-spinner"></span>
          ✨ 설치 시작
        </button>
      </div>
    </div>
  </div>

  <!-- Step 5: Done -->
  <div class="step-panel" id="step-5">
    <div class="setup-content" style="text-align:center;padding:3rem 2.5rem">
      <div class="done-checkmark">✓</div>
      <h1>설치가 완료되었습니다!</h1>
      <p style="color:var(--muted);margin-bottom:2rem">CF-WordPress가 성공적으로 설치되었습니다.<br/>
      이제 WordPress 관리자 패널에 로그인하세요.</p>
      <div id="install-details" style="background:#f6f7f7;border-radius:6px;padding:1.25rem;text-align:left;margin-bottom:2rem;font-size:.9rem"></div>
      <a href="/wp-admin/" class="btn btn-success btn-lg">
        관리자 패널로 이동 →
      </a>
    </div>
  </div>

</div><!-- /.setup-card -->
</div>
</div>

<script>
const state = {
  step: 1,
  github: { validated: false, login: '', token: '' },
  site: {},
  plugins: []
};

function goStep(n) {
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.step-indicator').forEach((s,i) => {
    s.classList.remove('active','done');
    if(i+1 < n) s.classList.add('done');
    if(i+1 === n) s.classList.add('active');
  });
  document.getElementById('step-'+n).classList.add('active');
  state.step = n;
}

function togglePw(id) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

function toggleCard(cb) {
  cb.closest('.plugin-card').classList.toggle('selected', cb.checked);
  if(cb.checked && !state.plugins.includes(cb.value)) state.plugins.push(cb.value);
  else state.plugins = state.plugins.filter(p => p !== cb.value);
}

function checkStrength(pw) {
  const bar = document.getElementById('strength-bar');
  const label = document.getElementById('strength-label');
  let score = 0;
  if(pw.length >= 8) score++;
  if(pw.length >= 12) score++;
  if(/[A-Z]/.test(pw)) score++;
  if(/[0-9]/.test(pw)) score++;
  if(/[^A-Za-z0-9]/.test(pw)) score++;
  const colors = ['#ccc','#f87171','#fb923c','#facc15','#4ade80','#22c55e'];
  const labels = ['','매우 약함','약함','보통','강함','매우 강함'];
  bar.style.width = (score*20)+'%';
  bar.style.background = colors[score];
  label.textContent = labels[score] || '비밀번호를 입력하세요';
}

async function validateGithub() {
  const token = document.getElementById('github-token').value.trim();
  const repo = document.getElementById('github-repo').value.trim();
  if(!token) { showGithubStatus('토큰을 입력하세요','err'); return; }
  
  const spinner = document.getElementById('github-spinner');
  const btn = document.getElementById('github-validate-btn');
  spinner.classList.add('active'); btn.disabled = true;
  
  try {
    const res = await fetch('/wp-setup/init', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ step:'validate-github', github_token:token, github_repo:repo })
    });
    const data = await res.json();
    if(data.success) {
      state.github = { validated:true, login:data.data.login, token, repo };
      showGithubStatus('✓ '+data.data.login+' 계정으로 연결됨','ok');
    } else {
      showGithubStatus('연결 실패: '+data.error,'err');
    }
  } catch(e) {
    showGithubStatus('연결 오류: '+e.message,'err');
  } finally {
    spinner.classList.remove('active'); btn.disabled = false;
  }
}

function showGithubStatus(msg, type) {
  const el = document.getElementById('github-status');
  el.style.display = 'block';
  el.className = 'github-status '+(type==='ok'?'ok':'err');
  el.textContent = msg;
}

function validateStep3() {
  const title = document.getElementById('site-title').value.trim();
  const user = document.getElementById('admin-user').value.trim();
  const email = document.getElementById('admin-email').value.trim();
  const pw = document.getElementById('admin-password').value;
  const pw2 = document.getElementById('admin-password2').value;
  
  if(!title || !user || !email || !pw) { alert('필수 항목을 모두 입력하세요.'); return; }
  if(pw !== pw2) { alert('비밀번호가 일치하지 않습니다.'); return; }
  if(pw.length < 6) { alert('비밀번호는 6자 이상이어야 합니다.'); return; }
  
  state.site = { title, user, email, pw };
  goStep(4);
}

async function startInstall() {
  const btn = document.getElementById('install-btn');
  const spinner = document.getElementById('install-spinner');
  btn.disabled = true; spinner.classList.add('active');
  
  const payload = {
    step: 'init',
    site_title: state.site.title,
    admin_user: state.site.user,
    admin_email: state.site.email,
    admin_password: state.site.pw,
    site_url: document.getElementById('site-url').value.trim(),
    github_token: document.getElementById('github-token').value.trim(),
    github_repo: document.getElementById('github-repo').value.trim(),
    plugins: state.plugins.join(',')
  };
  
  try {
    const res = await fetch('/wp-setup/init', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if(data.success) {
      document.getElementById('install-details').innerHTML =
        '<strong>사이트:</strong> '+state.site.title+'<br/>'+
        '<strong>관리자:</strong> '+state.site.user+'<br/>'+
        '<strong>URL:</strong> '+(data.data.site_url || location.origin)+'/wp-admin/';
      goStep(5);
    } else {
      alert('설치 실패: '+(data.error||JSON.stringify(data)));
      btn.disabled = false; spinner.classList.remove('active');
    }
  } catch(e) {
    alert('오류: '+e.message);
    btn.disabled = false; spinner.classList.remove('active');
  }
}
</script>
</body>
</html>`;
