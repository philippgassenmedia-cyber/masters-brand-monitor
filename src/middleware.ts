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
  // Safety net: never let an unhandled error here surface as a 500 to the user.
  try {
    return await runMiddleware(request);
  } catch {
    return NextResponse.next({ request });
  }
}

async function runMiddleware(request: NextRequest) {
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

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  // Unauthenticated → send to login (except public paths)
  if (!user) {
    if (isPublic(pathname)) return response;
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated user on login/register → send to dashboard
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Check approval for all non-public paths (skip /pending itself to avoid loop)
  if (!isPublic(pathname) && pathname !== "/pending") {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("approved")
        .eq("id", user.id)
        .maybeSingle();

      // Only gate if profile exists and is explicitly unapproved.
      // Fail open on DB errors (e.g. table not yet migrated).
      if (!error && profile !== null && !profile.approved) {
        return NextResponse.redirect(new URL("/pending", request.url));
      }
    } catch {
      // Fail open — let the request through if the profiles check crashes.
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
