/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';
import { getRequestOrigin } from '@/lib/request-origin';

export const runtime = 'edge';

/**
 * 抓取豆瓣数据的辅助函数
 */
async function fetchDoubanData(
  type: string,
  tag: string,
  page: number = 1,
  limit: number = 60
) {
  try {
    const pageStart = (page - 1) * limit;
    const targetUrl = `https://movie.douban.com/j/search_subjects?type=${type}&tag=${encodeURIComponent(
      tag
    )}&sort=recommend&page_limit=${limit}&page_start=${pageStart}`;

    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://movie.douban.com/',
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data?.subjects || [];
  } catch (error) {
    console.error('Fetch Douban Error:', error);
    return [];
  }
}

/**
 * 并发测速函数：测试播放源的 HTTP 响应延迟 (ms)
 * 限制超时时间为 1500ms，超时或报错视作不可用 (9999ms)
 */
async function testSourceSpeed(url: string, timeoutMs = 1500): Promise<number> {
  if (!url) return 9999;
  const start = Date.now();
  
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 使用 HEAD 请求快速检测响应头，减少带宽消耗
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timer);

    if (res.ok || res.status === 302 || res.status === 301) {
      return Date.now() - start;
    }
    return 9999;
  } catch (e) {
    clearTimeout(timer);
    return 9999;
  }
}

export async function GET(request: Request) {
  try {
    const origin = getRequestOrigin(request);
    const url = new URL(request.url);

    const ids = url.searchParams.get('ids') || '';
    const t = url.searchParams.get('t') || '';
    const wd = url.searchParams.get('wd') || '';
    const pgParam =
      url.searchParams.get('pg') || url.searchParams.get('page') || '1';
    const page = parseInt(pgParam, 10) || 1;
    const limit = 60;

    // =========================================================================
    // 1. 点击海报或搜索逻辑：并发测速并自动按最快速度排序
    // =========================================================================
    const searchQuery = ids.trim() || wd.trim();

    if (searchQuery) {
      try {
        const searchRes = await fetch(
          `${origin}/api/search?q=${encodeURIComponent(searchQuery)}`
        );

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const results = Array.isArray(searchData)
            ? searchData
            : searchData?.results || [];

          if (results.length > 0) {
            // 限制最多并发测速前 8 个源，避免超时过长
            const validCandidates = results.slice(0, 8);

            // 并发测试每个源的响应速度
            const testedResults = await Promise.all(
              validCandidates.map(async (item: any, index: number) => {
                const playUrl = item.url || item.playUrl || item.link || '';
                const speed = await testSourceSpeed(playUrl);
                return {
                  sourceName: item.source || item.site || `线路${index + 1}`,
                  playUrl,
                  speed, // 单位毫秒，9999 代表失败或超时
                  item,
                };
              })
            );

            // 按速度（延迟小）排序，让最快的源排在数组第一个
            testedResults.sort((a, b) => a.speed - b.speed);

            const playFromList: string[] = [];
            const playUrlList: string[] = [];

            testedResults.forEach((res) => {
              if (res.playUrl) {
                // 如果测速成功则显示延迟 ms，未响应显示 默认
                const speedLabel =
                  res.speed < 9999 ? `⚡ ${res.speed}ms` : '常规';
                playFromList.push(`[${speedLabel}] ${res.sourceName}`);
                playUrlList.push(`正片$${res.playUrl}`);
              }
            });

            // 获取最快源的信息作为封面
            const fastestItem = testedResults[0]?.item || results[0];
            const vodPic = fastestItem.pic
              ? `${fastestItem.pic}@Referer=https://movie.douban.com/@User-Agent=Mozilla/5.0`
              : '';

            const detailItem = {
              vod_id: searchQuery,
              vod_name: searchQuery,
              vod_pic: vodPic,
              type_name: '热门推荐',
              vod_remarks: `极速播放 (首选: ${playFromList[0] || '默认'})`,
              vod_actor: '网络聚合',
              vod_director: '网络',
              vod_content: `系统已自动为您检测并匹配了延迟最低的播放线路 (${playFromList[0]})。如有加载异常，可切换下方备用线路。`,
              // 第一条即为速度最快的源，TVBox 将自动播放此源
              vod_play_from: playFromList.join('$$$'),
              vod_play_url: playUrlList.join('$$$'),
            };

            return NextResponse.json({
              list: [detailItem],
            });
          }
        }
      } catch (e) {
        console.error('TVBox detail/search error:', e);
      }

      return NextResponse.json({
        list: [
          {
            vod_id: searchQuery,
            vod_name: searchQuery,
            vod_remarks: '未找到源',
            vod_content: '暂未搜到该视频的有效播放线路。',
          },
        ],
      });
    }

    // =========================================================================
    // 2. 分类海报墙逻辑
    // =========================================================================
    const classCategories = [
      { type_id: '电影', type_name: '热门电影' },
      { type_id: '国产剧', type_name: '热门剧集' },
      { type_id: '综艺', type_name: '热门综艺' },
      { type_id: '动漫', type_name: '热门动漫' },
    ];

    let doubanType = 'movie';
    let doubanTag = '热门';

    if (t === '国产剧') {
      doubanType = 'tv';
      doubanTag = '国产剧';
    } else if (t === '综艺') {
      doubanType = 'tv';
      doubanTag = '综艺';
    } else if (t === '动漫') {
      doubanType = 'tv';
      doubanTag = '动漫';
    } else {
      doubanType = 'movie';
      doubanTag = '热门';
    }

    const subjects = await fetchDoubanData(doubanType, doubanTag, page, limit);

    const list = subjects.map((item: any) => {
      const rawCover = item.cover || item.pic || '';
      const formattedPic = rawCover
        ? `${rawCover}@Referer=https://movie.douban.com/@User-Agent=Mozilla/5.0`
        : '';

      return {
        vod_id: item.title,
        vod_name: item.title,
        vod_pic: formattedPic,
        vod_remarks: item.rate ? `⭐ ${item.rate}` : '热门',
      };
    });

    return NextResponse.json({
      page: page,
      pagecount: 20,
      limit: limit,
      total: 1200,
      class: classCategories,
      list: list,
    });
  } catch (e) {
    console.error('TVBox categories API crash:', e);
    return NextResponse.json({
      class: [
        { type_id: '电影', type_name: '热门电影' },
        { type_id: '国产剧', type_name: '热门剧集' },
      ],
      list: [],
    });
  }
}
