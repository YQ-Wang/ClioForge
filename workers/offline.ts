// A retired hosted installation has no application, storage or model bindings.
// Allow crawlers to observe 410 responses instead of blocking them in robots.txt.
const offline = {
  fetch(request: Request) {
    const robots = new URL(request.url).pathname === '/robots.txt';
    return new Response(
      request.method === 'HEAD'
        ? null
        : robots
          ? 'User-agent: *\nAllow: /\n'
          : 'Gone. This hosted service is no longer available.\n',
      {
        status: robots ? 200 : 410,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy':
            "default-src 'none'; frame-ancestors 'none'",
          'Referrer-Policy': 'no-referrer',
        },
      },
    );
  },
};

export default offline;
