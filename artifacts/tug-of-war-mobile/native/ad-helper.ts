const AD_UNIT_ID =
  process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID ??
  "ca-app-pub-3940256099942544/5224354917";

export async function initMobileAds(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: mobileAds } = require("react-native-google-mobile-ads");
    await mobileAds().initialize();
  } catch {
    // Native module absent (Expo Go) — ignore
  }
}

export async function loadRewardedAd(
  onEarnedReward: () => void,
  onError: () => void
): Promise<void> {
  let RewardedAd: {
    createForAdRequest: (id: string) => {
      addAdEventListener: (event: string, cb: (...args: unknown[]) => void) => void;
      show: () => void;
      load: () => Promise<void>;
    };
  };
  let RewardedAdEventType: { LOADED: string; EARNED_REWARD: string };
  let AdEventType: { CLOSED: string; ERROR: string };

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ads = require("react-native-google-mobile-ads");
    RewardedAd = ads.RewardedAd;
    RewardedAdEventType = ads.RewardedAdEventType;
    AdEventType = ads.AdEventType;
  } catch {
    // Native module absent (Expo Go) — fall back immediately
    onError();
    return;
  }

  const rewarded = RewardedAd.createForAdRequest(AD_UNIT_ID);
  let rewardEarned = false;

  rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
    rewarded.show();
  });

  rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
    rewardEarned = true;
    onEarnedReward();
  });

  // CLOSED lives in AdEventType (not RewardedAdEventType) in v16+
  rewarded.addAdEventListener(AdEventType.CLOSED, () => {
    if (!rewardEarned) {
      onError();
    }
  });

  rewarded.addAdEventListener(AdEventType.ERROR, () => {
    if (!rewardEarned) {
      onError();
    }
  });

  try {
    await rewarded.load();
  } catch {
    onError();
  }
}
