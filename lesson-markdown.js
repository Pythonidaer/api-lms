/* Render Markdown without allowing source HTML, scripts, or unsafe URL schemes. */
window.LMSMarkdown = function (text) {
  const container = document.createElement('template');
  const renderer = new marked.Renderer();
  renderer.html = ({text}) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  container.innerHTML = marked.parse(String(text), { renderer, gfm: true, breaks: false });
  const allowed = new Set(['P','BR','STRONG','EM','DEL','CODE','PRE','BLOCKQUOTE','UL','OL','LI','H1','H2','H3','H4','H5','H6','HR','TABLE','THEAD','TBODY','TR','TH','TD','A','IMG']);
  for (const node of [...container.content.querySelectorAll('*')]) {
    if (!allowed.has(node.tagName)) { node.replaceWith(document.createTextNode(node.textContent)); continue; }
    const href = node.getAttribute('href'), src = node.getAttribute('src'), alt = node.getAttribute('alt');
    for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
    if (node.tagName === 'A' && href) {
      try { const url = new URL(href, location.href); if (['https:','http:'].includes(url.protocol)) { node.setAttribute('href', url.href); node.setAttribute('target','_blank'); node.setAttribute('rel','noopener noreferrer'); } } catch {}
    }
    if (node.tagName === 'IMG') node.replaceWith(document.createTextNode(alt || 'Diagram'));
  }
  return container.innerHTML;
};
