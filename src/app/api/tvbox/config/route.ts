import { NextResponse } from 'next/server';
import { getSystemConfig } from '@/lib/config';

export async function GET(request: Request) {
  try {
    const config = await getSystemConfig();
    const host = request.headers.get("host") || "";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const baseUrl = `${protocol}://${host}`;

    // 获取内部所有的视频源站点配置
    const sites = (config?.sites || []).map((site: any) => ({
      key: site.id || site.key,
      name: site.name,
      type: 1, // 苹果 CMS / M3U8 JSON 标准源格式
      api: `${baseUrl}/api/tvbox`,
      searchable: 1,
      quickSearch: 1,
      filterable: 1,
      ext: site.id || site.key
    }));

    // 构建标准 TVBox 订阅 JSON 配置文件
    const tvboxConfig = {
      spider: "",
      wallpaper: "https://pic.rmb.bdstatic.com/bjh/1d4b0ed7d018d9600e1e2d43105ff761.jpeg",
      
      // ==========================================
      // 👇【新增】：豆瓣官方推荐海报墙配置
      // ==========================================
      recommend: [
        {
          name: "豆瓣热门电影",
          request: {
            method: "GET",
            header: [
              {
                key: "Referer",
                value: "https://movie.douban.com/"
              },
              {
                key: "User-Agent",
                value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              }
            ],
            url: {
              raw: "https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&sort=recommend&page_limit=30&page_start=0"
            }
          },
          mapping: {
            list: "subjects",
            id: "id",
            name: "title",
            pic: "cover",
            remarks: "rate"
          },
          expires: "86400"
        },
        {
          name: "豆瓣热门电视剧",
          request: {
            method: "GET",
            header: [
              {
                key: "Referer",
                value: "https://movie.douban.com/"
              },
              {
                key: "User-Agent",
                value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              }
            ],
            url: {
              raw: "https://movie.douban.com/j/search_subjects?type=tv&tag=%E7%83%AD%E9%97%A8&sort=recommend&page_limit=30&page_start=0"
            }
          },
          mapping: {
            list: "subjects",
            id: "id",
            name: "title",
            pic: "cover",
            remarks: "rate"
          },
          expires: "86400"
        },
        {
          name: "豆瓣热门综艺",
          request: {
            method: "GET",
            header: [
              {
                key: "Referer",
                value: "https://movie.douban.com/"
              },
              {
                key: "User-Agent",
                value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              }
            ],
            url: {
              raw: "https://movie.douban.com/j/search_subjects?type=tv&tag=%E7%BB%BC%E8%8B%B1&sort=recommend&page_limit=30&page_start=0"
            }
          },
          mapping: {
            list: "subjects",
            id: "id",
            name: "title",
            pic: "cover",
            remarks: "rate"
          },
          expires: "86400"
        },
        {
          name: "豆瓣热门动漫",
          request: {
            method: "GET",
            header: [
              {
                key: "Referer",
                value: "https://movie.douban.com/"
              },
              {
                key: "User-Agent",
                value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              }
            ],
            url: {
              raw: "https://movie.douban.com/j/search_subjects?type=tv&tag=%E5%8A%A8%E6%BC%AB&sort=recommend&page_limit=30&page_start=0"
            }
          },
          mapping: {
            list: "subjects",
            id: "id",
            name: "title",
            pic: "cover",
            remarks: "rate"
          },
          expires: "86400"
        }
      ],

      sites: sites,
      lives: [
        {
          name: "CCTV & 卫视直播",
          type: 0,
          url: "https://raw.githubusercontent.com/fanmingming/live/main/tv/m3u/ipv6.m3u",
          playerType: 1
        }
      ]
    };

    return NextResponse.json(tvboxConfig, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    console.error('Failed to generate TVBox config:', error);
    return NextResponse.json(
      { error: 'Failed to generate config' },
      { status: 500 }
    );
  }
}
