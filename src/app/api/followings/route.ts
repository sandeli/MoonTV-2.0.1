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
    
    // 兼容可能存在的嵌套对象 (比如 { data: { ... } } 或 { item: { ... } })
    const body = rawBody.data || rawBody.item || rawBody.detail || rawBody;

    // 尽量从各种可能的 key 中提取 vod_id
    const vod_id = String(
      body.vod_id || 
      body.id || 
      body.vodId || 
      body.target_id || 
      rawBody.vod_id || 
      rawBody.id || 
      ''
    );

    // 提取剧集名称
    const vod_name = String(
      body.vod_name || 
      body.title || 
      body.name || 
      body.vodName || 
      rawBody.vod_name || 
      ''
    );

    // 提取封面图片
    const vod_pic = String(
      body.vod_pic || 
      body.cover || 
      body.pic || 
      body.poster || 
      body.vodPic || 
      rawBody.vod_pic || 
      ''
    );

    // 提取备注/更新集数
    const vod_remarks = String(
      body.vod_remarks || 
      body.remark || 
      body.remarks || 
      body.vodRemarks || 
      rawBody.vod_remarks || 
      ''
    );

    // 提取资源来源 key
    const source_key = String(
      body.source_key || 
      body.source || 
      body.sourceKey || 
      rawBody.source_key || 
      'default'
    );

    const user_id = String(body.user_id || rawBody.user_id || 'default');

    // 校验：如果实在没拿到 id，记录日志并抛错
    if (!vod_id) {
      console.error('Missing vod_id Payload Received:', JSON.stringify(rawBody));
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
