export interface SourceCandidate {
  source: string; // 源名称/标识 (如 "kwkan", "zxzj")
  id: string;     // 影片在该源下的 ID
  name?: string;  // 源的显示名称
}

export interface SpeedTestResult extends SourceCandidate {
  latency: number; // 响应延迟 (ms)
}

/**
 * 单源 HEAD 请求超时测速
 */
export async function testSourceSpeed<T extends SourceCandidate>(
  item: T,
  timeoutMs = 3000
): Promise<SpeedTestResult> {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 请求 api/detail 验证接口建立连接的时延 (TTFB)
    const targetUrl = `/api/detail?source=${encodeURIComponent(item.source)}&id=${encodeURIComponent(item.id)}`;

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
    // 超时或失败，赋予极大延迟值标记为不可用
    return { ...item, latency: 999999 };
  }
}

/**
 * 并发测试所有源并返回延迟最低的源（策略 B）
 */
export async function findFastestSource<T extends SourceCandidate>(
  sources: T[]
): Promise<T> {
  if (!sources || sources.length === 0) {
    throw new Error('无可用源列表');
  }

  // 1. 并发测试所有源
  const results = await Promise.all(
    sources.map((item) => testSourceSpeed(item))
  );

  // 2. 筛选出成功响应（<999999ms）的源，并按延迟升序排列
  const validSources = results
    .filter((res) => res.latency < 999999)
    .sort((a, b) => a.latency - b.latency);

  // 3. 返回最佳源；全超时则兜底返回列表中的第一个源
  if (validSources.length > 0) {
    const fastest = validSources[0];
    const matched = sources.find(
      (s) => s.source === fastest.source && s.id === fastest.id
    );
    if (matched) return matched;
  }

  return sources[0];
}
