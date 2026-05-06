import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/pending",
  "/api/agent/config",
  "/_next",
  "/favicon",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  // getUser() requires a Supabase network round-trip on every request — too slow for Edge.
  // getSession() reads the session from the cookie (no network) and is safe for routing decisions.
  // Actual server components and API routes still use getUser() for real authorization.
  try {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (toSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
            toSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            toSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]),
            );
          },
        },
      },
    );

    // getSession() is local — reads from cookie, no network call.
    const { data: { session } } = await supabase.auth.getSession();
    const { pathname } = request.nextUrl;

    // Unauthenticated → redirect to login (except public paths)
    if (!session) {
      if (isPublic(pathname)) return response;
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Authenticated on login/register → redirect to dashboard
    if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return response;
  } catch {
    // If anything unexpected throws (e.g. missing env vars during cold start),
    // allow the request through — page-level auth will catch it.
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
