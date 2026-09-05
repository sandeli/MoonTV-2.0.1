/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { getRequestOrigin } from '@/lib/request-origin';

export const runtime = 'edge';

/**
 * TVBox 配置接口
 * 参考常见 TVBox JSON 结构，最小可用字段：sites
 * 未来可扩展 parses、lives、ads 等
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    let inputPassword = url.searchParams.get('pwd') || url.searchParams.get('password') || '';
    const un = url.searchParams.get('un') || '';
    
    const adminConfig = await getConfig();
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    
    // 本地存储模式下 un 参数可以为空
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

    // 本地模式下未提供查询参数则自动使用环境变量 PASSWORD
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

    // 将内部 SourceConfig 映射为 TVBox 兼容的 sites
    // 常见字段：key/api/name/type/searchable/quickSearch
    const tvboxSites = sites.map((s) => ({
      key: s.key,
      api: s.api,
      name: s.name,
      type: 1,
      searchable: 1,
      quickSearch: 1,
      ext: s.detail || '',
    }));

    // 原有的 MoonTV 豆瓣自定义站点
    const origin = getRequestOrigin(request);
    const doubanCustomSite = {
      key: 'douban_custom',
      api: `${origin}/api/tvbox/categories`,
      name: '豆瓣｜自定义',
      type: 1,
      searchable: 0,
      ext: '',
    };

    // 👇👇👇 新增：OK影视等新版客户端专用的原生豆瓣影视源 👇👇👇
    const doubanNativeSite = {
      key: "douban_native",
      name: "豆瓣推荐",
      type: 3,
      api: "csp_Douban",
      searchable: 0,
      quickSearch: 0,
      filterable: 0
    };

    const payload: Record<string, any> = {
      // 👇 把 doubanNativeSite 放在 sites 数组的第一个，OK影视就会自动读取它作为首页海报墙
      sites: [doubanNativeSite, doubanCustomSite, ...tvboxSites],
      parses: [],
      lives: [],
      ads: [],
      // 👇 保留 recommend 字段，用来兼容老版本 TVBox 客户端
      recommend: [
        {
          name: "豆瓣推荐",
          request: {
            method: "GET",
            header: [
              {
                key: "Referer",
                value: "https://movie.douban.com/"
              }
            ],
            url: {
              raw: "https://movie.douban.com/j/new_search_subjects?sort=U&range=0,10&tags=&playable=1&start=0&year_range="
            }
          },
          response: {
            result: "$.data",
            data: [
              {
                key: "name",
                value: "title"
              },
              {
                key: "note",
                value: "rate"
              },
              {
                key: "pic",
                value: "cover"
              }
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
