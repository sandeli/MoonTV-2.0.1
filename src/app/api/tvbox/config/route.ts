/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { getRequestOrigin } from '@/lib/request-origin';

export const runtime = 'edge';

/**
 * TVBox 配置接口
 * 参考常见 TVBox JSON 结构，最小可用字段：sites
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
    const tvboxSites = sites.map((s) => ({
      key: s.key,
      api: s.api,
      name: s.name,
      type: 1,
      searchable: 1,
      quickSearch: 1,
      ext: s.detail || '',
    }));

    // 👇 核心修改：从你的源列表中智能提取出“🎬豆瓣资源”或者第一个可用影视源
    const doubanResourceSite = tvboxSites.find((s) => s.name.includes('豆瓣') && !s.key.includes('douban_custom'));
    const otherSites = tvboxSites.filter((s) => s !== doubanResourceSite);

    // 原有的 MoonTV 豆瓣自定义分类
    const origin = getRequestOrigin(request);
    const doubanCustomSite = {
      key: 'douban_custom',
      api: `${origin}/api/tvbox/categories`,
      name: '豆瓣｜自定义',
      type: 1,
      searchable: 0,
      ext: '',
    };

    // 重新排序：把真实的视频源放在第一位，确保 OK影视 能够拉取到首页海报！
    const finalSites = [];
    if (doubanResourceSite) {
      // 第一顺位：真实的豆瓣资源站（有海报，点开能播放）
      finalSites.push(doubanResourceSite); 
    } else if (otherSites.length > 0) {
      // 兜底方案：如果没有叫豆瓣的，就拿列表里第一个当首页
      finalSites.push(otherSites[0]);
      otherSites.shift(); 
    }
    // 第二顺位：保留原版功能
    finalSites.push(doubanCustomSite);
    // 第三顺位：剩下的其他源
    finalSites.push(...otherSites);

    const payload: Record<string, any> = {
      sites: finalSites,
      parses: [],
      lives: [],
      ads: [],
      // 保留 recommend 兼容原版 TVBox 首页
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
