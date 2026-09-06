/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';
import { getRequestOrigin } from '@/lib/request-origin';

export const runtime = 'edge';

/**
 * 抓取豆瓣数据的辅助函数（支持动态页码与自定义单页数量）
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
      next: { revalidate: 3600 }, // 缓存 1 小时
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data?.subjects || [];
  } catch (error) {
    console.error('Fetch Douban Error:', error);
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const origin = getRequestOrigin(request);
    const url = new URL(request.url);

    const ids = url.searchParams.get('ids') || ''; // TVBox 点击海报时传入的影片 ID/名称
    const t = url.searchParams.get('t') || ''; // 分类参数
    const wd = url.searchParams.get('wd') || ''; // 顶栏搜索关键字
    const pgParam =
      url.searchParams.get('pg') || url.searchParams.get('page') || '1';
    const page = parseInt(pgParam, 10) || 1;
    const limit = 60;

    // =========================================================================
    // 1. 【核心修复】：处理点击海报动作 (带 ids 参数) 或 顶栏搜索 (带 wd 参数)
    //    将选中的影片标题发给后台聚合搜索，并将多源线路封装为 TVBox 详情结构
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
            // 组装线路（将聚合搜索到的各个源拼接为 vod_play_from 和 vod_play_url）
            const playFromList: string[] = [];
            const playUrlList: string[] = [];

            results.forEach((item: any, index: number) => {
              const sourceName = item.source || item.site || `线路${index + 1}`;
              const playUrl = item.url || item.playUrl || item.link || '';

              if (playUrl) {
                playFromList.push(sourceName);
                // TVBox 格式：正片$播放链接
                playUrlList.push(`播放$${playUrl}`);
              }
            });

            // 获取第一项作为展示信息
            const firstItem = results[0];
            const vodPic = firstItem.pic
              ? `${firstItem.pic}@Referer=https://movie.douban.com/@User-Agent=Mozilla/5.0`
              : '';

            const detailItem = {
              vod_id: searchQuery,
              vod_name: searchQuery,
              vod_pic: vodPic,
              type_name: '热门推荐',
              vod_remarks: `${results.length}个可播放源`,
              vod_actor: '网络聚合',
              vod_director: '网络',
              vod_content: `已自动聚合为您搜到 ${results.length} 个可用播放源，点击下方线路即可播放。`,
              // 多线路分割协议
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

      // 搜索无结果时的回退提示
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
    // 2. 分类列表逻辑 (海报墙展示)
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

    // 获取豆瓣热门海报列表
    const subjects = await fetchDoubanData(doubanType, doubanTag, page, limit);

    // 映射海报墙列表
    const list = subjects.map((item: any) => {
      const rawCover = item.cover || item.pic || '';
      const formattedPic = rawCover
        ? `${rawCover}@Referer=https://movie.douban.com/@User-Agent=Mozilla/5.0`
        : '';

      return {
        // 关键：vod_id 设为影片真实标题（点击海报时 TVBox 会将此 vod_id 传回 ids 参数）
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
