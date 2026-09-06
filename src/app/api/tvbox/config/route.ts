/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { getRequestOrigin } from '@/lib/request-origin';

export const runtime = 'edge';

/**
 * TVBox 配置接口
 * 同步 MoonTV 网页端首页豆瓣推荐数据 + 全源聚合搜索
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

    const origin = getRequestOrigin(request);

    // 将内部 SourceConfig 映射为 TVBox 兼容的普通资源站点
    const tvboxSites = sites.map((s) => ({
      key: s.key,
      api: s.api,
      name: s.name,
      type: 1,
      searchable: 1,
      quickSearch: 1,
      ext: s.detail || '',
    }));

    // 默认第一个站点：豆瓣推荐聚合主源
    const doubanCustomSite = {
      key: 'douban_custom',
      api: `${origin}/api/tvbox/categories`,
      name: '豆瓣｜推荐聚合',
      type: 1,
      searchable: 1,
      quickSearch: 1,
      ext: '',
    };

    // 数据映射规则（适配 MoonTV 自带 /api/douban 接口返回的数据结构）
    const doubanMapping = {
      list: 'subjects',
      id: 'id',
      name: 'title',
      pic: `${origin}/api/image-proxy?url={cover}`, // 统一由 MoonTV 防盗链图片代理处理
      remarks: 'rate',
    };

    const payload: Record<string, any> = {
      spider: '',
      // 👇【核心修改】：直接对齐 MoonTV 网页版首页调用的豆瓣分类与热门数据接口
      recommend: [
        {
          name: '热门电影',
          request: {
            method: 'GET',
            url: {
              raw: `${origin}/api/douban?type=movie&tag=%E7%83%AD%E9%97%A8&page_limit=30&page_start=0`,
            },
          },
          mapping: doubanMapping,
          expires: '3600',
        },
        {
          name: '热门剧集',
          request: {
            method: 'GET',
            url: {
              raw: `${origin}/api/douban?type=tv&tag=%E7%83%AD%E9%97%A8&page_limit=30&page_start=0`,
            },
          },
          mapping: doubanMapping,
          expires: '3600',
        },
        {
          name: '国产剧',
          request: {
            method: 'GET',
            url: {
              raw: `${origin}/api/douban?type=tv&tag=%E5%9B%BD%E4%BA%A7%E5%89%A7&page_limit=30&page_start=0`,
            },
          },
          mapping: doubanMapping,
          expires: '3600',
        },
        {
          name: '综艺',
          request: {
            method: 'GET',
            url: {
              raw: `${origin}/api/douban?type=tv&tag=%E7%BB%BC%E8%8B%B1&page_limit=30&page_start=0`,
            },
          },
          mapping: doubanMapping,
          expires: '3600',
        },
        {
          name: '动漫',
          request: {
            method: 'GET',
            url: {
              raw: `${origin}/api/douban?type=tv&tag=%E5%8A%A8%E6%BC%AB&page_limit=30&page_start=0`,
            },
          },
          mapping: doubanMapping,
          expires: '3600',
        },
      ],
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
