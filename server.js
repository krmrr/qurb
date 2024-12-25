const https = require("https");
const http = require("http");
const fs = require("fs");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const webrtc = require("wrtc");

let senderStream;

const options = {
  key: fs.readFileSync("192.168.4.1-key.pem"),
  cert: fs.readFileSync("192.168.4.1.pem"),
};

app.set("view engine", "ejs"); // EJS'yi view engine olarak ayarlayın
app.set("views", __dirname + "/views"); // views klasörünü ayarla
app.use(express.static(__dirname + "/public"));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// HTTP üzerinden gelen istekler için
const httpApp = express();
httpApp.get("/", (req, res) => {
  res.render("index"); // views/index.ejs dosyasını render eder
});

// HTTPS üzerinden çalışan rotalar
app.get("/rehber", (req, res) => {
  res.render("rehber"); // views/rehber.ejs dosyasını render eder
});

app.post("/consumer", async ({ body }, res) => {
  try {
    const peer = new webrtc.RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:127.0.0.1:3478", // STUN sunucu adresi
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

    const payload = {
      sdp: peer.localDescription,
    };

    res.json(payload);
  } catch (error) {
    console.error("Error in /consumer:", error);
    res.status(500).json({ error: "Failed to create consumer connection." });
  }
});

app.post("/broadcast", async ({ body }, res) => {
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
    res.status(500).json({ error: "Failed to create broadcast connection." });
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

// HTTP Sunucusu
http.createServer(httpApp).listen(8080, () => {
  console.log("Dinleyici sunucusu çalışıyor: http://192.168.4.1:8080");
});
