export function contrastRatio(foreground: string, background: string) {
  const channels = (value: string) => {
    const parts = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (!parts || parts.length !== 3) throw new Error(`RGB 색상을 해석할 수 없습니다: ${value}`);
    return parts.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
  };
  const luminance = (value: string) => {
    const [red, green, blue] = channels(value);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}
