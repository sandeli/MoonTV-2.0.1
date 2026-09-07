/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

export const runtime = 'edge';

function getD1Binding(request?: Request): any {
  if (typeof process !== 'undefined' && process.env && process.env.DB) {
    return process.env.DB;
  }
  if (typeof (globalThis as any).DB !== 'undefined') {
    return (globalThis as any).DB;
  }
  if (request && (request as any).env && (request as any).env.DB) {
    return (request as any).env.DB;
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const db = getD1Binding(request);
    if (!db) {
      return NextResponse.json({ error: 'DB binding null' }, { status: 500 });
    }
    const { results } = await db.prepare('SELECT * FROM followings ORDER BY updated_at DESC').all();
    return NextResponse.json(results || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getD1Binding(request);

    if (!db) {
      return NextResponse.json({ error: 'D1 数据库未绑定' }, { status: 500 });
    }

    const rawBody = await request.json().catch(() => ({}));
    
    // 从 MoonTV 前端 payload 中层层提取数据实体
    const f = rawBody.following || rawBody.data || rawBody.item || rawBody;

    // 1. 优先从 following.id 提取，如无则解析 key (例如 "lovedan.net+201824" 中的 201824)
    let vod_id = String(f.id || f.vod_id || rawBody.vod_id || rawBody.id || '');
    if (!vod_id && rawBody.key && typeof rawBody.key === 'string' && rawBody.key.includes('+')) {
      vod_id = rawBody.key.split('+')[1] || '';
    }

    // 2. 提取名称 (title: "早春晴朗")
    const vod_name = String(f.title || f.vod_name || f.name || '');

    // 3. 提取图片 (cover: "https://...")
    const vod_pic = String(f.cover || f.vod_pic || f.pic || '');

    // 4. 提取更新情况 (例如 "18集")
    const vod_remarks = f.total_episodes 
      ? `全${f.total_episodes}集` 
      : String(f.vod_remarks || f.remark || '');

    // 5. 提取站点来源 (source: "lovedan.net")
    let source_key = String(f.source || f.source_key || f.source_name || '');
    if (!source_key && rawBody.key && typeof rawBody.key === 'string' && rawBody.key.includes('+')) {
      source_key = rawBody.key.split('+')[0] || 'default';
    }
    if (!source_key) source_key = 'default';

    const user_id = String(rawBody.user_id || f.user_id || 'default');

    if (!vod_id) {
      return NextResponse.json({ error: 'Missing vod_id', receivedPayload: rawBody }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);

    // 写入 Cloudflare D1 数据库
    await db
      .prepare(
        `INSERT OR REPLACE INTO followings 
         (user_id, source_key, vod_id, vod_name, title, vod_pic, cover, vod_remarks, remark, updated_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        user_id,
        source_key,
        vod_id,
        vod_name,
        vod_name,
        vod_pic,
        vod_pic,
        vod_remarks,
        vod_remarks,
        now
      )
      .run();

    return NextResponse.json({
      success: true,
      code: 200,
      message: '保存成功',
      data: { vod_id, vod_name }
    });
  } catch (e: any) {
    console.error('POST /api/followings Error:', e);
    return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
  }
}
