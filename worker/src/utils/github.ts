/**
 * CloudPress CMS — GitHub Storage Utility
 * GitHub REST API v3 기반 파일 읽기/쓰기
 * D1, KV 의존 완전 제거
 */

import { GithubConfig, Env } from '../types/env';

export class GitHubStorage {
  private baseUrl = 'https://api.github.com';

  constructor(private config: GithubConfig) {}

  private headers(): HeadersInit {
    return {
      'Authorization': `token ${this.config.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'CloudPress-CMS/2.0',
    };
  }

  async readFile(path: string): Promise<string | null> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) return null;
    const data = await res.json() as { content: string; encoding: string };
    if (data.encoding === 'base64') {
      return atob(data.content.replace(/\n/g, ''));
    }
    return data.content;
  }

  async readFileRaw(path: string): Promise<ArrayBuffer | null> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch}`;
    const res = await fetch(url, {
      headers: { ...this.headers(), 'Accept': 'application/vnd.github.v3.raw' }
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  }

  private async getFileSha(path: string): Promise<string | undefined> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) return undefined;
    const data = await res.json() as { sha: string };
    return data.sha;
  }

  async writeFile(path: string, content: string, message?: string): Promise<boolean> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${path}`;
    const sha = await this.getFileSha(path);

    const body: Record<string, string> = {
      message: message || `Update ${path}`,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: this.config.branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  async writeFileBinary(path: string, data: ArrayBuffer, message?: string): Promise<boolean> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${path}`;
    const sha = await this.getFileSha(path);

    const bytes = new Uint8Array(data);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    const base64 = btoa(binary);

    const body: Record<string, string> = {
      message: message || `Upload ${path}`,
      content: base64,
      branch: this.config.branch,
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  async deleteFile(path: string, message?: string): Promise<boolean> {
    const sha = await this.getFileSha(path);
    if (!sha) return true; // 이미 없음

    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${path}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.headers(),
      body: JSON.stringify({
        message: message || `Delete ${path}`,
        sha,
        branch: this.config.branch,
      }),
    });
    return res.ok;
  }

  async listDirectory(path: string): Promise<Array<{
    name: string; path: string; type: string; size: number; sha: string;
  }>> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async createRepo(name: string, description = 'CloudPress Site', isPrivate = false): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/user/repos`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name,
        description,
        private: isPrivate,
        auto_init: true,
        default_branch: 'main',
      }),
    });
    if (!res.ok) return false;
    const data = await res.json() as { full_name: string; default_branch: string };
    this.config.repo = name;
    this.config.branch = data.default_branch || 'main';
    return true;
  }

  async enableGitHubPages(branch = 'gh-pages'): Promise<boolean> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/pages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ source: { branch, path: '/' } }),
    });
    return res.ok || res.status === 409; // 409 = already enabled
  }

  async getRepoInfo(): Promise<{
    exists: boolean; owner: string; repo: string; branch: string;
    pages_url?: string;
  } | null> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) return null;
    const data = await res.json() as {
      full_name: string; default_branch: string;
      has_pages: boolean; homepage?: string;
    };
    return {
      exists: true,
      owner: this.config.owner,
      repo: this.config.repo,
      branch: data.default_branch,
      pages_url: data.has_pages
        ? `https://${this.config.owner}.github.io/${this.config.repo}`
        : undefined,
    };
  }

  async getAuthenticatedUser(): Promise<{ login: string; email: string } | null> {
    const res = await fetch(`${this.baseUrl}/user`, { headers: this.headers() });
    if (!res.ok) return null;
    return await res.json() as { login: string; email: string };
  }

  /** 미디어 파일 업로드: _media/YYYY/MM/filename */
  async uploadMedia(filename: string, data: ArrayBuffer, _mimeType: string): Promise<string | null> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const path = `_media/${year}/${month}/${filename}`;
    const ok = await this.writeFileBinary(path, data);
    if (!ok) return null;
    return path;
  }

  /** raw.githubusercontent.com CDN URL */
  getRawUrl(path: string): string {
    return `https://raw.githubusercontent.com/${this.config.owner}/${this.config.repo}/${this.config.branch}/${path}`;
  }

  /** 플러그인/테마 파일 일괄 업로드 */
  async writeFiles(files: Record<string, string>, basePath: string, message: string): Promise<boolean> {
    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = `${basePath}/${relPath}`;
      const ok = await this.writeFile(fullPath, content, message);
      if (!ok) return false;
    }
    return true;
  }
}

/**
 * 요청 컨텍스트에서 GitHub 설정을 가져오는 함수
 * 헤더(X-GitHub-Token 등) 또는 Env vars에서 읽음
 */
export function getGithubConfigFromRequest(
  request: Request, env: Env
): GithubConfig | null {
  // 1) 요청 헤더에서 per-site 설정
  const token = request.headers.get('X-GitHub-Token') || env._SITE_GITHUB_TOKEN || env.GITHUB_TOKEN;
  const owner = request.headers.get('X-GitHub-Owner') || env._SITE_GITHUB_OWNER || env.GITHUB_OWNER;
  const repo  = request.headers.get('X-GitHub-Repo')  || env._SITE_GITHUB_REPO  || '';
  const branch = request.headers.get('X-GitHub-Branch') || env._SITE_GITHUB_BRANCH || 'main';

  if (!token || !owner || !repo) return null;
  return { token, owner, repo, branch };
}

export function getGithubConfigFromEnv(env: Env): GithubConfig | null {
  const token  = env._SITE_GITHUB_TOKEN || env.GITHUB_TOKEN;
  const owner  = env._SITE_GITHUB_OWNER || env.GITHUB_OWNER;
  const repo   = env._SITE_GITHUB_REPO  || '';
  const branch = env._SITE_GITHUB_BRANCH || 'main';
  if (!token || !owner || !repo) return null;
  return { token, owner, repo, branch };
}

export function createGithubStorage(config: GithubConfig): GitHubStorage {
  return new GitHubStorage(config);
}
