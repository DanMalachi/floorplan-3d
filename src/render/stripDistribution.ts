/** A continuous line source blurred by a broad diffuser. Unlike a row of
 * bulbs or a rectangular stencil, this has no separate pools or hard edge. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  return sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
}

export function stripDistribution(length: number, height: number) {
  const sigma = Math.max(0.25, height * 0.75);
  const half = Math.max(length / 2, 0.05);
  const fillSigma = sigma * 2;
  const radius = half + fillSigma * 3.5;
  const line = (x: number, y: number, spread: number) => {
    const scale = Math.SQRT2 * spread;
    const peak = Math.max(1e-6, 2 * erf(half / scale));
    return (erf((x + half) / scale) - erf((x - half) / scale)) / peak * Math.exp(-0.5 * (y / spread) ** 2);
  };
  return {
    radius,
    sample: (x: number, y: number) => {
      // The diffuser has broad wings: useful room fill beyond the brighter
      // band under the strip, without adding omnidirectional fill lights.
      const radiance = 0.75 * line(x, y, sigma) + 0.25 * line(x, y, fillSigma);
      // Reach zero before the spotlight's circular support boundary. The
      // useful part of the beam remains the smooth, elongated line integral.
      const t = Math.max(0, Math.min(1, (radius - Math.hypot(x, y)) / (radius * 0.15)));
      return Math.max(0, radiance * t * t * (3 - 2 * t));
    },
  };
}
