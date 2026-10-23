/**
 * 以受限并发执行异步任务，返回值顺序与输入顺序一致。
 *
 * 任一任务抛错时整体 reject；如果希望“单项失败不影响其他项”，
 * 请在任务内部自行捕获异常并返回兜底值。
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  // 非法/过小的上限退化为串行，上限也不会超过任务总数。
  const concurrency = Math.max(
    1,
    Math.min(Math.floor(limit) || 1, items.length)
  );
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
