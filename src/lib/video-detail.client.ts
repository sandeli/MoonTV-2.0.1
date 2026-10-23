'use client';

/**
 * 播放源详情简介获取（浏览器端）。
 * 用于播放记录 / 收藏 / 搜索等没有豆瓣条目 ID 的卡片。
 */

const CACHE_LIMIT = 200;
const descCache = new Map<string, string>();
// 并发去重：同一 source+id 在请求返回前只发起一次网络请求
const descRequests = new Map<string, Promise<string>>();

function getCacheKey(source: string, id: string, title: string): string {
  return `${source}::${id}::${title}`;
}

function cacheDesc(key: string, desc: string): void {
  if (descCache.size >= CACHE_LIMIT) {
    // 简单 FIFO 淘汰，避免长时间浏览后缓存无限增长
    const oldestKey = descCache.keys().next().value;
    if (oldestKey !== undefined) {
      descCache.delete(oldestKey);
    }
  }
  descCache.set(key, desc);
}

async function requestDesc(
  source: string,
  id: string,
  title: string
): Promise<string> {
  const controller = new AbortController();
  // 搜索单源可能较慢，留出比详情接口更长的等待时间
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const params = new URLSearchParams({ source, id, fields: 'desc' });
    if (title) {
      params.set('title', title);
    }

    const response = await fetch(`/api/detail?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { desc?: unknown };
    const desc = typeof data.desc === 'string' ? data.desc : '';
    cacheDesc(getCacheKey(source, id, title), desc);
    return desc;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 获取播放源条目的剧情简介。
 * 命中缓存直接返回；同一内容的并发请求会复用同一个 Promise。
 */
export function getVideoDesc(
  source: string,
  id: string,
  title = ''
): Promise<string> {
  const key = getCacheKey(source, id, title);

  const cached = descCache.get(key);
  if (cached !== undefined) {
    // 命中后刷新顺序，实现近似 LRU 的淘汰顺序
    descCache.delete(key);
    descCache.set(key, cached);
    return Promise.resolve(cached);
  }

  const inflight = descRequests.get(key);
  if (inflight) {
    return inflight;
  }

  const request = requestDesc(source, id, title);
  descRequests.set(key, request);

  void request
    .catch(() => {
      // 失败结果由调用方处理，此处仅避免未处理的 Promise 拒绝
    })
    .finally(() => {
      descRequests.delete(key);
    });

  return request;
}
