// 根据https://www.bilibili.com/video/BV1jGd6YpE8z
// '/', '/login', '/signup', '/copilot'被禁用，防止Cloudflare认为是钓鱼网站而被封

// 配置说明：
// 1. 将此Worker部署到 Cloudflare Workers
// 2. 绑定到自定义域名，例如: your-domain.com
// 3. 使用路径模式访问: https://your-domain.com/gh/sunshuofirst/mygithub

// 简化的域名映射配置 - 使用路径而不是子域名
const domain_mappings = {
  'github.com': 'gh',
  'avatars.githubusercontent.com': 'avatars-githubusercontent-com',
  'github.githubassets.com': 'github-githubassets-com',
  'collector.github.com': 'collector-github-com',
  'api.github.com': 'api-github-com',
  'raw.githubusercontent.com': 'raw-githubusercontent-com',
  'gist.githubusercontent.com': 'gist-githubusercontent-com',
  'github.io': 'github-io',
  'assets-cdn.github.com': 'assets-cdn-github-com',
  'cdn.jsdelivr.net': 'cdn-jsdelivr-net',
  'securitylab.github.com': 'securitylab-github-com',
  'www.githubstatus.com': 'www-githubstatus-com',
  'npmjs.com': 'npmjs-com',
  'git-lfs.github.com': 'git-lfs-github-com',
  'githubusercontent.com': 'githubusercontent-com',
  'github.global.ssl.fastly.net': 'github-global-ssl-fastly-net',
  'api.npms.io': 'api-npms-io',
  'github.community': 'github-community',
  // 添加更多GitHub相关域名以确保资源加载
  'camo.githubusercontent.com': 'camo-githubusercontent-com',
  'user-images.githubusercontent.com': 'user-images-githubusercontent-com',
  'opengraph.githubassets.com': 'opengraph-githubassets-com',
  'favicons.githubusercontent.com': 'favicons-githubusercontent-com',
  'objects.githubusercontent.com': 'objects-githubusercontent-com',
  'github-production-release-asset-2e65be.s3.amazonaws.com': 'github-production-release-asset-2e65be-s3-amazonaws-com',
  'github-production-user-asset-6210df.s3.amazonaws.com': 'github-production-user-asset-6210df-s3-amazonaws-com',
  'github-production-repository-file-5c1aeb.s3.amazonaws.com': 'github-production-repository-file-5c1aeb-s3-amazonaws-com'
};

