// 根据https://www.bilibili.com/video/BV1jGd6YpE8z
// '/', '/login', '/signup', '/copilot'被禁用，防止Cloudflare认为是钓鱼网站而被封
// 域名映射配置
const domain_mappings = {
  'github.com': 'gh.',
  'avatars.githubusercontent.com': 'avatars-githubusercontent-com.',
  'github.githubassets.com': 'github-githubassets-com.',
  'collector.github.com': 'collector-github-com.',
  'api.github.com': 'api-github-com.',
  'raw.githubusercontent.com': 'raw-githubusercontent-com.',
  'gist.githubusercontent.com': 'gist-githubusercontent-com.',
  'github.io': 'github-io.',
  'assets-cdn.github.com': 'assets-cdn-github-com.',
  'cdn.jsdelivr.net': 'cdn.jsdelivr-net.',
  'securitylab.github.com': 'securitylab-github-com.',
  'www.githubstatus.com': 'www-githubstatus-com.',
  'npmjs.com': 'npmjs-com.',
  'git-lfs.github.com': 'git-lfs-github-com.',
  'githubusercontent.com': 'githubusercontent-com.',
  'github.global.ssl.fastly.net': 'github-global-ssl-fastly-net.',
  'api.npms.io': 'api-npms-io.',
  'github.community': 'github-community.'
};

// 需要重定向的路径
const redirect_paths = ['/', '/login', '/signup', '/copilot'];

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const current_host = url.host;
  
  // 检查特殊路径重定向
  if (redirect_paths.includes(url.pathname)) {
    return Response.redirect('https://www.gov.cn', 302);
  }

  // 强制使用 HTTPS
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url.href);
  }

  // 从当前主机名中提取前缀
  const host_prefix = getProxyPrefix(current_host);
  if (!host_prefix) {
    return new Response('Domain not configured for proxy', { status: 404 });
  }

  // 根据前缀找到对应的原始域名
  let target_host = null;
  for (const [original, prefix] of Object.entries(domain_mappings)) {
    if (prefix === host_prefix) {
      target_host = original;
      break;
    }
  }

  if (!target_host) {
    return new Response('Domain not configured for proxy', { status: 404 });
  }

  // 构建新的请求URL
  const new_url = new URL(url);
  new_url.host = target_host;
  new_url.protocol = 'https:';

  // 设置新的请求头
  const new_headers = new Headers(request.headers);
  new_headers.set('Host', target_host);
  new_headers.set('Referer', new_url.href);
  
  try {
    // 修复URL路径中的嵌套URL问题
    if (url.pathname.includes('https%3A//') || url.pathname.includes('https://')) {
      const path_parts = url.pathname.split('/');
      for (let i = 0; i < path_parts.length; i++) {
        if (path_parts[i].includes('https%3A//') || path_parts[i].includes('https://')) {
          // 去除嵌套URL中的代理域名前缀
          for (const [original, prefix] of Object.entries(domain_mappings)) {
            const encoded_proxy = encodeURIComponent(`https://${prefix}`);
            const regular_proxy = `https://${prefix}`;
            
            // 处理URL编码和非编码的情况
            path_parts[i] = path_parts[i].replace(encoded_proxy, encodeURIComponent(`https://`));
            path_parts[i] = path_parts[i].replace(regular_proxy, 'https://');
          }
        }
      }
      new_url.pathname = path_parts.join('/');
    }

    // 发起请求
    const response = await fetch(new_url.href, {
      method: request.method,
      headers: new_headers,
      body: request.method !== 'GET' ? request.body : undefined
    });

    // 克隆响应以便处理内容
    const response_clone = response.clone();
    
    // 设置新的响应头
    const new_response_headers = new Headers(response.headers);
    new_response_headers.set('access-control-allow-origin', '*');
    new_response_headers.set('access-control-allow-credentials', 'true');
    new_response_headers.set('cache-control', 'public, max-age=14400');
    new_response_headers.delete('content-security-policy');
    new_response_headers.delete('content-security-policy-report-only');
    new_response_headers.delete('clear-site-data');
    
    // 处理响应内容，替换域名引用
    const modified_body = await modifyResponse(response_clone, host_prefix, url.hostname);

    return new Response(modified_body, {
      status: response.status,
      headers: new_response_headers
    });
  } catch (err) {
    return new Response(`Proxy Error: ${err.message}`, { status: 502 });
  }
}

// 获取当前主机名的前缀，用于匹配反向映射
function getProxyPrefix(host) {
  // 检查主机名是否以 gh. 开头
  if (host.startsWith('gh.')) {
    return 'gh.';
  }
  
  // 检查其他映射前缀
  for (const prefix of Object.values(domain_mappings)) {
    if (host.startsWith(prefix)) {
      return prefix;
    }
  }
  
  return null;
}

async function modifyResponse(response, host_prefix, current_hostname) {
  // 只处理文本内容
  const content_type = response.headers.get('content-type') || '';
  if (!content_type.includes('text/') && !content_type.includes('application/json') && 
      !content_type.includes('application/javascript') && !content_type.includes('application/xml')) {
    return response.body;
  }

  let text = await response.text();
  
  // 获取当前域名的后缀部分（用于构建完整的代理域名）
  const domain_suffix = current_hostname.substring(host_prefix.length);
  
  // 替换所有域名引用
  for (const [original_domain, proxy_prefix] of Object.entries(domain_mappings)) {
    const escaped_domain = original_domain.replace(/\./g, '\\.');
    const full_proxy_domain = `${proxy_prefix}${domain_suffix}`;
    
    // 替换完整URLs
    text = text.replace(
      new RegExp(`https?://${escaped_domain}(?=/|"|'|\\s|$)`, 'g'),
      `https://${full_proxy_domain}`
    );
    
    // 替换协议相对URLs
    text = text.replace(
      new RegExp(`//${escaped_domain}(?=/|"|'|\\s|$)`, 'g'),
      `//${full_proxy_domain}`
    );
  }

  // 处理相对路径
  if (host_prefix === 'gh.') {
    text = text.replace(
      /(?<=["'])\/(?!\/|[a-zA-Z]+:)/g,
      `https://${current_hostname}/`
    );
  }

  return text;
}
