import { GithubConfig } from '../types/env';

export class GitHubStorage {
  private baseUrl = 'https://api.github.com';

  constructor(private config: GithubConfig) {}

  private headers(): HeadersInit {
    return {
      'Authorization': `token ${this.config.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'CF-WordPress/1.0'
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

  async writeFile(path: string, content: string, message?: string): Promise<boolean> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${path}`;
    
    // Get existing SHA if file exists
    let sha: string | undefined;
    const existing = await fetch(url + `?ref=${this.config.branch}`, { headers: this.headers() });
    if (existing.ok) {
      const data = await existing.json() as { sha: string };
      sha = data.sha;
    }

    const body: Record<string, string> = {
      message: message || `Update ${path}`,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: this.config.branch
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body)
    });
    return res.ok;
  }

  async writeFileBinary(path: string, data: ArrayBuffer, message?: string): Promise<boolean> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${path}`;
    
    let sha: string | undefined;
    const existing = await fetch(url + `?ref=${this.config.branch}`, { headers: this.headers() });
    if (existing.ok) {
      const existingData = await existing.json() as { sha: string };
      sha = existingData.sha;
    }

    const bytes = new Uint8Array(data);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    const base64 = btoa(binary);

    const body: Record<string, string> = {
      message: message || `Upload ${path}`,
      content: base64,
      branch: this.config.branch
    };
    if (sha) body.sha = sha;

    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body)
    });
    return res.ok;
  }

  async deleteFile(path: string, message?: string): Promise<boolean> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${path}`;
    const existing = await fetch(url + `?ref=${this.config.branch}`, { headers: this.headers() });
    if (!existing.ok) return true;
    const data = await existing.json() as { sha: string };

    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.headers(),
      body: JSON.stringify({
        message: message || `Delete ${path}`,
        sha: data.sha,
        branch: this.config.branch
      })
    });
    return res.ok;
  }

  async listDirectory(path: string): Promise<Array<{ name: string; path: string; type: string; size: number; sha: string }>> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}/contents/${path}?ref=${this.config.branch}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) return [];
    return await res.json() as Array<{ name: string; path: string; type: string; size: number; sha: string }>;
  }

  async createRepo(name: string, description = 'CF-WordPress Storage', isPrivate = true): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/user/repos`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name,
        description,
        private: isPrivate,
        auto_init: true,
        default_branch: 'main'
      })
    });
    if (!res.ok) return false;
    const data = await res.json() as { full_name: string; default_branch: string };
    this.config.repo = name;
    this.config.branch = data.default_branch || 'main';
    return true;
  }

  async getRepoInfo(): Promise<{ exists: boolean; owner: string; repo: string; branch: string } | null> {
    const url = `${this.baseUrl}/repos/${this.config.owner}/${this.config.repo}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) return null;
    const data = await res.json() as { full_name: string; default_branch: string };
    return {
      exists: true,
      owner: this.config.owner,
      repo: this.config.repo,
      branch: data.default_branch
    };
  }

  async getAuthenticatedUser(): Promise<{ login: string; email: string } | null> {
    const res = await fetch(`${this.baseUrl}/user`, { headers: this.headers() });
    if (!res.ok) return null;
    return await res.json() as { login: string; email: string };
  }

  // Upload media file to wp-content/uploads/YYYY/MM/filename
  async uploadMedia(filename: string, data: ArrayBuffer, mimeType: string): Promise<string | null> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const path = `wp-content/uploads/${year}/${month}/${filename}`;
    const ok = await this.writeFileBinary(path, data);
    if (!ok) return null;
    return path;
  }

  // Get raw CDN URL for a file
  getRawUrl(path: string): string {
    return `https://raw.githubusercontent.com/${this.config.owner}/${this.config.repo}/${this.config.branch}/${path}`;
  }

  // Write multiple files (plugin/theme install)
  async writeFiles(files: Record<string, string>, basePath: string, message: string): Promise<boolean> {
    // GitHub doesn't support batch writes via REST; do sequentially
    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = `${basePath}/${relPath}`;
      const ok = await this.writeFile(fullPath, content, message);
      if (!ok) return false;
    }
    return true;
  }
}

export async function getGithubConfig(db: D1Database, options: KVNamespace): Promise<GithubConfig | null> {
  const token = await options.get('opt:github_token');
  const owner = await options.get('opt:github_owner');
  const repo = await options.get('opt:github_repo');
  const branch = await options.get('opt:github_branch') || 'main';
  if (!token || !owner || !repo) return null;
  return { token, owner, repo, branch };
}

export async function createGithubStorage(db: D1Database, options: KVNamespace): Promise<GitHubStorage | null> {
  const config = await getGithubConfig(db, options);
  if (!config) return null;
  return new GitHubStorage(config);
}
