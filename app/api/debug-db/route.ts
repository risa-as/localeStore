import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";

export async function GET() {
  try {
    const rawUrl = process.env.DATABASE_URL || "";
    // Mask password in database URL for security
    const maskedUrl = rawUrl.replace(/:([^:@]+)@/, ":****@");

    // Query list of tables in public schema
    const tables = await prisma.$queryRaw<any[]>`
      SELECT table_name::text 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    const tableNames = tables.map((t) => t.table_name);

    // Query columns of the Product table if it exists
    let productColumns: string[] = [];
    if (tableNames.includes("Product")) {
      const columns = await prisma.$queryRaw<any[]>`
        SELECT column_name::text, data_type::text 
        FROM information_schema.columns 
        WHERE table_name = 'Product'
      `;
      productColumns = columns.map((c) => `${c.column_name} (${c.data_type})`);
    }

    return NextResponse.json({
      success: true,
      databaseUrl: maskedUrl,
      tables: tableNames,
      productColumns,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || String(error),
      stack: error.stack,
    }, { status: 500 });
  }
}
