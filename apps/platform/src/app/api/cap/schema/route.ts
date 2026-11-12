import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const ddlPath = path.join(process.cwd(), 'db', 'cap_table_409a_schema.sql');
    const sql = fs.readFileSync(ddlPath, 'utf8');
    return NextResponse.json({ sql });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load SQL schema.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
