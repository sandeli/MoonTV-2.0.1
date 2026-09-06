/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';
import { getRequestOrigin } from '@/lib/request-origin';

export const runtime = 'edge';

/**
 * 内部抓取豆瓣数据的辅助函数（带 Header 伪装与 revalidate 缓存）
 */
async function fetchDoubanData(type: string, tag: string) {
  try {
    const targetUrl = `https://movie.douban.com/j/search_subjects?type=${type}&tag=${encodeURIComponent(
      tag
    )}&sort=recommend&page_limit=30&page_start=0`;

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
    const t = url.searchParams.get('t') || ''; // 分类参数
    const wd = url.searchParams.get('wd') || ''; // 搜索关键字

    // 1. 如果 TVBoxApp 发起了搜索请求 (带 wd 参数)
    if (wd.trim()) {
      try {
        const searchRes = await fetch(
          `${origin}/api/search?q=${encodeURIComponent(wd.trim())}`
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const list = (searchData?.results || searchData || []).map(
            (item: any) => ({
              vod_id: item.title || item.name,
              vod_name: item.title || item.name,
              vod_pic: item.pic
                ? `${item.pic}@Referer=https://movie.douban.com/@User-Agent=Mozilla/5.0`
                : '',
              vod_remarks: item.source || '全源搜索',
            })
          );
          return NextResponse.json({ list });
        }
      } catch (e) {
        console.error('TVBox search error:', e);
      }
      return NextResponse.json({ list: [] });
    }

    // 2. 定义顶部分类导航（已去除重复的“热门推荐”）
    const classCategories = [
      { type_id: '电影', type_name: '热门电影' },
      { type_id: '国产剧', type_name: '热门剧集' },
      { type_id: '综艺', type_name: '热门综艺' },
      { type_id: '动漫', type_name: '热门动漫' },
    ];

    // 3. 匹配当前分类与豆瓣请求参数
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
      // 默认（未传参或 t='电影' 时，均默认加载热门电影）
      doubanType = 'movie';
      doubanTag = '热门';
    }

    // 4. 获取豆瓣官方数据
    const subjects = await fetchDoubanData(doubanType, doubanTag);

    // 5. 将豆瓣数据映射为 TVBox 标准格式，并附带 TVBox 原生 Referer Header 标注
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
