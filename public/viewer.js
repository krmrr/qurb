// Pin doğrulama fonksiyonu
function checkPin() {
    const userPin = prompt("Please enter the PIN:");

    if (!userPin) {
        alert("PIN is required!");
        return false;
    }

    // PIN doğrulama için backend'e istek atıyoruz
    axios.get('http://live.qurb:8080/check-pin', {
        params: {
            pin: userPin
        }
    })
        .then(response => {
            if (response.data.valid) {
                // PIN doğru ise siteyi aç
                document.body.style.display = 'block';  // Sayfayı görünür yap
            } else {
                // PIN yanlış ise uyarı göster
                alert("Invalid PIN!");
                window.location.reload(); // Hatalı giriş sonrası sayfayı yenile
            }
        })
        .catch(error => {
            console.error("Error verifying PIN:", error.response);

            const errorMessage = error.response ? error.response.data : error.message;
            alert("Error verifying PIN: " + errorMessage);

            alert("Error verifying PIN." + errorMessage);
        });
}




window.onload = () => {
    let isStreamActive = false; // Yayın durumunu kontrol etmek için flag
    let peer = null; // Peer nesnesi için global bir değişken

    document.body.style.display = 'none';  // Sayfayı başlangıçta gizle
    checkPin();

    const toggleStream = () => {
        if (isStreamActive) {
            stopStream();
        } else {
            init();
        }
    };

    document.getElementById("my-button").onclick = toggleStream;

    async function init() {
        if (peer) {
            console.log("Zaten bir peer bağlantısı var.");
            return; // Eğer peer zaten varsa, yeni bir bağlantı başlatma
        }

        document.getElementById("my-button").innerHTML = `<i class="las la-pause"></i>`;

        peer = createPeer(); // Peer nesnesini başlat
        peer.addTransceiver("audio", {direction: "recvonly"}); // Only receive audio
    }

    function createPeer() {
        const peer = new RTCPeerConnection({
            iceServers: [
                {
                    urls: "stun:192.168.4.1:3478",
                },
            ],
        });

        peer.ontrack = handleTrackEvent;
        peer.onnegotiationneeded = () => handleNegotiationNeededEvent(peer);
        peer.onconnectionstatechange = () => handleConnectionStateChange(peer);

        return peer;
    }

    async function handleNegotiationNeededEvent(peer) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        const payload = {
            sdp: peer.localDescription,
        };

        const {data} = await axios.post("http://192.168.4.1:8080/consumer", payload);

        const desc = new RTCSessionDescription(data.sdp);
        peer.setRemoteDescription(desc).catch((e) => console.log(e));
    }

    function handleTrackEvent(e) {
        const audioElement = document.getElementById("audio");
        audioElement.srcObject = e.streams[0]; // Set stream to audio element

        isStreamActive = true; // Yayın başladı
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const dataArray = new Uint8Array(256);

        const sourceNode = audioContext.createMediaStreamSource(e.streams[0]);
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);


        // Animasyonu başlat
        animate(analyser, dataArray);
    }

    function handleConnectionStateChange(peer) {
        if (peer.connectionState === "disconnected" || peer.connectionState === "failed") {
            stopStream(); // Yayın kesildi
        }
    }

    function animate(analyser, dataArray) {
        if (!isStreamActive) {
            // Eğer yayın yoksa animasyonu durdur
            document.getElementById("circle").style.transform = "scale(1) rotate(0deg)"; // Çemberi sıfırla
            return; // Döngüyü sonlandır
        }

        analyser.getByteFrequencyData(dataArray);

        // Sesin gücüne bağlı olarak yuvarlağı büyütme/küçültme
        const averageFrequency = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const scale = 1 + averageFrequency / 128; // Ses şiddetiyle scale değeri belir

        // Çemberin büyüyüp küçülmesi ve dönmesi
        const rotation = averageFrequency * 0.1; // Sesin şiddetine göre dönüş açısı
        document.getElementById("circle").style.transform = `scale(${scale}) rotate(${rotation}deg)`;
        // Dalgaları çiz
        drawCircles();
        requestAnimationFrame(() => animate(analyser, dataArray));
    }

    const canvas = document.getElementById("siriCanvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 200;
    canvas.height = 200;

    let circles = [];

    // Siri benzeri ışık dalgaları oluştur
    function createCircle() {
        return {
            x: canvas.width / 2,
            y: canvas.height / 2,
            radius: Math.random() * 15 + 35, // Yarıçapı küçültmek için 50 yerine 35 ile 50 arasında ayarladım
            color: `hsla(${Math.random() * 360}, 100%, 50%, 0.6)`,
            angle: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.05 + 0.02
        };
    }

    function initCircles() {
        circles = [];
        for (let i = 0; i < 6; i++) { // 6 ışıklı dalga
            circles.push(createCircle());
        }
    }

    function drawCircles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.globalCompositeOperation = "lighter"; // Renkleri karıştır
        circles.forEach((circle) => {
            circle.angle += circle.speed;

            const offsetX = Math.cos(circle.angle) * 30;
            const offsetY = Math.sin(circle.angle) * 30;

            ctx.beginPath();
            ctx.arc(circle.x + offsetX, circle.y + offsetY, circle.radius, 0, Math.PI * 2);
            ctx.fillStyle = circle.color;
            ctx.fill();
        });
    }

    function stopStream() {
        // Yayın yoksa durumunu güncelle
        isStreamActive = false;
        if (peer) {
            document.getElementById("my-button").innerHTML = `<i class="las la-play"></i>`;
            peer.close(); // Peer bağlantısını kapat
            peer = null; // Peer nesnesini sıfırla
        }
    }

    // Başlat
    initCircles();
    drawCircles();

};


// Wake Lock'u etkinleştirme fonksiyonu
async function requestWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request("screen");
        console.log("Wake Lock etkinleştirildi.");

        // Wake Lock serbest bırakıldığında yeniden başlatmak için dinleyici
        wakeLock.addEventListener("release", () => {
            console.log("Wake Lock serbest bırakıldı. Yeniden talep ediliyor...");
            requestWakeLock(); // Serbest bırakıldığında yeniden etkinleştir
        });
    } catch (err) {
        console.error("Wake Lock etkinleştirilemedi:", err);
    }
}

let wakeLock = null;

// Sayfa ilk yüklendiğinde Wake Lock'u etkinleştir
if ("wakeLock" in navigator) {
    requestWakeLock();
} else {
    console.warn("Wake Lock API bu tarayıcıda desteklenmiyor.");
}

// Tarayıcı sekmesi gizlendiğinde veya görünür olduğunda Wake Lock'u kontrol et
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !wakeLock) {
        console.log("Sekme yeniden görünür oldu. Wake Lock talep ediliyor...");
        requestWakeLock();
    }
});

