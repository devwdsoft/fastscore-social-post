// HTML for the 1080x1350 post image (same look as the Ronaldo post designed on the canvas).

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function cardHtml({ card, imageDataUri, brand }) {
  const accent = brand.color;
  const [brandA, ...brandRest] = brand.name.split(' ');
  const stats = (card.stats || []).slice(0, 3);
  const joined = brand.name.replace(/\s+/g, '').toLowerCase();
  const logoText = joined.charAt(0).toUpperCase() + joined.slice(1);
  const photo = imageDataUri
    ? `<img src="${imageDataUri}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 20%">`
    : `<div style="position:absolute;inset:0;background:repeating-linear-gradient(135deg,#16161A 0 40px,#1B1B20 40px 80px)"></div>
       <div style="position:absolute;right:-40px;bottom:120px;font-family:Arial,'Liberation Sans',Helvetica,sans-serif;font-weight:900;font-size:340px;line-height:1;color:${accent};opacity:.18">${esc(brandA)}</div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>
*{box-sizing:border-box}
body{margin:0;width:1080px;height:1350px;background:#0E0E10;color:#fff;font-family:Arial,'Liberation Sans',Helvetica,sans-serif;overflow:hidden}
.tag{font-family:Arial,'Liberation Sans',Helvetica,sans-serif;font-weight:700;font-size:28px;letter-spacing:3px;padding:10px 18px}
.cond{font-family:Arial,'Liberation Sans',Helvetica,sans-serif;font-weight:700}
.anton{font-family:Arial,'Liberation Sans',Helvetica,sans-serif;font-weight:900}
</style></head><body>
<div style="width:1080px;height:1350px;display:flex;flex-direction:column;position:relative">
  <div style="height:720px;position:relative;flex-shrink:0;background:#1C1C20">
    ${photo}
    <div style="position:absolute;left:0;right:0;top:0;height:160px;background:linear-gradient(to bottom,rgba(14,14,16,.55),rgba(14,14,16,0))"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:220px;background:linear-gradient(to bottom,rgba(14,14,16,0),#0E0E10)"></div>
    <div style="position:absolute;top:40px;left:56px;display:flex;gap:12px">
      <div class="tag" style="background:${accent}">${esc(card.label).toUpperCase()}</div>
      ${card.competition ? `<div class="tag" style="background:#fff;color:#0E0E10">${esc(card.competition).toUpperCase()}</div>` : ''}
    </div>
    <div style="position:absolute;top:40px;right:56px;display:flex;align-items:center;gap:8px;font-family:Arial,'Liberation Sans',Helvetica,sans-serif;font-weight:900;font-size:34px;line-height:1.1;letter-spacing:0.5px;background:${accent};color:#FFFFFF;border:3px solid #FFFFFF;border-radius:10px;padding:5px 18px 5px ${brand.iconDataUri ? 6 : 18}px">${brand.iconDataUri ? `<img src="${brand.iconDataUri}" style="width:36px;height:36px;display:block">` : ''}${esc(logoText)}</div>
  </div>

  <div id="content" style="height:690px;display:flex;flex-direction:column;gap:28px;padding:0 56px 48px;margin-top:-60px;position:relative;overflow:hidden">
    <h1 id="headline" class="anton" style="margin:0;font-size:112px;line-height:.98;letter-spacing:-1px;text-transform:uppercase">${esc(card.headline_main)} <span style="color:${accent}">${esc(card.headline_accent)}</span></h1>
    <p id="sub" style="margin:0;font-size:36px;line-height:1.3;color:#D6D6DB;font-weight:500;max-width:940px">${esc(card.subheadline)}</p>
    ${
      card.quote
        ? `<div style="display:flex;gap:20px">
      <div style="width:8px;background:${accent};flex-shrink:0"></div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <div id="quote" class="cond" style="font-size:44px;line-height:1.1">“${esc(card.quote.text)}”</div>
        <div style="font-size:26px;color:#A9A9B2;font-weight:500">${esc(card.quote.by)}</div>
      </div></div>`
        : ''
    }
    <div style="margin-top:auto;display:flex;flex-direction:column;gap:20px">
      ${
        stats.length
          ? `<div style="display:grid;grid-template-columns:repeat(${stats.length},minmax(0,1fr));border-top:2px solid #2C2C32;padding-top:28px">
        ${stats
          .map(
            (s) => `<div style="display:flex;flex-direction:column;gap:4px">
          <div class="anton" style="font-size:72px;line-height:1">${esc(s.value)}</div>
          <div class="cond" style="font-size:26px;letter-spacing:2px;color:#A9A9B2">${esc(s.label).toUpperCase()}</div></div>`
          )
          .join('')}
      </div>`
          : `<div style="border-top:2px solid #2C2C32"></div>`
      }
      <div class="cond" style="display:flex;justify-content:space-between;font-size:26px;letter-spacing:1px;color:#A9A9B2">
        <div>${esc(card.footer).toUpperCase()}</div><div style="color:#fff">${esc(brand.hashtag)}</div>
      </div>
    </div>
  </div>
</div>
<script>
// Shrink text until everything fits in the lower panel.
window.fitText = () => {
  const box = document.getElementById('content');
  const shrink = (id, min, step) => {
    const el = document.getElementById(id); if (!el) return;
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (box.scrollHeight > box.clientHeight && size > min) { size -= step; el.style.fontSize = size + 'px'; }
  };
  shrink('headline', 72, 4); shrink('quote', 30, 2); shrink('sub', 26, 2);
  if (box.scrollHeight > box.clientHeight) { const q = document.getElementById('quote'); if (q) q.parentElement.parentElement.remove(); }
};
</script>
</body></html>`;
}
