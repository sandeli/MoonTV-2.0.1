/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { getRequestOrigin } from '@/lib/request-origin';

export const runtime = 'edge';

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

    const origin = getRequestOrigin(request);

    const tvboxSites = sites.map((s) => ({
      key: s.key,
      api: s.api,
      name: s.name,
      type: 1,
      searchable: 1,
      quickSearch: 1,
      ext: s.detail || '',
    }));

    // 默认第一个主站点（让客户端首页默认渲染它为海报墙）
    const doubanCustomSite = {
      key: 'douban_custom',
      api: `${origin}/api/tvbox/categories`,
      name: '豆瓣｜热门推荐',
      type: 1,
      searchable: 1,
      quickSearch: 1,
      filterable: 0,
      ext: '',
    };

    const payload: Record<string, any> = {
      spider: '',
      sites: [doubanCustomSite, ...tvboxSites],
      parses: [],
      lives: [],
      ads: [],
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
