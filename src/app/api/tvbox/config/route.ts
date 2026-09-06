/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { getRequestOrigin } from '@/lib/request-origin';

export const runtime = 'edge';

/**
 * TVBox 配置接口
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    let inputPassword = url.searchParams.get('pwd') || url.searchParams.get('password') || '';
    const un = url.searchParams.get('un') || '';
    
    const adminConfig = await getConfig();
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    
    if (storageType !== 'localstorage' && !un.trim()) {
      return NextResponse.json({ error: '缺少参数 un' }, { status: 400 });
    }
    
    let username = '';
    if (un.trim()) {
      try {
        // 使用 Edge 兼容的标准 atob 解码
        username = decodeURIComponent(escape(atob(un.replace(/-/g, '+').replace(/_/g, '/'))));
      } catch (e) {
        return NextResponse.json({ error: '参数 un 非法' }, { status: 400 });
      }
    }

    if (storageType === 'localstorage' && !inputPassword) {
      inputPassword = process.env.PASSWORD || '';
    }
    const enabled = storageType === 'localstorage'
      ? (process.env.TVBOX_ENABLED == null
          ? true
          : String(process.env.TVBOX_ENABLED).toLowerCase() === 'true')
      : adminConfig.SiteConfig.TVBoxEnabled === true;
    const password = storageType === 'localstorage'
      ? (process.env.PASSWORD || '')
      : (adminConfig.SiteConfig.TVBoxPassword || '');

    if (!enabled) {
      return NextResponse.json({ error: 'TVBox 接口未开启' }, { status: 403 });
    }

    if (!password || inputPassword !== password) {
      return NextResponse.json({ error: '密码错误或未提供' }, { status: 401 });
    }

    const [sites, cacheTime] = await Promise.all([
      getAvailableApiSites(username || undefined),
      getCacheTime(),
    ]);

    const tvboxSites = sites.map((s) => ({
      key: s.key,
      api: s.api,
      name: s.name,
      type: 1,
      searchable: 1,
      quickSearch: 1,
      ext: s.detail || '',
    }));

    const origin = getRequestOrigin(request);
    
    // 1. 设置豆瓣自定义节点为 Type 3 (爬虫/自定义分类模式)，使其在首页以海报网格展示
    const doubanCustomSite = {
      key: 'douban_custom',
      name: '豆瓣｜热门推荐',
      type: 3,
      api: `${origin}/api/tvbox/douban`,
      searchable: 0,
      quickSearch: 0,
      filterable: 1,
      ext: ''
    };

    const payload: Record<string, any> = {
      // 保持“豆瓣｜热门推荐”在 sites 的第一个，客户端会默认优先加载此源作为首页
      sites: [doubanCustomSite, ...tvboxSites],
      parses: [],
      lives: [],
      ads: [],
      // 2. 提供全局推荐墙（针对只读取 global recommend 的传统客户端）
      recommend: [
        {
          name: "热门电影",
          request: {
            method: "GET",
            header: { "User-Agent": "Mozilla/5.0", "Referer": "https://movie.douban.com/" },
            url: { raw: "https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&page_limit=50&page_start=0" }
          },
          response: {
            result: "$.subjects",
            data: [
              { key: "name", value: "title" },
              { key: "note", value: "rate" },
              { key: "pic", value: "cover" },
              { key: "id", value: "id" }
            ]
          }
        },
        {
          name: "热门电视剧",
          request: {
            method: "GET",
            header: { "User-Agent": "Mozilla/5.0", "Referer": "https://movie.douban.com/" },
            url: { raw: "https://movie.douban.com/j/search_subjects?type=tv&tag=%E7%83%AD%E9%97%A8&page_limit=50&page_start=0" }
          },
          response: {
            result: "$.subjects",
            data: [
              { key: "name", value: "title" },
              { key: "note", value: "rate" },
              { key: "pic", value: "cover" },
              { key: "id", value: "id" }
            ]
          }
        }
      ]
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=0`,
      },
    });
  } catch (e) {
    return NextResponse.json({ sites: [], parses: [], lives: [], ads: [] }, {
      status: 500,
    });
  }
}
