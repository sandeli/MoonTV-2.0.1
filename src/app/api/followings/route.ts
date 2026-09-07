/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';

export const runtime = 'edge';

/**
 * 兼容全环境（Pages / Workers / Edge）获取 D1 数据库句柄
 */
function getD1Binding(request?: Request): any {
  // 1. process.env.DB
  if (typeof process !== 'undefined' && process.env && process.env.DB) {
    return process.env.DB;
  }
  // 2. globalThis.DB
  if (typeof (globalThis as any).DB !== 'undefined') {
    return (globalThis as any).DB;
  }
  // 3. Request 上下文
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
      console.error('D1 Error: DB Binding Fail');
      return NextResponse.json({ error: 'D1 数据库未挂载，请检查 CF 绑定设置' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));

    // 提取并兜底所有入参字段，避免 SQLite 类型转换报错
    const vod_id = String(body.vod_id || body.id || '');
    const vod_name = String(body.vod_name || body.title || body.name || '');
    const vod_pic = String(body.vod_pic || body.cover || body.pic || '');
    const vod_remarks = String(body.vod_remarks || body.remark || '');
    const source_key = String(body.source_key || body.source || 'default');
    const user_id = String(body.user_id || 'default');

    if (!vod_id) {
      return NextResponse.json({ error: 'Missing vod_id' }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);

    // 使用 SQLite 最通用的 REPLACE 语法，彻底避免 ON CONFLICT 索引崩溃问题
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

    return NextResponse.json({ success: true, code: 200, message: 'Saved successfully' });
  } catch (e: any) {
    console.error('POST /api/followings Error Details:', e);
    return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
  }
}
