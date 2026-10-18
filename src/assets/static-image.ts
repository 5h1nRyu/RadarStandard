/** Reject independently animated image formats: every visible effect needs a clock. */
export async function checkStaticImage(url: string, path: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`素材读取失败：${path}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  const animated = () => {
    throw new Error(
      `素材 ${path} 含有独立动画，请改用静态图片，或放入由时间轴控制的主题视频／代码背景`,
    );
  };
  if (ascii(0, 3) === 'GIF') animated();
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return;
  if (ascii(1, 4) === 'PNG') {
    const view = new DataView(bytes.buffer);
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      if (ascii(offset + 4, offset + 8) === 'acTL') animated();
      offset += length + 12;
    }
    return;
  }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    const view = new DataView(bytes.buffer);
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const type = ascii(offset, offset + 4),
        length = view.getUint32(offset + 4, true);
      if (type === 'ANIM' || type === 'ANMF') animated();
      offset += 8 + length + (length % 2);
    }
    return;
  }
  const text = new TextDecoder().decode(bytes);
  if (/<svg\b/i.test(text)) {
    if (
      /<(?:[\w-]+:)?(?:animate\w*|set|script|foreignObject)\b|@keyframes|\banimation\s*[:=]|\btransition\s*[:=]|data:image\/(?:gif|webp)/i.test(
        text,
      )
    )
      animated();
    return;
  }
  throw new Error(`不支持的图片格式：${path}。请使用静态 PNG、JPEG、WebP 或 SVG`);
}
