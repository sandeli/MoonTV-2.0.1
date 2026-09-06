import { NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';

export const runtime = 'edge';

export async function GET(request: Request) {
  const url = new URL(request.url);
  let inputPassword = url.searchParams.get('pwd') || url.searchParams.get('password') || '';

  try {
    const adminConfig = await getConfig();
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    
    // 本地模式下未提供查询参数则自动使用环境变量 PASSWORD
    if (storageType === 'localstorage' && !inputPassword) {
      inputPassword = process.env.PASSWORD || '';
    }
    const enabled = storageType === 'localstorage'
      ? (process.env.TVBOX_ENABLED == null
          ? true
          : String(process.env.TVBOX_ENABLED).toLowerCase() === 'true')
      : adminConfig.SiteConfig?.TVBoxEnabled === true;

    if (!enabled) {
      return NextResponse.json({ error: 'TVBox 接口未开启' }, { status: 403 });
    }

    const [cfg, cacheTime] = await Promise.all([
      getConfig(),
      getCacheTime(),
    ]);

    // 豆瓣默认分类
    const doubanDefaults = {
      movie: ['热门', '最新', '经典', '豆瓣高分'],
      tv: ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '日本动画'],
    };

    // 用户自定义分类
    const custom = (cfg?.CustomCategories || []).map((c: any) => ({
      name: c.name || c.query,
      type: c.type || 'movie',
      query: c.query || '',
    }));

    // 构建分类列表 (class)
    const classes: { type_id: number; type_name: string }[] = [];
    const selectors: Array<{ kind: 'movie' | 'tv'; category?: string; label?: string }> = [];

    let nextId = 1;
    doubanDefaults.movie.forEach((name) => {
      classes.push({ type_id: nextId++, type_name: `电影·${name}` });
      selectors.push({ kind: 'movie', category: name });
    });
    doubanDefaults.tv.forEach((name) => {
      classes.push({ type_id: nextId++, type_name: `剧集·${name}` });
      selectors.push({ kind: 'tv', category: name });
    });
    custom.forEach((c: any) => {
      classes.push({ type_id: nextId++, type_name: `${c.name}` });
      selectors.push({ kind: c.type, label: c.query });
    });

    const acParam = url.searchParams.get('ac');
    const rawT = url.searchParams.get('t');
    const wdParam = url.searchParams.get('wd') || '';

    // =========================================================================
    // 【关键新增修复】：如果 TVBox 拿这个接口当作【配置文件】请求（无 ac/t/wd 参数）
    // 直接返回一个包含 spider 字段的标准 TVBox 配置 JSON
    // =========================================================================
    if (!acParam && !rawT && !wdParam) {
      const selfApiUrl = `${url.origin}${url.pathname}${url.search}`;
      
      const configPayload = {
        // 提供默认的 spider 爬虫包，满足 TVBox 配置校验规范
        spider: 'https://git.taoge.me.eu.org/https://raw.githubusercontent.com/sandeli/qisttvbox/refs/heads/master/jar/spider.jar',
        sites: [
          {
            key: 'douban_portal',
            name: cfg?.SiteConfig?.SiteName || '豆瓣影视',
            type: 1, // CMS 接口类型
            api: selfApiUrl,
            searchable: 1,
            quickSearch: 1,
            filterable: 1,
          },
        ],
      };

      return NextResponse.json(configPayload, {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime || 60}, s-maxage=0`,
        },
      });
    }

    // =========================================================================
    // 如果 TVBox 发起的是数据查询（带 t/wd/ac 参数），按苹果 CMS 接口返回数据
    // =========================================================================
    let tParam = Number(rawT || '1');
    if (isNaN(tParam) || tParam < 1 || tParam > selectors.length) {
      tParam = selectors.length > 0 ? 1 : 0;
    }

    const pgParam = Math.max(1, parseInt(url.searchParams.get('pg') || '1', 10));
    const pageSize = Math.max(1, Math.min(50, parseInt(url.searchParams.get('pagesize') || '20', 10)));

    let kind: 'movie' | 'tv' = 'movie';
    let category = '';
    let label = '';
    let sort = '';

    if (tParam >= 1 && tParam <= selectors.length) {
      const sel = selectors[tParam - 1];
      kind = sel.kind || 'movie';
      category = sel.category || '';
      label = sel.label || '';
    }
    if (wdParam) {
      label = wdParam;
    }

    if (category === '最新') {
      sort = 'time';
      category = '';
      label = '';
    } else if (category === '热门') {
      category = '';
      label = '';
    }

    const qs = new URLSearchParams();
    qs.set('kind', kind);
    if (category) qs.set('category', category);
    if (label) qs.set('label', label);
    if (sort) qs.set('sort', sort);
    if (category === '最新') {
      qs.set('year', String(new Date().getFullYear()));
    }
    qs.set('start', String((pgParam - 1) * pageSize));
    qs.set('limit', String(pageSize));

    let formattedList: any[] = [];
    try {
      const origin = url.origin;
      const resp = await fetch(`${origin}/api/douban/recommends?${qs.toString()}`);
      if (resp.ok) {
        const data = await resp.json();
        const rawList = Array.isArray(data?.list) ? data.list : [];
        
        formattedList = rawList.map((item: any) => {
          let posterUrl = item.poster || item.cover || '';
          if (posterUrl) {
            posterUrl = posterUrl.replace('https://img1.doubanio.com', 'https://img.doubanio.com')
                                 .replace('https://img3.doubanio.com', 'https://img.doubanio.com');
          }
          return {
            vod_id: String(item.id || item.vod_id || ''),
            vod_name: item.title || item.vod_name || '未知',
            vod_pic: posterUrl,
            vod_year: String(item.year || ''),
            vod_remarks: item.rate ? `豆瓣:${item.rate}` : (item.remarks || ''),
          };
        });
      }
    } catch (err) {
      console.error('Fetch recommends error:', err);
    }

    return NextResponse.json(
      {
        code: 1,
        msg: 'success',
        page: pgParam,
        pagecount: 999,
        limit: pageSize,
        total: formattedList.length,
        class: classes,
        list: formattedList,
      },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime || 60}, s-maxage=0`,
        },
      }
    );

  } catch (e) {
    console.error('Categories API Root Error:', e);
    // 兜底配置，即使出错也返回合法配置，避免 TVBox 报“配置失败”
    return NextResponse.json({
      spider: 'https://git.taoge.me.eu.org/https://raw.githubusercontent.com/sandeli/qisttvbox/refs/heads/master/jar/spider.jar',
      sites: []
    });
  }
}
