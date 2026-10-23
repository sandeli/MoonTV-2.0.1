'use client';
export interface BangumiCalendarData {
  weekday: {
    en: string;
  };
  items: {
    id: number;
    name: string;
    name_cn: string;
    rating: {
      score: number;
    };
    air_date: string;
    images: {
      large: string;
      common: string;
      medium: string;
      small: string;
      grid: string;
    };
  }[];
}

/**
 * 校验 /api/bangumi/calendar 返回的单条数据。
 * 上游（Bangumi 代理）返回结构不可信，脏数据会在渲染层触发
 * `Cannot read properties of undefined` 之类的崩溃，因此在入口处过滤。
 */
function isBangumiCalendarEntry(value: unknown): value is BangumiCalendarData {
  if (!value || typeof value !== 'object') return false;
  const entry = value as { weekday?: unknown; items?: unknown };
  if (!entry.weekday || typeof entry.weekday !== 'object') return false;
  const weekday = entry.weekday as { en?: unknown };
  return typeof weekday.en === 'string' && Array.isArray(entry.items);
}

export async function GetBangumiCalendarData(): Promise<BangumiCalendarData[]> {
  try {
    const response = await fetch('/api/bangumi/calendar', {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter(isBangumiCalendarEntry);
  } catch (error) {
    // 日历属于非关键数据，失败时降级为空数组，仅记录日志便于排查
    // eslint-disable-next-line no-console
    console.error('Bangumi 日历请求失败:', error);
    return [];
  }
}

export interface BangumiSubjectDetail {
  id: string;
  title: string;
  year: string;
  rate: string;
  summary: string;
}

// 详情内存缓存，避免同一卡片多次打开菜单时重复请求
const BANGUMI_SUBJECT_CACHE_LIMIT = 200;
const bangumiSubjectCache = new Map<string, BangumiSubjectDetail>();
// 并发去重：同一 id 在请求返回前只发起一次网络请求
const bangumiSubjectRequests = new Map<string, Promise<BangumiSubjectDetail>>();

function cacheSubjectDetail(id: string, detail: BangumiSubjectDetail): void {
  if (bangumiSubjectCache.size >= BANGUMI_SUBJECT_CACHE_LIMIT) {
    // 简单的 FIFO 淘汰，防止长时间浏览后缓存无限增长
    const oldestKey = bangumiSubjectCache.keys().next().value;
    if (oldestKey !== undefined) {
      bangumiSubjectCache.delete(oldestKey);
    }
  }
  bangumiSubjectCache.set(id, detail);
}

async function requestSubjectDetail(id: string): Promise<BangumiSubjectDetail> {
  const response = await fetch(
    `/api/detail?provider=bangumi&id=${encodeURIComponent(id)}&fields=desc`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = (await response.json()) as { desc?: unknown };
  const detail: BangumiSubjectDetail = {
    id,
    title: '',
    year: '',
    rate: '',
    summary: typeof data.desc === 'string' ? data.desc : '',
  };
  cacheSubjectDetail(id, detail);
  return detail;
}

/**
 * 获取 Bangumi 条目详情（剧情简介）。
 * 通过服务端 /api/detail?provider=bangumi 获取，复用站点配置的 Bangumi 代理。
 * 失败时向调用方抛出异常，由调用方决定降级方式。
 */
export function GetBangumiSubjectDetail(
  id: string
): Promise<BangumiSubjectDetail> {
  const cached = bangumiSubjectCache.get(id);
  if (cached) {
    // 命中缓存后刷新顺序，实现近似 LRU 的淘汰顺序
    bangumiSubjectCache.delete(id);
    bangumiSubjectCache.set(id, cached);
    return Promise.resolve(cached);
  }

  const inflight = bangumiSubjectRequests.get(id);
  if (inflight) {
    return inflight;
  }

  const request = requestSubjectDetail(id);
  bangumiSubjectRequests.set(id, request);

  void request
    .catch(() => {
      // 失败结果由调用方处理，此处仅避免 promises 未被消费导致的未处理拒绝
    })
    .finally(() => {
      bangumiSubjectRequests.delete(id);
    });

  return request;
}
