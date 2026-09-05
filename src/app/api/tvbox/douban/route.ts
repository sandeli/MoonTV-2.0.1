import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ac = url.searchParams.get("ac");
    const ids = url.searchParams.get("ids");

    // 抓取豆瓣官方推荐接口数据
    const res = await fetch("https://movie.douban.com/j/new_search_subjects?sort=U&range=0,20&tags=&playable=1&start=0&year_range=", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": "https://movie.douban.com/"
      },
      next: { revalidate: 3600 } // 缓存1小时，避免请求太快被豆瓣限制
    });
    const data = await res.json();
    const items = data.data || [];

    // 转换成 OK影视 能直接显示海报的 JSON 格式
    let list = items.map((item: any) => ({
      vod_id: item.id,
      vod_name: item.title,
      vod_pic: item.cover,
      vod_remarks: item.rate,
      vod_content: "【豆瓣官方高分影视】豆瓣仅提供信息展示。想看此片？请点击右下角的【搜】按钮，使用其他视频源立刻播放！",
      vod_play_from: "豆瓣官方推荐",
      vod_play_url: "使用全网搜索寻找播放源$#" 
    }));

    // 当用户在电视上点击海报时，返回影片的详细信息
    if (ac === "detail" && ids) {
      list = list.filter((item: any) => String(item.vod_id) === ids);
      if (list.length === 0) {
        list = [{
          vod_id: ids,
          vod_name: "豆瓣推荐影片",
          vod_pic: "",
          vod_remarks: "高分推荐",
          vod_play_from: "豆瓣官方",
          vod_play_url: "请使用全网搜索$#"
        }];
      }
    }

    return NextResponse.json({
      class: [{ type_id: "1", type_name: "豆瓣官方推荐" }],
      list: list
    });
  } catch (error) {
    return NextResponse.json({ class: [], list: [] });
  }
}
