import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
    return new NextResponse(null, { status: 404 });
}

export async function HEAD() {
    return new NextResponse(null, { status: 404 });
}
