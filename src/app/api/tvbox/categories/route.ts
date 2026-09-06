/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';
import { getRequestOrigin } from '@/lib/request-origin';

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const origin = getRequestOrigin(request);
    const url = new URL(request.url);
    const t = url.searchParams.get('t') || ''; // 当前选中的分类 ID
    const wd = url.searchParams.get('wd') || ''; // 搜索关键字

    // 1. 如果用户在 TVBoxApp 中点击了某张海报进行搜索/查看
    if (wd) {
      // 触发全局聚合搜索，重定向或转发到搜源逻辑
      const searchRes = await fetch(`${origin}/api/search?q=${encodeURIComponent(wd)}`);
      const searchData = await searchRes.json();
      
      const list = (searchData?.results || searchData || []).map((item: any) => ({
        vod_id: item.title || item.name,
        vod_name: item.title || item.name,
        vod_pic: item.pic ? `${origin}/api/image-proxy?url=${encodeURIComponent(item.pic)}` : '',
        vod_remarks: item.source || '搜索结果',
      }));

      return NextResponse.json({ list });
    }

    // 2. 首页数据（输出豆瓣热门电影/剧集海报墙数据）
    // 映射 tag 分类
    const tag = t || '热门';
    const type = t === '电影' ? 'movie' : 'tv';

    // 抓取 MoonTV 本地豆瓣 API
    const doubanRes = await fetch(
      `${origin}/api/douban?type=${type}&tag=${encodeURIComponent(tag)}&page_limit=30&page_start=0`
    );
    const doubanData = await doubanRes.json();
    const subjects = doubanData?.subjects || [];

    // 标准 苹果CMS/TVBox 格式海报墙数据 mapping
    const list = subjects.map((item: any) => ({
      vod_id: item.title,
      vod_name: item.title,
      // 关键：必须带上完整的海报图片路径 vod_pic，并走 image-proxy 防裂图
      vod_pic: `${origin}/api/image-proxy?url=${encodeURIComponent(item.cover || item.pic)}`,
      vod_remarks: item.rate ? `豆瓣 ${item.rate}` : '热门',
    }));

    // 定义顶部分类导航（导航栏菜单）
    const classCategories = [
      { type_id: '热门', type_name: '热门推荐' },
      { type_id: '电影', type_name: '热门电影' },
      { type_id: '国产剧', type_name: '热门剧集' },
      { type_id: '综艺', type_name: '热门综艺' },
      { type_id: '动漫', type_name: '热门动漫' },
    ];

    return NextResponse.json({
      class: classCategories,
      list: list,
    });
  } catch (e) {
    console.error('TVBox categories API error:', e);
    return NextResponse.json({ class: [], list: [] });
  }
}
