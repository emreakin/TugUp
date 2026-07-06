// Web fallback — no-op. Real implementation lives in ad-helper.native.ts.
export async function loadRewardedAd(
  _onEarnedReward: () => void,
  onError: () => void
): Promise<void> {
  onError();
}
