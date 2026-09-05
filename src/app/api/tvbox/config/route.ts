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
        username = Buffer.from(un, 'base64').toString('utf8');
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
    
    // 👇👇👇 核心改动看这里：把原有的豆瓣自定义，指向上一步新建的豆瓣原生接口
    const doubanCustomSite = {
      key: 'douban_custom',
      api: `${origin}/api/tvbox/douban`, // <-- 改变了获取数据的地址
      name: '豆瓣｜自定义',
      type: 1,
      searchable: 0,
      ext: '',
    };

    const payload: Record<string, any> = {
      // 保持“豆瓣｜自定义”是列表里的绝对第一位，确保它作为默认首页
      sites: [doubanCustomSite, ...tvboxSites],
      parses: [],
      lives: [],
      ads: [],
      // 保留原来的 Recommend 兼容老电视
      recommend: [
        {
          name: "豆瓣推荐",
          request: {
            method: "GET",
            header: [{ key: "Referer", value: "https://movie.douban.com/" }],
            url: { raw: "https://movie.douban.com/j/new_search_subjects?sort=U&range=0,10&tags=&playable=1&start=0&year_range=" }
          },
          response: {
            result: "$.data",
            data: [
              { key: "name", value: "title" },
              { key: "note", value: "rate" },
              { key: "pic", value: "cover" }
            ]
          },
          expires: "86400"
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
