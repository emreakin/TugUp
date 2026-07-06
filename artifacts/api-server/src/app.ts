import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.set("trust proxy", true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Privacy Policy — required by Google Play + AdMob
app.get("/api/privacy-policy", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gizlilik Politikası | TugUp</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.7;color:#1f2937}
    h1{color:#0f172a;border-bottom:2px solid #0ea5e9;padding-bottom:10px}
    h2{color:#374151;margin-top:32px;font-size:1.15rem}
    a{color:#0ea5e9}
    .date{color:#6b7280;font-size:0.9rem;margin-bottom:24px}
    .lang-switch{text-align:right;margin-bottom:16px;font-size:0.85rem}
  </style>
</head>
<body>
  <div class="lang-switch"><a href="/privacy-policy?lang=en">English</a></div>
  <h1>Gizlilik Politikası</h1>
  <p class="date">Son güncelleme: 20 Mayıs 2026</p>

  <p>Bu gizlilik politikası, <strong>TugUp</strong> mobil uygulamasının kullanıcı verilerini nasıl topladığını, kullandığını ve koruduğunu açıklar.</p>

  <h2>1. Toplanan Veriler</h2>
  <ul>
    <li><strong>Cihaz IP adresi</strong> — oylama sınırlandırması (saatte 1 oy) için geçici olarak kaydedilir.</li>
    <li><strong>Cihaz tanımlayıcıları</strong> — Google AdMob reklamları tarafından toplanabilir.</li>
    <li><strong>Oylama tercihleri</strong> — oyun deneyimini sağlamak için anonim olarak saklanır.</li>
  </ul>

  <h2>2. Üçüncü Taraf Hizmetleri</h2>
  <p>Uygulama, <strong>Google AdMob</strong> reklam ağı kullanır. AdMob, cihaz kimliği ve kullanım verileri toplayarak kişiselleştirilmiş reklamlar sunabilir. AdMob'un gizlilik politikası için <a href="https://policies.google.com/privacy" target="_blank">Google Privacy Policy</a> sayfasına bakabilirsiniz.</p>

  <h2>3. Çocuklar için Değil</h2>
  <p>Bu uygulama 13 yaş altı çocuklar için tasarlanmamıştır. Bilerek 13 yaş altı kullanıcılardan veri toplamayız.</p>

  <h2>4. Veri Saklama</h2>
  <p>IP adresi kayıtları haftalık olarak silinir. Oylama verileri oyun istatistikleri için anonim olarak saklanabilir.</p>

  <h2>5. İletişim</h2>
  <p>Herhangi bir sorunuz varsa lütfen uygulama içindeki geri bildirim özelliğini kullanın.</p>
</body>
</html>`);
});

export default app;
