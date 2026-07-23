module.exports = {
    uiPort: process.env.PORT || 1880,
    mqttReconnectTime: 15000,
    serialReconnectTime: 15000,
    debugMaxLength: 1000,
    flowFile: 'flows.json',
    flowFilePretty: true,
    credentialSecret: false,
    userDir: '/data',
    // Node-RED custom_nodes altındaki tüm paketleri otomatik tarar ve yükler
    // nodesDir: '/data/custom_nodes/node-red-contrib-gadget-ivr',

    adminAuth: {
        type: "credentials",
        users: [{
            username: "admin",
            password: "$2b$08$O1XkhGtCAiJljBCmS1h/Yumn0LEDJBiNMmnqB5foh3oZRKwpmI2n2",
            permissions: "*"
        }]
    },

    editorTheme: {
        page: {
            title: "Gadget IVR"
        },
        header: {
            title: "Gadget IVR Engine",
            url: "https://github.com"
        },
        projects: {
            enabled: false
        }
    },

    logging: {
        console: {
            level: "info",
            metrics: false,
            audit: false
        }
    }
};
