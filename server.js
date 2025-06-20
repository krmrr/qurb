const https = require("https");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const webrtc = require("wrtc");
const cors = require("cors");
const fs = require('fs');


process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let senderStream = null;
let senderPeer = null;

const consumers = new Set();

const options = {
    key: fs.readFileSync("192.168.4.1-key.pem"),
    cert: fs.readFileSync("192.168.4.1.pem"),
};

app.set("view engine", "ejs"); // EJS'yi view engine olarak ayarlayın
app.set("views", __dirname + "/views"); // views klasörünü ayarla
app.use(express.static(__dirname + "/public"));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));


app.get("/", (req, res) => {
    res.render("index"); // views/index.ejs dosyasını render eder
});

app.use(cors());

// HTTPS üzerinden çalışan rotalar
app.get("/broadcast", (req, res) => {
    res.render("rehber"); // views/rehber.ejs dosyasını render eder
});

app.get("/check-pin", (req, res) => {
    const userPin = req.query.pin; // URL query parametre olarak gönderilen PIN
    console.log("Received PIN:", userPin); // Gelen PIN'i logla

    // Pin dosyasının yolu manuel olarak verildi
    const pinFilePath = "/home/ubuntu/wifi_port_manager/pin.json"; // Manuel dosya yolu
    console.log("Reading PIN file from:", pinFilePath); // Pin dosyasının yolunu logla

    try {
        // PIN dosyasını senkron şekilde oku
        const data = fs.readFileSync(pinFilePath, 'utf8');
        console.log("PIN file contents:", data); // Dosyanın içeriğini logla

        const pinData = JSON.parse(data); // JSON verisini parse et
        console.log("Parsed PIN data:", pinData); // Parse edilen veriyi logla

        // PIN kontrolü
        if (pinData.pin.toString() === userPin) {
            console.log("PIN is valid."); // PIN doğruysa logla
            res.json({valid: true});
        } else {
            console.log("Invalid PIN."); // PIN yanlışsa logla
            res.json({valid: false});
        }
    } catch (err) {
        console.error("Error reading or parsing PIN file:", err); // Hata varsa logla
        return res.status(500).json({valid: false, message: "Error reading or parsing pin file"});
    }
});


app.post("/consumer", async ({ body }, res) => {
  try {
    const peer = new webrtc.RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:127.0.0.1:3478",
        },
      ],
    });

    const desc = new webrtc.RTCSessionDescription(body.sdp);
    await peer.setRemoteDescription(desc);

    senderStream
      .getTracks()
      .forEach((track) => peer.addTrack(track, senderStream));

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    // Yeni consumer'ı set'e ekle
    consumers.add(peer);

    // Bağlantı kapandığında veya sorun yaşandığında set'ten çıkar
    peer.onconnectionstatechange = () => {
      if (
        peer.connectionState === "closed" ||
        peer.connectionState === "failed" ||
        peer.connectionState === "disconnected"
      ) {
        consumers.delete(peer);
        console.log("Consumer bağlantısı kapandı, güncel sayi:", consumers.size);
      }
    };

    const payload = {
      sdp: peer.localDescription,
    };

    res.json(payload);
  } catch (error) {
    console.error("Error in /consumer:", error);
    res.status(500).json({ error: "Failed to create consumer connection." });
  }
});

app.post("/broadcast", async ({body}, res) => {
    try {
        const peer = new webrtc.RTCPeerConnection({
            iceServers: [
                {
                    urls: "stun:192.168.4.1:3478", // STUN sunucu adresi
                },
            ],
            encodings: [
                {
                    payloadType: 111,
                    maxBitrate: 64000,
                    codecOptions: {
                        "opusStereo": "false", // Stereo'yu kapatarak mono ses iletilebilir
                        "opusFec": "false",    // FEC (Forward Error Correction) kullanımını kapatır
                        "opusDtx": "true",     // DTX (Discontinuous Transmission) kullanımı, sessizlikte veri gönderimi durdurur
                        "sampleRate": 32000,   // 32 kHz örnekleme hızı
                    },
                },
            ],
        });

        peer.ontrack = (e) => handleTrackEvent(e, peer);

        const desc = new webrtc.RTCSessionDescription(body.sdp);
        await peer.setRemoteDescription(desc);

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        const payload = {
            sdp: peer.localDescription,
        };

        res.json(payload);
    } catch (error) {
        console.error("Error in /broadcast:", error);
        res.status(500).json({error: "Failed to create broadcast connection."});
    }
});

app.get("/broadcast-status", (req, res) => {
    if (senderStream && senderStream.active) {
        res.json({ broadcasting: true });
    } else {
        res.json({ broadcasting: false });
    }
});


app.post("/stop-broadcast", (req, res) => {
  try {
    if (senderStream) {
      senderStream.getTracks().forEach(track => track.stop());
      senderStream = null;
      console.log("Yayın durduruldu.");
      return res.json({ success: true, message: "Yayın durduruldu." });
    } else {
      return res.json({ success: false, message: "Yayın zaten aktif değil." });
    }
  } catch (error) {
    console.error("Yayın durdurma hatası:", error);
    return res.status(500).json({ success: false, message: "Yayın durdurulamadı." });
  }
});

function handleTrackEvent(e, peer) {
    try {
        senderStream = e.streams[0];
    } catch (error) {
        console.error("Error in handleTrackEvent:", error);
    }
}


// HTTPS Sunucusu
https.createServer(options, app).listen(3000, () => {
    console.log("Rehber sunucusu çalışıyor: https://192.168.4.1:3000");
});
