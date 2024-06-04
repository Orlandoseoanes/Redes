const config = {
    application: {
        cors: {
            server: [
                {
                    origin: "http://localhost:3002", // Reemplaza con la URL de tu aplicación frontend
                    credentials: true
                }
            ]
        }
    }
}

module.exports = config;
