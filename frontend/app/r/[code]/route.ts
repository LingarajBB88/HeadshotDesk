import { NextResponse, type NextRequest } from "next/server";

/**
 * Referral link entry point: headshotdesk.com/r/ABC123
 *
 * The share link points at the frontend because that's the domain people
 * recognise and will actually paste into a message. The click still has to
 * be recorded server-side, so this hands straight off to the API, which
 * logs it, sets the attribution cookie, and redirects on to signup.
 *
 * Doing it in one hop means the cookie is set on the API domain where the
 * signup request will read it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  // NextResponse.redirect rather than redirect(): this leaves the app's
  // typed-route space entirely, and typedRoutes rightly refuses to type an
  // external URL.
  return NextResponse.redirect(
    `${api}/api/v1/public/r/${encodeURIComponent(code)}`,
  );
}
