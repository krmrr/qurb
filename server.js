const https = require("https");
const http = require("http");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const webrtc = require("wrtc");
const cors = require("cors");
const path = require("path");
const fs = require('fs');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let senderStream;

const options = {
    key: fs.readFileSync("192.168.4.1-key.pem"),
    cert: fs.readFileSync("192.168.4.1.pem"),
};

app.set("view engine", "ejs"); // EJS'yi view engine olarak ayarlayın
app.set("views", __dirname + "/views"); // views klasörünü ayarla
app.use(express.static(__dirname + "/public"));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// HTTP üzerinden gelen istekler için
const httpApp = express();
httpApp.set("view engine", "ejs"); // EJS'yi view engine olarak ayarlayın
httpApp.set("views", __dirname + "/views"); // views klasörünü ayarla
httpApp.use(express.static(__dirname + "/public"));
httpApp.get("/", (req, res) => {
    res.render("index"); // views/index.ejs dosyasını render eder
});

app.use(cors());
httpApp.use(cors());

// HTTPS üzerinden çalışan rotalar
app.get("/broadcast", (req, res) => {
    res.render("rehber"); // views/rehber.ejs dosyasını render eder
});

httpApp.get("/check-pin", (req, res) => {
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


httpApp.post("/consumer", async ({body}, res) => {
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
        res.status(500).json({error: "Failed to create consumer connection."});
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
