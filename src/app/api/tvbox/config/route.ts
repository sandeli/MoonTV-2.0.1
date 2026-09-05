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
        // 使用 Edge 兼容的 Base64 解码以防运行时崩溃
        const decodedString = atob(un);
        username = decodeURIComponent(escape(decodedString));
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
    
    // 豆瓣自定义源：指定 type: 3 (聚合/爬虫类源) 并配合 spider，以支持海报墙与分类浏览
    const doubanCustomSite = {
      key: 'douban_custom',
      api: `${origin}/api/tvbox/douban`, 
      name: '豆瓣｜首页推荐',
      type: 3,
      searchable: 1,
      quickSearch: 1,
      filterable: 1,
      ext: '',
    };

    const payload: Record<string, any> = {
      // 引入主流公共支持海报墙解析及弹窗样式的 spider 核心包
      spider: "https://raw.githubusercontent.com/FongMi/CatVodTV/master/custom_spider.jar;md5;1234567890abcdef1234567890abcdef",
      // 将“豆瓣｜首页推荐”放在列表第一位，确保 TVBox 启动时默认加载海报墙
      sites: [doubanCustomSite, ...tvboxSites],
      parses: [
        { name: "聚合", type: 3, url: "demo" }
      ],
      lives: [],
      ads: [],
      // 配置默认首页展示与海报墙推荐数据流
      recommend: [
        {
          name: "豆瓣热门电影",
          request: {
            method: "GET",
            header: [{ key: "Referer", value: "https://movie.douban.com/" }],
            url: { raw: "https://movie.douban.com/j/new_search_subjects?sort=U&range=0,10&tags=电影&playable=1&start=0&year_range=" }
          },
          response: {
            result: "$.data",
            data: [
              { key: "name", value: "title" },
              { key: "note", value: "rate" },
              { key: "pic", value: "cover" },
              { key: "id", value: "id" }
            ]
          },
          expires: "86400"
        },
        {
          name: "豆瓣热门电视剧",
          request: {
            method: "GET",
            header: [{ key: "Referer", value: "https://movie.douban.com/" }],
            url: { raw: "https://movie.douban.com/j/new_search_subjects?sort=U&range=0,10&tags=电视剧&playable=1&start=0&year_range=" }
          },
          response: {
            result: "$.data",
            data: [
              { key: "name", value: "title" },
              { key: "note", value: "rate" },
              { key: "pic", value: "cover" },
              { key: "id", value: "id" }
            ]
          },
          expires: "86400"
        }
      ]
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=0`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  } catch (e) {
    return NextResponse.json({ sites: [], parses: [], lives: [], ads: [] }, {
      status: 500,
    });
  }
}
