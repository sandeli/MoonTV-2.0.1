import { NextResponse } from 'next/server';

import { getCacheTime, getConfig } from '@/lib/config';

export const runtime = 'edge';

export async function GET(request: Request) {
  const url = new URL(request.url);
  let inputPassword = url.searchParams.get('pwd') || url.searchParams.get('password') || '';

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
    : adminConfig.SiteConfig.TVBoxEnabled === true;

  if (!enabled) {
    return NextResponse.json({ error: 'TVBox 接口未开启' }, { status: 403 });
  }

  try {
    const [cfg, cacheTime] = await Promise.all([
      getConfig(),
      getCacheTime(),
    ]);

    // 豆瓣默认分类（来源于 README 可用分类）
    const doubanDefaults = {
      movie: [
        '热门','最新','经典','豆瓣高分',
      ],
      tv: [
        '热门','美剧','英剧','韩剧','日剧','国产剧','日本动画',
      ],
    };

    // 用户自定义分类（从配置获取）
    const custom = (cfg.CustomCategories || []).map((c) => ({
      name: c.name || c.query,
      type: c.type,
      query: c.query,
    }));

    // Apple CMS 类似分类返回（参考 provide/vod 的分类结构）
    const classes: { type_id: number; type_name: string }[] = [];
    let nextId = 1;

    doubanDefaults.movie.forEach((name) => {
      classes.push({ type_id: nextId++, type_name: `电影·${name}` });
    });
    doubanDefaults.tv.forEach((name) => {
      classes.push({ type_id: nextId++, type_name: `剧集·${name}` });
    });
    custom.forEach((c) => {
      classes.push({ type_id: nextId++, type_name: `${c.name}` });
    });

    // 分页参数：t（分类 id），pg（页码，默认1），wd（关键字）
    // 【修改点 1】：如果不传 tParam 和 wdParam，默认 tParam 为 1（即默认选中 电影·热门 作为首页推荐墙）
    const rawT = url.searchParams.get('t');
    const wdParam = url.searchParams.get('wd') || '';
    const tParam = Number(rawT || (wdParam ? '' : '1')); 
    
    const pgParam = Math.max(1, parseInt(url.searchParams.get('pg') || '1'));
    const pageSize = Math.max(1, Math.min(50, parseInt(url.searchParams.get('pagesize') || '20')));

    // 重建与 classes 相同顺序的选择器映射
    const selectors: Array<{ kind: 'movie' | 'tv'; category?: string; label?: string }> = [];
    doubanDefaults.movie.forEach((name) => selectors.push({ kind: 'movie', category: name }));
    doubanDefaults.tv.forEach((name) => selectors.push({ kind: 'tv', category: name }));
    custom.forEach((c) => selectors.push({ kind: c.type, label: c.query }));

    let kind: 'movie' | 'tv' = 'movie';
    let category = '';
    let label = '';
    let sort = '';

    if (tParam && tParam >= 1 && tParam <= selectors.length) {
      const sel = selectors[tParam - 1];
      kind = sel.kind;
      category = sel.category || '';
      label = sel.label || '';
    }
    if (wdParam) {
      label = wdParam;
    }

    const origin = url.origin;
    const qs = new URLSearchParams();
    qs.set('kind', kind);

    // 处理“热门/最新”：
    if (category === '最新') {
      sort = 'time';
      category = '';
      label = '';
      const year = new Date().getFullYear();
      qs.set('year', String(year));
    } else if (category === '热门') {
      category = '';
      label = '';
    }

    if (category) qs.set('category', category);
    if (label) qs.set('label', label);
    if (sort) qs.set('sort', sort);
    qs.set('start', String((pgParam - 1) * pageSize));
    qs.set('limit', String(pageSize));

    // 请求豆瓣推荐数据
    const resp = await fetch(`${origin}/api/douban/recommends?${qs.toString()}`);
    const data = await resp.json();
    const rawList = Array.isArray((data as any).list) ? (data as any).list : [];

    // 【修改点 2】：格式化输出列表，增加针对防盗链的图片转换
    const formattedList = rawList.map((item: any) => {
      let posterUrl = item.poster || item.cover || '';
      // 替换豆瓣原图域名，减少跨域防盗链导致的破图风险
      if (posterUrl) {
        posterUrl = posterUrl.replace('https://img1.doubanio.com', 'https://img.doubanio.com')
                             .replace('https://img3.doubanio.com', 'https://img.doubanio.com');
      }

      return {
        vod_id: item.id || item.vod_id,
        vod_name: item.title || item.vod_name,
        vod_pic: posterUrl,
        vod_year: item.year || '',
        vod_remarks: item.rate ? `豆瓣:${item.rate}` : (item.remarks || ''),
      };
    });

    // 【修改点 3】：无论是否有分类参数，都同时返回 class (分类) 和 list (海报墙)
    const payload = {
      code: 1,
      msg: 'success',
      page: pgParam,
      pagecount: 999,
      limit: pageSize,
      total: formattedList.length,
      class: classes,          // 保持分类列表输出
      list: formattedList,     // 输出渲染首页的海报列表
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=0`,
      },
    });

  } catch (e) {
    return NextResponse.json({ code: 0, msg: 'error', class: [], list: [] }, { status: 500 });
  }
}
