export interface SourceCandidate {
  source: string; // 线路/源标识
  id: string;     // 影片在该源下的 ID
  url?: string;   // 可选的播放链接
}

export interface SpeedTestResult extends SourceCandidate {
  latency: number; // 延迟时间 (ms)
}

/**
 * 测试单个源的响应延迟（HEAD 请求）
 */
export async function testSourceSpeed<T extends SourceCandidate>(
  item: T,
  timeoutMs = 3000
): Promise<SpeedTestResult> {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const targetUrl = item.url || `/api/detail?source=${encodeURIComponent(item.source)}&id=${encodeURIComponent(item.id)}`;

    const response = await fetch(targetUrl, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const latency = Math.round(performance.now() - startTime);
    return { ...item, latency };
  } catch {
    clearTimeout(timeoutId);
    return { ...item, latency: 999999 }; // 极高延迟代表超时或访问不通
  }
}

/**
 * 并发测试所有源，返回延迟最低的有效源
 */
export async function findFastestSource<T extends SourceCandidate>(
  sources: T[]
): Promise<T> {
  if (!sources || sources.length === 0) {
    throw new Error('没有可用的源');
  }

  // 1. 并发测速
  const results = await Promise.all(
    sources.map((item) => testSourceSpeed(item))
  );

  // 2. 过滤有效源并按延迟从小到大排序
  const validSources = results
    .filter((res) => res.latency < 999999)
    .sort((a, b) => a.latency - b.latency);

  // 3. 返回最佳源；全失败则默认返回列表中的第一个源
  if (validSources.length > 0) {
    const fastest = validSources[0];
    const matched = sources.find(
      (s) => s.source === fastest.source && s.id === fastest.id
    );
    if (matched) return matched;
  }

  return sources[0];
}
