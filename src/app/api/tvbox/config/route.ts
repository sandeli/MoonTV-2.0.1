/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime, getConfig } from '@/lib/config';
import { getRequestOrigin } from '@/lib/request-origin';

export const runtime = 'edge';

/**
 * TVBox 配置接口
 * 支持图片代理（防止豆瓣防盗链导致海报裂图）
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

    // 获取当前请求的 Origin 地址 (例如 https://your-moontv.com)
    const origin = getRequestOrigin(request);

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

    // 豆瓣官方 API Request Header 机制
    const doubanHeader = [
      {
        key: 'Referer',
        value: 'https://movie.douban.com/',
      },
      {
        key: 'User-Agent',
        value:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    ];

    // 👇【核心防裂图修改】：通过 TVBox mapping 的格式化语法，将返回的豆瓣 cover 图片 URL 强制经过 MoonTV 的 image-proxy 反代处理
    // 同时也补充了常用的备用第三方图片反代/ referrer 绕过设置
    const doubanMapping = {
      list: 'subjects',
      id: 'id',
      name: 'title',
      pic: `${origin}/api/image-proxy?url={cover}`, // 包装为 MoonTV 项目自带的图片代理链接
      remarks: 'rate',
    };

    const payload: Record<string, any> = {
      spider: '',
      recommend: [
        {
          name: '豆瓣热门电影',
          request: {
            method: 'GET',
            header: doubanHeader,
            url: {
              raw: 'https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&sort=recommend&page_limit=30&page_start=0',
            },
          },
          mapping: doubanMapping,
          expires: '86400',
        },
        {
          name: '豆瓣热门电视剧',
          request: {
            method: 'GET',
            header: doubanHeader,
            url: {
              raw: 'https://movie.douban.com/j/search_subjects?type=tv&tag=%E7%83%AD%E9%97%A8&sort=recommend&page_limit=30&page_start=0',
            },
          },
          mapping: doubanMapping,
          expires: '86400',
        },
        {
          name: '豆瓣热门综艺',
          request: {
            method: 'GET',
            header: doubanHeader,
            url: {
              raw: 'https://movie.douban.com/j/search_subjects?type=tv&tag=%E7%BB%BC%E8%8B%B1&sort=recommend&page_limit=30&page_start=0',
            },
          },
          mapping: doubanMapping,
          expires: '86400',
        },
        {
          name: '豆瓣热门动漫',
          request: {
            method: 'GET',
            header: doubanHeader,
            url: {
              raw: 'https://movie.douban.com/j/search_subjects?type=tv&tag=%E5%8A%A8%E6%BC%AB&sort=recommend&page_limit=30&page_start=0',
            },
          },
          mapping: doubanMapping,
          expires: '86400',
        },
      ],
      sites: tvboxSites,
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
