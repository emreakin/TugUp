// Web fallback — no-op. Real implementation lives in ad-helper.ts (native).
export function getBannerAdUnitId(): string {
  return "";
}

export async function initMobileAds(): Promise<void> {}

export async function loadRewardedAd(
  _onEarnedReward: () => void,
  onError: () => void
): Promise<void> {
  onError();
}
