const http = require('http');

module.exports = function(RED) {
    function GenerateMediaNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.model = config.model || "tr_TR-eren-medium";
        node.filename = config.filename || "output.wav";

        node.on('input', function(msg) {
            const textToSynthesize = msg.payload || config.text;

            if (!textToSynthesize) {
                node.error("Sese dönüştürülecek metin (payload) bulunamadı!", msg);
                return;
            }

            node.status({fill: "yellow", shape: "dot", text: "Metin sese dönüştürülüyor..."});

            const postData = JSON.stringify({
                text: textToSynthesize,
                model: node.model,
                filename: node.filename
            });

            const options = {
                hostname: 'piper-tts',
                port: 5000,
                path: '/api/tts',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const response = JSON.parse(data);
                            msg.payload = response.file_path; // Üretilen WAV yolunu out olarak verir
                            msg.tts_details = response;
                            node.status({fill: "green", shape: "dot", text: "Ses başarıyla üretildi"});
                            node.send(msg);
                        } catch (e) {
                            node.error("JSON parse hatası: " + e.message, msg);
                            node.status({fill: "red", shape: "ring", text: "Parse Hatası"});
                        }
                    } else {
                        node.error(`Piper API Hatası [${res.statusCode}]: ${data}`, msg);
                        node.status({fill: "red", shape: "ring", text: "API Hatası"});
                    }
                });
            });

            req.on('error', (e) => {
                node.error("Piper TTS Servisine erişilemedi: " + e.message, msg);
                node.status({fill: "red", shape: "ring", text: "Bağlantı Hatası"});
            });

            req.write(postData);
            req.end();
        });
    }

    RED.nodes.registerType("generate-media", GenerateMediaNode);
};
