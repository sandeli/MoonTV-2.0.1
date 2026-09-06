import { NextRequest, NextResponse } from 'next/server';

// 引入 MoonTV 本地配置或豆瓣接口处理模块
import config from '../../../../config.json';

// 1. 辅助函数：从豆瓣获取热映/热门影视海报墙数据
async function getDoubanHotList() {
  try {
    // 调取豆瓣热门电影及电视剧数据 (使用豆瓣或 MoonTV 内置的代理源)
    const doubanProxy = process.env.NEXT_PUBLIC_DOUBAN_PROXY || 'https://movie.douban.com';
    const res = await fetch(
      `${doubanProxy}/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&page_limit=20&page_start=0`,
      { next: { revalidate: 3600 } } // 缓存1小时
    );
    const data = await res.json();

    if (!data || !data.subjects) return [];

    // 将豆瓣返回数据映射为 TVBox 标准 vod 格式
    return data.subjects.map((item: any) => {
      // 图片处理：替换豆瓣原图域名以防 referrer 防盗链导致破图
      let imgUrl = item.cover;
      if (imgUrl) {
        imgUrl = imgUrl.replace('https://img1.doubanio.com', 'https://img.doubanio.com')
                       .replace('https://img3.doubanio.com', 'https://img.doubanio.com');
      }

      return {
        vod_id: `douban_${item.id}`,
        vod_name: item.title,
        vod_pic: imgUrl, // 豆瓣高清海报
        vod_remarks: item.rate ? `豆瓣评分: ${item.rate}` : '热门推荐',
        style: { type: 'rect', ratio: 1.33 }
      };
    });
  } catch (error) {
    console.error('Failed to fetch Douban hot list:', error);
    return [];
  }
}

// 2. GET 主逻辑入口
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ac = searchParams.get('ac');
  const t = searchParams.get('t'); // 分类 ID
  const wd = searchParams.get('wd'); // 搜索关键词
  const pwd = searchParams.get('pwd');

  // 口令/密码校验逻辑（按原项目逻辑保持）
  const expectedPassword = process.env.PASSWORD;
  if (expectedPassword && pwd !== expectedPassword) {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 });
  }

  // -------------------------------------------------------------
  // 场景 A: TVBox 首页请求 / 首页推荐墙 (当未指定分类且未在搜索时)
  // -------------------------------------------------------------
  if (!t && !wd && (!ac || ac === 'detail' || ac === 'home')) {
    const doubanWallList = await getDoubanHotList();

    // 拼装分类 (Class)
    const categories = [
      { type_id: '1', type_name: '电影' },
      { type_id: '2', type_name: '电视剧' },
      { type_id: '3', type_name: '综艺' },
      { type_id: '4', type_name: '动漫' },
    ];

    return NextResponse.json({
      code: 1,
      msg: '数据列表',
      page: 1,
      pagecount: 1,
      limit: 20,
      total: doubanWallList.length,
      class: categories, // 顶部分类菜单
      list: doubanWallList // 首页豆瓣海报墙数据
    });
  }

  // -------------------------------------------------------------
  // 场景 B: 搜索或分类过滤逻辑 (保持 MoonTV 默认的苹果 CMS 聚合逻辑)
  // -------------------------------------------------------------
  // ... 原有根据 wd 搜索或根据 t 查询分类的逻辑继续保留在下方 ...
  
  return NextResponse.json({ list: [] });
}
