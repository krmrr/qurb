// Pin doğrulama fonksiyonu
function checkPin() {
    // const userPin = prompt("Please enter the PIN:");
    //
    // if (!userPin) {
    //     alert("PIN is required!");
    //     return false;
    // }
    //
    // // PIN doğrulama için backend'e istek atıyoruz
    // axios.get('https://live.qurb/check-pin', {
    //     params: {
    //         pin: userPin
    //     }
    // })
    //     .then(response => {
    //         if (response.data.valid) {
    //             // PIN doğru ise siteyi aç
    //             document.body.style.display = 'block';  // Sayfayı görünür yap
    //         } else {
    //             // PIN yanlış ise uyarı göster
    //             alert("Invalid PIN!");
    //             window.location.reload(); // Hatalı giriş sonrası sayfayı yenile
    //         }
    //     })
    //     .catch(error => {
    //         console.error("Error verifying PIN:", error.response);
    //
    //         const errorMessage = error.response ? error.response.data : error.message;
    //         alert("Error verifying PIN: " + errorMessage);
    //
    //         alert("Error verifying PIN." + errorMessage);
    //     });

    document.body.style.display = 'block';
}


// Yayın durumunu kontrol eden fonksiyon
function checkBroadcastStatus() {
    const playButton = document.getElementById("my-button");

    // Düzenli olarak yayın durumunu kontrol et
    setInterval(() => {
        axios.get('https://live.qurb/broadcast-status')
            .then(response => {
                if (response.data.isActive) {
                    enablePlayButton();
                } else {
                    disablePlayButton();
                }
            })
            .catch(error => {
                console.log("Yayın durumu kontrol edilemedi:", error);
                disablePlayButton();
            });
    }, 3000); // Her 3 saniyede bir kontrol et
}

// Play butonunu etkinleştir
function enablePlayButton() {
    const playButton = document.getElementById("my-button");
    playButton.disabled = false;
    playButton.classList.remove('disabled');
    playButton.style.opacity = '1';
    playButton.style.cursor = 'pointer';
}

// Play butonunu devre dışı bırak
function disablePlayButton() {
    const playButton = document.getElementById("my-button");
    const isStreamActive = playButton.innerHTML.includes('pause');

    if (!isStreamActive) {
        playButton.disabled = true;
        playButton.classList.add('disabled');
        playButton.style.opacity = '0.5';
        playButton.style.cursor = 'not-allowed';
    }
}

window.onload = () => {
    let isStreamActive = false;
    let peer = null;

    document.body.style.display = 'none';
    checkPin();

    // Başlangıçta butonu devre dışı bırak
    disablePlayButton();

    const toggleStream = () => {
        const playButton = document.getElementById("my-button");

        // Buton devre dışıysa işlem yapma
        if (playButton.disabled || playButton.classList.contains('disabled')) {
            alert("Şu anda aktif bir yayın bulunmuyor. Lütfen yayının başlamasını bekleyin.");
            return;
        }

        if (isStreamActive) {
            stopStream();
        } else {
            init();
        }
    };

    document.getElementById("my-button").onclick = toggleStream;

    // Geri kalan kodlarınız aynı kalacak...
    async function init() {
        if (peer) {
            console.log("Zaten bir peer bağlantısı var.");
            return;
        }

        document.getElementById("my-button").innerHTML = `<i class="las la-pause"></i>`;
        peer = createPeer();
        peer.addTransceiver("audio", {direction: "recvonly"});
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

        const {data} = await axios.post("https://live.qurb/consumer", payload);
        const desc = new RTCSessionDescription(data.sdp);
        peer.setRemoteDescription(desc).catch((e) => console.log(e));
    }

    function handleTrackEvent(e) {
        const audioElement = document.getElementById("audio");
        audioElement.srcObject = e.streams[0];

        isStreamActive = true;
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const dataArray = new Uint8Array(256);

        const sourceNode = audioContext.createMediaStreamSource(e.streams[0]);
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);

        animate(analyser, dataArray);
    }

    function handleConnectionStateChange(peer) {
        if (peer.connectionState === "disconnected" || peer.connectionState === "failed") {
            stopStream();
        }
    }

    function animate(analyser, dataArray) {
        if (!isStreamActive) {
            document.getElementById("circle").style.transform = "scale(1) rotate(0deg)";
            return;
        }

        analyser.getByteFrequencyData(dataArray);
        const averageFrequency = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const scale = 1 + averageFrequency / 128;
        const rotation = averageFrequency * 0.1;
        document.getElementById("circle").style.transform = `scale(${scale}) rotate(${rotation}deg)`;

        drawCircles();
        requestAnimationFrame(() => animate(analyser, dataArray));
    }

    const canvas = document.getElementById("siriCanvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 200;
    canvas.height = 200;

    let circles = [];

    function createCircle() {
        return {
            x: canvas.width / 2,
            y: canvas.height / 2,
            radius: Math.random() * 15 + 35,
            color: `hsla(${Math.random() * 360}, 100%, 50%, 0.6)`,
            angle: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.05 + 0.02
        };
    }

    function initCircles() {
        circles = [];
        for (let i = 0; i < 6; i++) {
            circles.push(createCircle());
        }
    }

    function drawCircles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "lighter";
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
        isStreamActive = false;
        if (peer) {
            document.getElementById("my-button").innerHTML = `<i class="las la-play"></i>`;
            peer.close();
            peer = null;
        }
        // Stream durduktan sonra buton durumunu tekrar kontrol et
        setTimeout(checkBroadcastStatus, 1000);
    }

    initCircles();
    drawCircles();
};

// Wake Lock kodları aynı kalacak...
async function requestWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request("screen");
        console.log("Wake Lock etkinleştirildi.");
        wakeLock.addEventListener("release", () => {
            console.log("Wake Lock serbest bırakıldı. Yeniden talep ediliyor...");
            requestWakeLock();
        });
    } catch (err) {
        console.error("Wake Lock etkinleştirilemedi:", err);
    }
}

let wakeLock = null;

if ("wakeLock" in navigator) {
    requestWakeLock();
} else {
    console.warn("Wake Lock API bu tarayıcıda desteklenmiyor.");
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !wakeLock) {
        console.log("Sekme yeniden görünür oldu. Wake Lock talep ediliyor...");
        requestWakeLock();
    }
});

