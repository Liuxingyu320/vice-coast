export function panoramaURL(href) {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  return url.href;
}
