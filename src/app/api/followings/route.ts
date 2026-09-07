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

// 1. GET: 获取追更列表
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

// 2. POST: 添加 / 保存追更
export async function POST(request: Request) {
  try {
    const db = getD1Binding(request);
    if (!db) {
      return NextResponse.json({ error: 'D1 数据库未绑定' }, { status: 500 });
    }

    const rawBody = await request.json().catch(() => ({}));
    const f = rawBody.following || rawBody.data || rawBody.item || rawBody;

    let vod_id = String(f.id || f.vod_id || rawBody.vod_id || rawBody.id || '');
    if (!vod_id && rawBody.key && typeof rawBody.key === 'string' && rawBody.key.includes('+')) {
      vod_id = rawBody.key.split('+')[1] || '';
    }

    const vod_name = String(f.title || f.vod_name || f.name || '');
    const vod_pic = String(f.cover || f.vod_pic || f.pic || '');
    const vod_remarks = f.total_episodes 
      ? `全${f.total_episodes}集` 
      : String(f.vod_remarks || f.remark || '');

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

// 3. DELETE: 取消 / 删除追更
export async function DELETE(request: Request) {
  try {
    const db = getD1Binding(request);
    if (!db) {
      return NextResponse.json({ error: 'D1 数据库未绑定' }, { status: 500 });
    }

    const url = new URL(request.url);
    const rawBody = await request.json().catch(() => ({}));

    // 支持从 Body 字段、URL Query 参数或组合 key 中匹配需要删除的记录
    const f = rawBody.following || rawBody.data || rawBody.item || rawBody;
    let vod_id = String(
      f.id || 
      f.vod_id || 
      rawBody.vod_id || 
      rawBody.id || 
      url.searchParams.get('vod_id') || 
      url.searchParams.get('id') || 
      ''
    );

    let source_key = String(
      f.source || 
      f.source_key || 
      rawBody.source_key || 
      url.searchParams.get('source_key') || 
      ''
    );

    // 解析组合键 (如 "lovedan.net+201824")
    const key = rawBody.key || url.searchParams.get('key') || '';
    if (key && typeof key === 'string' && key.includes('+')) {
      const parts = key.split('+');
      if (!source_key) source_key = parts[0];
      if (!vod_id) vod_id = parts[1];
    }

    const user_id = String(rawBody.user_id || url.searchParams.get('user_id') || 'default');

    if (!vod_id) {
      return NextResponse.json({ error: 'Missing vod_id for deletion' }, { status: 400 });
    }

    // 根据条件安全删除 D1 存储中的数据
    if (source_key) {
      await db
        .prepare('DELETE FROM followings WHERE user_id = ? AND source_key = ? AND vod_id = ?')
        .bind(user_id, source_key, vod_id)
        .run();
    } else {
      await db
        .prepare('DELETE FROM followings WHERE user_id = ? AND vod_id = ?')
        .bind(user_id, vod_id)
        .run();
    }

    return NextResponse.json({
      success: true,
      code: 200,
      message: '删除成功'
    });
  } catch (e: any) {
    console.error('DELETE /api/followings Error:', e);
    return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
  }
}
