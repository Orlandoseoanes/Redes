const config = require("../config");
const express = require('express');
const morgan = require('morgan');
const app = express();


const createError = require('http-errors');
const cors = require('cors');
const path = require('path');
/////////

const routerRedes =require ('../router/routerRedes');


app.use(morgan("dev"));
app.get('/', (req, res) => {
    res.send('express');
});
app.use(express.json());
app.use('/MEDIA', express.static(path.join(__dirname, 'MEDIA')));
app.use(cors(config.application.cors.server));



app.use("/API/V2", routerRedes); // Corrected mounting paths






module.exports = app;
