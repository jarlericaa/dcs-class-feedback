const favicon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#0f766e"/>
  <path d="M19 20h26v7H27v7h15v7H27v11h-8V20Z" fill="#fff"/>
</svg>`.trim();

export function GET() {
  return new Response(favicon, {
    headers: {
      "cache-control": "public, max-age=86400",
      "content-type": "image/svg+xml; charset=utf-8",
    },
  });
}
