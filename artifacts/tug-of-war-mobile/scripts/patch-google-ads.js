const fs = require('fs');
const path = require('path');

const pkgJsonPath = path.join(
  __dirname, '..', 'node_modules', 'react-native-google-mobile-ads', 'package.json'
);

if (!fs.existsSync(pkgJsonPath)) {
  console.log('[patch-google-ads] react-native-google-mobile-ads not found, skipping');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
const currentVersion = pkg.sdkVersions?.android?.googleMobileAds;

if (currentVersion === '24.9.0') {
  console.log('[patch-google-ads] already patched');
} else {
  pkg.sdkVersions.android.googleMobileAds = '24.9.0';
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`[patch-google-ads] patched googleMobileAds ${currentVersion} -> 24.9.0`);
}

const baseDir = path.join(__dirname, '..', 'node_modules', 'react-native-google-mobile-ads',
  'android', 'src', 'main', 'java', 'io', 'invertase', 'googlemobileads');

// --- 1. Patch Kotlin: AgeRestrictedTreatment (added in 25.x) ---
const ktPath = path.join(baseDir, 'ReactNativeGoogleMobileAdsModule.kt');
if (fs.existsSync(ktPath)) {
  let kt = fs.readFileSync(ktPath, 'utf8');

  if (kt.includes('import com.google.android.gms.ads.AgeRestrictedTreatment')) {
    kt = kt.replace('import com.google.android.gms.ads.AgeRestrictedTreatment\n', '');
    console.log('[patch-google-ads] removed AgeRestrictedTreatment import');
  }

  const oldBlock = `    if (requestConfiguration.hasKey("ageRestrictedTreatment")) {
      val ageRestrictedTreatment = requestConfiguration.getString("ageRestrictedTreatment")

      when (ageRestrictedTreatment) {
        "CHILD" -> builder.setAgeRestrictedTreatment(AgeRestrictedTreatment.CHILD)
        "TEEN" -> builder.setAgeRestrictedTreatment(AgeRestrictedTreatment.TEEN)
        "UNSPECIFIED" -> builder.setAgeRestrictedTreatment(AgeRestrictedTreatment.UNSPECIFIED)
      }
    }`;

  const newBlock = `    // ageRestrictedTreatment API is only available in Google Mobile Ads SDK 25.x+
    // Skipped for SDK 24.9.0 compatibility`;

  if (kt.includes(oldBlock)) {
    kt = kt.replace(oldBlock, newBlock);
    fs.writeFileSync(ktPath, kt);
    console.log('[patch-google-ads] replaced ageRestrictedTreatment block with no-op');
  } else {
    console.log('[patch-google-ads] ageRestrictedTreatment block already patched or not found');
  }
}

// --- 2. Patch Java: getLargeAnchoredAdaptiveBannerAdSize (added in 25.x) ---
const javaPath = path.join(baseDir, 'ReactNativeGoogleMobileAdsCommon.java');
if (fs.existsSync(javaPath)) {
  let java = fs.readFileSync(javaPath, 'utf8');

  const oldJava = 'AdSize.getLargeAnchoredAdaptiveBannerAdSize(reactViewGroup.getContext(), adWidth)';
  const newJava = 'AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(reactViewGroup.getContext(), adWidth)';

  if (java.includes(oldJava)) {
    java = java.replace(oldJava, newJava);
    fs.writeFileSync(javaPath, java);
    console.log('[patch-google-ads] replaced getLargeAnchoredAdaptiveBannerAdSize with getCurrentOrientationAnchoredAdaptiveBannerAdSize');
  } else {
    console.log('[patch-google-ads] getLargeAnchoredAdaptiveBannerAdSize already patched or not found');
  }
}