// 需要重定向的路径
const redirect_paths = ['/', '/login', '/signup', '/copilot'];

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  // 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Authorization, X-Requested-With',
        'access-control-max-age': '86400'
      }
    });
  }
  
  // 检查特殊路径重定向
  if (redirect_paths.includes(url.pathname)) {
    return Response.redirect('https://www.gov.cn', 302);
  }

  // 强制使用 HTTPS
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url.href);
  }

  // 从路径中提取代理目标和实际路径
  const pathParts = url.pathname.split('/').filter(part => part);
  if (pathParts.length === 0) {
    return new Response(`
      <html>
        <head><title>GitHub Proxy</title></head>
        <body>
          <h1>GitHub Proxy Service</h1>
          <p>Usage: https://your-domain.com/gh/user/repo</p>
          <p>Example: https://your-domain.com/gh/sunshuofirst/mygithub</p>
        </body>
      </html>
    `, {
      headers: { 'content-type': 'text/html' }
    });
  }

  const proxyPrefix = pathParts[0];
  
  // 根据前缀找到对应的原始域名
  let target_host = null;
  for (const [original, prefix] of Object.entries(domain_mappings)) {
    if (prefix === proxyPrefix) {
      target_host = original;
      break;
    }
  }

  if (!target_host) {
    return new Response(`Unsupported proxy prefix: ${proxyPrefix}. Available: ${Object.values(domain_mappings).join(', ')}`, { status: 404 });
  }

  // 构建目标URL - 移除代理前缀
  const targetPath = '/' + pathParts.slice(1).join('/');
  const new_url = new URL(`https://${target_host}${targetPath}${url.search}`);

  // 设置新的请求头
  const new_headers = new Headers(request.headers);
  new_headers.set('Host', target_host);
  new_headers.set('Referer', new_url.href);
  new_headers.set('Origin', `https://${target_host}`);
  new_headers.set('User-Agent', request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  // 删除可能导致问题的请求头
  new_headers.delete('cf-connecting-ip');
  new_headers.delete('cf-ipcountry');
  new_headers.delete('cf-ray');
  new_headers.delete('cf-visitor');
  
  try {
    // 発起請求，增加超時処理
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超時
    
    const response = await fetch(new_url.href, {
      method: request.method,
      headers: new_headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    // 克隆響応以便処理内容
    const response_clone = response.clone();
    
    // 設置新的響応頭
    const new_response_headers = new Headers(response.headers);
    new_response_headers.set('access-control-allow-origin', '*');
    new_response_headers.set('access-control-allow-credentials', 'true');
    new_response_headers.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
    new_response_headers.set('access-control-allow-headers', 'Content-Type, Authorization, X-Requested-With');
    new_response_headers.set('cache-control', 'public, max-age=14400');
    // 删除可能阻止資源加載的安全策略頭
    new_response_headers.delete('content-security-policy');
    new_response_headers.delete('content-security-policy-report-only');
    new_response_headers.delete('clear-site-data');
    new_response_headers.delete('x-frame-options');
    new_response_headers.delete('x-content-type-options');
    
    // 処理響応内容，替換域名引用
    const modified_body = await modifyResponse(response_clone, proxyPrefix, url.hostname);

    return new Response(modified_body, {
      status: response.status,
      headers: new_response_headers
    });
  } catch (err) {
    // 改進錯誤処理
    console.error('Proxy Error:', err.message, 'URL:', new_url.href);
    
    if (err.name === 'AbortError') {
      return new Response('Request timeout', { status: 504 });
    }
    
    return new Response(`Proxy Error: ${err.message}`, { 
      status: 502,
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'text/plain'
      }
    });
  }
}

// 旧的getProxyPrefix函数已删除，因为我们现在使用路径而不是子域名

async function modifyResponse(response, proxyPrefix, current_hostname) {
  // 处理更多类型的内容，包括CSS和其他资源
  const content_type = response.headers.get('content-type') || '';
  const should_modify = content_type.includes('text/') || 
                       content_type.includes('application/json') || 
                       content_type.includes('application/javascript') || 
                       content_type.includes('application/xml') ||
                       content_type.includes('text/css') ||
                       content_type.includes('text/html') ||
                       content_type.includes('application/x-javascript');
  
  if (!should_modify) {
    return response.body;
  }

  let text = await response.text();
  
  // 替换所有域名引用为代理路径
  for (const [original_domain, proxy_path] of Object.entries(domain_mappings)) {
    const escaped_domain = original_domain.replace(/\./g, '\\.');
    const proxy_url = `https://${current_hostname}/${proxy_path}`;
    
    // 替换完整URLs
    text = text.replace(
      new RegExp(`https?://${escaped_domain}(?=/|\\?|#|"|'|\\s|$)`, 'g'),
      proxy_url
    );
    
    // 替换协议相对URLs
    text = text.replace(
      new RegExp(`//${escaped_domain}(?=/|\\?|#|"|'|\\s|$)`, 'g'),
      `//${current_hostname}/${proxy_path}`
    );
    
    // 替换在CSS和JavaScript中的域名引用
    text = text.replace(
      new RegExp(`"${escaped_domain}"`, 'g'),
      `"${current_hostname}/${proxy_path}"`
    );
    text = text.replace(
      new RegExp(`'${escaped_domain}'`, 'g'),
      `'${current_hostname}/${proxy_path}'`
    );
  }

  // 处理相对路径，添加代理前缀
  if (proxyPrefix === 'gh') {
    // 更精确的相对路径替换，避免误替换
    text = text.replace(
      /(?<=["'\s=])\/(?!\/|[a-zA-Z]+:|data:|javascript:|mailto:|tel:|#|\?)/g,
      `https://${current_hostname}/${proxyPrefix}/`
    );
  }

  return text;
}
